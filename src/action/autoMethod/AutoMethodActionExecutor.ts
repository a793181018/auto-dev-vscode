import fs from 'fs';
import { AutoDevExtension } from 'src/AutoDevExtension';
import { FrameworkCodeFragment } from 'src/code-context/_base/LanguageModel/ClassElement/FrameworkCodeFragmentExtractorBase';
import { MethodInfoBase } from 'src/code-context/_base/LanguageModel/ClassElement/MethodInfoBase';
import { ClassExtractorFactory } from 'src/code-context/_base/LanguageModel/ClassELementFactory/ClassExtarctorFactory';
import { MethodInfoFactory } from 'src/code-context/_base/LanguageModel/ClassELementFactory/MethodInfoFactory';
import { CsharpClassExtractor } from 'src/code-context/csharp/model/CsharpClassExtractor';
import { Position, TextDocument, WorkspaceEdit } from 'vscode';
import vscode from 'vscode';

import { ChatMessageRole, IChatMessage } from 'base/common/language-models/languageModels';
import { LanguageModelsService } from 'base/common/language-models/languageModelsService';
import { LANGUAGE_BLOCK_COMMENT_MAP } from 'base/common/languages/docstring';
import { log, logger } from 'base/common/log/log';
import { MarkdownTextProcessor } from 'base/common/markdown/MarkdownTextProcessor';
import { StreamingMarkdownCodeBlock } from 'base/common/markdown/StreamingMarkdownCodeBlock';

import { type NamedElement } from '../../editor/ast/NamedElement';
import {  selectCodeInRange } from '../../editor/ast/PositionUtil';
import { AutoDevStatus, AutoDevStatusManager } from '../../editor/editor-api/AutoDevStatusManager';
import { ActionType } from '../../prompt-manage/ActionType';
import { PromptManager } from '../../prompt-manage/PromptManager';
import { CreateToolchainContext } from '../../toolchain-context/ToolchainContextProvider';
import { ActionExecutor } from '../_base/ActionExecutor';
import { CodeSample } from '../addCodeSamples/AddCodeSampleExecutor';
import { AutoMethodTemplateContext } from './AutoMethodTemplateContext';

export class AutoMethodActionExecutor implements ActionExecutor {
	type: ActionType = ActionType.AutoDoc;
	public static readonly LanguageSupport: Set<string> = new Set<string>(['csharp']);
	private lm: LanguageModelsService;
	private promptManager: PromptManager;
	private statusBarManager: AutoDevStatusManager;

	private document: TextDocument;
	private range: NamedElement;
	private edit?: WorkspaceEdit;
	private language: string;
	private autodev: AutoDevExtension;

	constructor(autodev: AutoDevExtension, document: TextDocument, range: NamedElement, edit?: WorkspaceEdit) {
		this.lm = autodev.lm;
		this.promptManager = autodev.promptManager;
		this.statusBarManager = autodev.statusBarManager;

		this.document = document;
		this.range = range;
		this.edit = edit;
		this.language = document.languageId;
		this.autodev = autodev;
	}

	async execute() {
		const document = this.document;
		const range = this.range;
		const language = document.languageId;

		const startSymbol = LANGUAGE_BLOCK_COMMENT_MAP[language]!.start;
		const endSymbol = LANGUAGE_BLOCK_COMMENT_MAP[language]!.end;

		const classExtractor = ClassExtractorFactory.createInstance(language, range.node.parent?.parent!);
		const classInfo = classExtractor.ExtractClass();
		let selectGroup = this.autodev.workSpace.DataStorageGroupManager?.GetSelectedGroup();
		let codeSampleIds = selectGroup?.get(CodeSample.name);
		let codeSamples: CodeSample[] = [];
		let customFrameworkCodeFragments: FrameworkCodeFragment[] = [];
		let customFrameworkCodeFragmentIds = selectGroup?.get(FrameworkCodeFragment.name);
		if (customFrameworkCodeFragmentIds != undefined) {
			customFrameworkCodeFragments = this.autodev.workSpace.GetDataStoragesByIds(
				language,
				FrameworkCodeFragment.name,
				customFrameworkCodeFragmentIds,
			) as FrameworkCodeFragment[];
		}
		if (codeSampleIds != undefined) {
			codeSamples = this.autodev.workSpace.GetDataStoragesByIds(
				language,
				CodeSample.name,
				codeSampleIds,
			) as CodeSample[];
		}
		let needCompletedMethud = MethodInfoFactory.createInstance(language, range.node);
		const templateContext: AutoMethodTemplateContext = {
			language: language,
			startSymbol: startSymbol,
			needCompleteMethod: needCompletedMethud,
			endSymbol: endSymbol,
			code: document.getText(range.blockRange),
			forbiddenRules: [],
			classInfo: classInfo,
			customFrameworkCodeFragments: customFrameworkCodeFragments,
			codeSamples: codeSamples,
		};

		this.statusBarManager.setStatus(AutoDevStatus.InProgress);

		selectCodeInRange(range.blockRange.start, range.blockRange.end);
		if (range.commentRange) {
			selectCodeInRange(range.commentRange.start, range.commentRange.end);
		}

		const creationContext: CreateToolchainContext = {
			action: 'AutoMethodAction',
			filename: document.fileName,
			language: language,

			content: document.getText(),
			element: range,
		};

		const contextItems = await this.promptManager.collectToolchain(creationContext);
		if (contextItems.length > 0) {
			templateContext.chatContext = contextItems.map(item => item.text).join('\n - ');
		}

		let content = await this.promptManager.generateInstruction(ActionType.AutoMethod, templateContext);
		log(`request: ${content}`);
		logger.info(`输入LLM推理数据:\n ${content}`);
		console.log(`输入LLM推理数据:\n ${content}`);
		let msg: IChatMessage = {
			role: ChatMessageRole.User,
			content: content,
		};

		try {
			const doc = await this.lm.chat([msg], {});

			this.statusBarManager.setStatus(AutoDevStatus.Done);
			const finalText = StreamingMarkdownCodeBlock.parse(doc).text;

			log(`FencedCodeBlock parsed output: ${finalText}`);
			logger.info(`输出LLM推理结果: \n ${finalText}`);
			console.log(`输出LLM推理结果: \n ${finalText}`);

        const generatedCodeBlock = finalText;
        const codeToReplace = `${startSymbol}\n${generatedCodeBlock}\n${endSymbol}`;

        // 获取替换的范围
        const startPosition = new Position(range.blockRange.start.line, range.blockRange.start.character);
        const endPosition = new Position(range.blockRange.end.line, range.blockRange.end.character);

        // 创建 WorkspaceEdit 对象
        const edit = new WorkspaceEdit();
        edit.replace(document.uri, new vscode.Range(startPosition, endPosition), codeToReplace);

        // 应用替换
        await vscode.workspace.applyEdit(edit);
		} catch (e) {
			console.error(e);
			this.statusBarManager.setStatus(AutoDevStatus.Error);
			return;
		}
	}
}
