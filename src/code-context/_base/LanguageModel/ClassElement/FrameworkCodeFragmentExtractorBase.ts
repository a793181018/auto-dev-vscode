import { is } from 'node_modules/cheerio/dist/commonjs/api/traversing';
import { ElementBase } from 'src/code-context/_base/LanguageModel/ClassElement/ElementBase';
import { Point, SyntaxNode } from 'web-tree-sitter';

import { IDataStorage } from 'base/common/workspace/WorkspaceService';

type DocDealCallback = (result: string) => string;
export abstract class FrameworkCodeFragmentExtractorBase {
	public static readonly LanguageSupport: Set<string> = new Set<string>(['csharp']);
	protected frameworkCodeFragmentNode: SyntaxNode;
	protected filePath: string;
	constructor(frameworkCodeFragmentNode: SyntaxNode, filePath: string) {
		this.frameworkCodeFragmentNode = frameworkCodeFragmentNode;
		this.filePath = filePath;
	}
	public abstract ExtractFrameworkCodeFragment(): FrameworkCodeFragmentExtractorBase;
}

export class FrameworkCodeFragment extends FrameworkCodeFragmentExtractorBase  implements IDataStorage {
	public ExtractFrameworkCodeFragment(): FrameworkCodeFragment {
		throw new Error('Method not implemented.');
	}
	id: number = -1;
	doc: string = '';
	code: string = '';
	codeContext: string = '';
	filePath: string = '';
	 constructor(
		frameworkCodeFragmentNode: SyntaxNode,
		code: string,
		codeContext: string,
		filePath: string,
		docDealCallback?: DocDealCallback,
	) {
		super(frameworkCodeFragmentNode, filePath);
		this.codeContext = codeContext;
		if (frameworkCodeFragmentNode.previousSibling) {
			let dataTemp = this.Getcommits(frameworkCodeFragmentNode.previousSibling, []);
			if (docDealCallback == undefined) {
				this.doc = dataTemp.toString();
			} else {
				let dataTemp1 = dataTemp.reverse();
				this.doc = docDealCallback(dataTemp1.toString());
			}
		} else {
			this.doc = '';
		}

		if (frameworkCodeFragmentNode.type == 'class_declaration') {
			let root = frameworkCodeFragmentNode.tree.rootNode;
			let needDeleteNodes: SyntaxNode[] = [];
			for (let i = 0; i < root.children.length; i++) {
				switch (root.children[i].type) {
					case 'using_directive':
						needDeleteNodes.push(root.children[i]);
						break;
					case 'declaration_list':
						let declarationList = root.children[i];
						let commitNodes: SyntaxNode[] = [];
						for (let j = 0; j < declarationList.children.length; j++) {
							if (declarationList.children[j].type == 'class_declaration') {
								let dataTemp = declarationList.children[j];
								while (dataTemp.previousSibling) {
									if (dataTemp.previousSibling.type == 'comment') {
										commitNodes.push(dataTemp.previousSibling);
										dataTemp = dataTemp.previousSibling;
									} else {
										break;
									}
								}
								needDeleteNodes.push(declarationList.children[j]);
								commitNodes.length = 0;
							}
						}
						break;
					case 'namespace_declaration':
						for (let j = 0; j < root.children[i].children.length; j++) {
							if (root.children[i].children[j].type == 'declaration_list') {
								const declarationList = root.children[i].children[j];
								for (let k = 0; k < declarationList.children.length; k++) {
									if (declarationList.children[k].type == 'class_declaration') {
										let dataTemp = declarationList.children[k];
										if (dataTemp.text != frameworkCodeFragmentNode.text) {
											while (dataTemp.previousSibling) {
												if (dataTemp.previousSibling.type == 'comment') {
													needDeleteNodes.push(dataTemp.previousSibling);
													dataTemp = dataTemp.previousSibling;
												} else {
													break;
												}
											}
											needDeleteNodes.push(declarationList.children[k]);
										}
									}
								}
							}
						}

						for (let i = 0; i < frameworkCodeFragmentNode.children.length; i++) {
							if (frameworkCodeFragmentNode.children[i].type == 'declaration_list') {
								let declarationList = frameworkCodeFragmentNode.children[i];
								for (let j = 0; j < declarationList.children.length; j++) {
									if (
										declarationList.children[j].type == 'method_declaration' ||
										declarationList.children[j].type == 'field_declaration' ||
										declarationList.children[j].type == 'constructor_declaration'
									) {
										let node = declarationList.children[j];
										let body: SyntaxNode | undefined = undefined;
										let isPublic: boolean = false;
										for (let k = 0; k < node.children.length; k++) {
											let nodeChild = node.children[k];
											if (nodeChild.type == 'modifier') {
												if (nodeChild.text == 'public') {
													isPublic = true;
												}
											}
											if ((nodeChild.type == 'block' || nodeChild.type == 'arrow_expression_clause') && isPublic) {
												body = node.children[k];
											}
										}
										if (!isPublic) {
											let previousSibling = node.previousSibling;
											while (previousSibling) {
												if (previousSibling.type == 'comment') {
													needDeleteNodes.push(previousSibling);
													previousSibling = previousSibling.previousSibling;
												} else {
													break;
												}
											}
											needDeleteNodes.push(node);
										} else if (body) {
											needDeleteNodes.push(body);
										}
									} else if (
										declarationList.children[j].type == 'property_declaration' ||
										declarationList.children[j].type == 'indexer_declaration'
									) {
										let node = declarationList.children[j];
										let isPublic = false;
										for (let k = 0; k < node.children.length; k++) {
											let nodeChild = node.children[k];
											if (nodeChild.type == 'modifier') {
												if (nodeChild.text == 'public') {
													isPublic = true;
												}
											}
											if (nodeChild.type == 'accessor_list' && isPublic) {
												for (let l = 0; l < nodeChild.children.length; l++) {
													if (nodeChild.children[l].type == 'accessor_declaration') {
														let accessorNode = nodeChild.children[l];
														let propertyAccessorIsPublic = true;
														for (let m = 0; m < accessorNode.children.length; m++) {
															let accessorNodeChild = accessorNode.children[m];
															if (accessorNodeChild.type == 'modifier') {
																if (accessorNodeChild.text != 'public') {
																	propertyAccessorIsPublic = false;
																} else {
																	propertyAccessorIsPublic = true;
																}
															}
															if (accessorNodeChild.type == 'block' && propertyAccessorIsPublic) {
																needDeleteNodes.push(accessorNodeChild);
															}
														}
														if (!propertyAccessorIsPublic) {
															needDeleteNodes.push(accessorNode);
														}
													}
												}
											}
											if (nodeChild.type == 'arrow_expression_clause' && isPublic) {
												needDeleteNodes.push(nodeChild);
											}
										}
									}
								}
							}
						}

						needDeleteNodes.sort((a, b) => a.startIndex - b.startIndex);
						let newString = frameworkCodeFragmentNode.text;

						// 计算删除范围并删除节点内容
						let treeSitterContentModifier = new TreeSitterContentModifier(frameworkCodeFragmentNode.tree.rootNode, frameworkCodeFragmentNode);
						let result = treeSitterContentModifier.removeChildContent(needDeleteNodes);
						this.code = result;
				}
			}
		} else {
			this.code = code;
		}
		this.filePath = filePath;
	}
	equals(other: FrameworkCodeFragment): boolean {
		// if (!(other instanceof FrameworkCodeFragment)) {
		// 	return false;
		// }
		if (other.code === this.code && other.filePath === this.filePath) {
			return true;
		}

		return false;
	}
	GetType(): string {
		return FrameworkCodeFragment.name.toString();
	}
	protected Getcommits(node: SyntaxNode, commits: string[]): string[] {
		if (node.type === 'comment') {
			commits.push(node.text);
			if (node.previousSibling) {
				return this.Getcommits(node.previousSibling, commits);
			} else {
				return commits;
			}
		} else {
			return commits;
		}
	}
	public static DeserializationFormJson(data: any): FrameworkCodeFragment {
		let frameworkCodeFragment = new FrameworkCodeFragment(data.code, data.code, data.codeContext, data.filePath);
		frameworkCodeFragment.code = data.code;
		frameworkCodeFragment.doc = data.doc;
		frameworkCodeFragment.filePath = data.filePath;
		frameworkCodeFragment.codeContext = data.codeContext;
		return frameworkCodeFragment;
	}
	public static DeserializationFormSql(data: any): FrameworkCodeFragment {
		let frameworkCodeFragment = new FrameworkCodeFragment(data.code, data.code, data.codeContext, data.filePath);
		frameworkCodeFragment.code = data.code;
		frameworkCodeFragment.doc = data.doc;
		frameworkCodeFragment.filePath = data.filePath;
		frameworkCodeFragment.codeContext = data.codeContext;
		frameworkCodeFragment.id = data.id;
		return frameworkCodeFragment;
	}
}
class TreeSitterContentModifier {
	private root: SyntaxNode;
	private node: SyntaxNode;

	constructor(root: SyntaxNode, node: SyntaxNode ) {
		this.root = root;
		this.node = node;

	}

	public removeChildContent(children: SyntaxNode[]): string {
		let rootContent = this.node.text;
		let nodeOffSet=this.node.startIndex;

		// 对子节点按 startIndex 进行排序，确保从后往前移除内容
		children.sort((a, b) => b.startIndex - a.startIndex);

		// 从后往前移除子节点的内容
		for (let i = 0; i < children.length; i++) {
			if((children[i].startIndex < this.node.startIndex&& children[i].endIndex < this.node.startIndex)||children[i].startIndex > this.node.endIndex){
				continue;
			}

			let childStartIndex = children[i].startIndex-nodeOffSet;
			let childEndIndex = children[i].endIndex-nodeOffSet;
			let child = children[i];
			let previousNode = child.previousSibling;
			let previousEndIndex = (previousNode ? previousNode.endIndex : 0)-nodeOffSet;

			while (childStartIndex < rootContent.length && /\s/.test(rootContent[childEndIndex])) {
				childEndIndex++;
			}

			// 检查是否满足替换条件
			if (child.parent && child.parent.type === 'accessor_declaration' && child.type === 'block') {

				const char = rootContent.charAt(previousEndIndex);
				let previousOffSetEndIndex=previousEndIndex;
				if (char == '\t') {
					previousOffSetEndIndex = previousEndIndex - 1;
				}
				rootContent = rootContent.slice(0, previousOffSetEndIndex) + ';\n\t\t' + rootContent.slice(childEndIndex);
			} else if (child.parent && child.type === 'arrow_expression_clause') {
				if (child.parent.type === 'property_declaration' || child.parent.type == 'indexer_declaration') {
					// 删除上一个节点到当前节点之间的内容，并替换为 "{ get; }"
					rootContent = rootContent.slice(0, previousEndIndex) + '{ get; }\n' + rootContent.slice(childEndIndex);
				}else if (child.parent.type === 'method_declaration') {
					const char = rootContent.charAt(previousEndIndex);
					let previousOffSetEndIndex=previousEndIndex;
					if (char == '\t') {
						previousOffSetEndIndex = previousEndIndex - 1;
					}
					rootContent = rootContent.slice(0, previousOffSetEndIndex) + rootContent.slice(childEndIndex);
				}
				// 找到上一个节点的结束位置
			} else if (child.parent && child.parent.type === 'method_declaration') {
				if (child.type === 'block') {
					const char = rootContent.charAt(previousEndIndex);
					let previousOffSetEndIndex=previousEndIndex;
					if (char == '\t') {
						previousOffSetEndIndex = previousEndIndex - 1;
					}
					rootContent = rootContent.slice(0, previousOffSetEndIndex) + ';\n\t' + rootContent.slice(childEndIndex);
				}
			} else if (child.parent && child.type === 'field_declaration') {
				rootContent = rootContent.slice(0, previousEndIndex) +'\n\t' + rootContent.slice(childEndIndex);
			} else if (child.parent && child.parent.type === 'constructor_declaration' && child.type === 'block') {
				const char = rootContent.charAt(previousEndIndex);
				let previousOffSetEndIndex=previousEndIndex;
				if (char == '\t') {
					previousOffSetEndIndex = previousEndIndex - 1;
				}
				rootContent = rootContent.slice(0, previousOffSetEndIndex) + ';\n\t' + rootContent.slice(childEndIndex);
			 }
			else{
				// 一次性删除计算出的完整范围
				rootContent = rootContent.slice(0, childStartIndex) + rootContent.slice(childEndIndex);
			}
		}
		return rootContent;
	}

	private escapeInvisibleChars(str: string): string {
		return str
			.replace(/ /g, '\\s') // 空格
			.replace(/\t/g, '\\t') // 制表符
			.replace(/\n/g, '\\n') // 换行符
			.replace(/\r/g, '\\r') // 回车符
			.replace(/\f/g, '\\f') // 换页符
			.replace(/\v/g, '\\v') // 垂直制表符
			.replace(/\0/g, '\\0'); // 空字符
	}
}
