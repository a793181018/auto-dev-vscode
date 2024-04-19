import vscode from "vscode";
import { IdentifierBlockRange } from "../document/IdentifierBlockRange";
import { LANGUAGE_BLOCK_COMMENT_MAP } from "../language/LanguageCommentMap";
import { TemplateContext } from "../../prompt-manage/template/TemplateContext";
import { ActionType, PromptManager } from "../../prompt-manage/PromptManager";
import { LlmProvider } from "../../llm-provider/LlmProvider";
import { ChatMessage, ChatRole } from "../../llm-provider/ChatMessage";
import { insertCodeByRange, selectCodeInRange } from "../editor";
import { AutoDevStatus, AutoDevStatusManager } from "../editor-api/AutoDevStatusManager";
import { FencedCodeBlock } from "../../markdown/FencedCodeBlock";
import { ChatCreationContext } from "../../chat-context/ChatContextProvider";

export interface AutoDocContext extends TemplateContext {
	language: string;
	startSymbol: string;
	endSymbol: string;
	code: string;
	forbiddenRules: string[];
}

export class AutoDocAction {
	private document: vscode.TextDocument;
	private range: IdentifierBlockRange;
	private edit: vscode.WorkspaceEdit;
	private language: string;

	constructor(document: vscode.TextDocument, range: IdentifierBlockRange, edit: vscode.WorkspaceEdit) {
		this.document = document;
		this.range = range;
		this.edit = edit;
		this.language = document.languageId;
	}

	async execute() {
		const startSymbol = LANGUAGE_BLOCK_COMMENT_MAP[this.language].start;
		const endSymbol = LANGUAGE_BLOCK_COMMENT_MAP[this.language].end;

		const templateContext: AutoDocContext = {
			language: this.language,
			startSymbol: startSymbol,
			endSymbol: endSymbol,
			code: this.document.getText(this.range.blockRange),
			forbiddenRules: [],
		};

		const creationContext: ChatCreationContext = {
			action: "AutoDocAction",
			filename: this.document.fileName,
			language: this.language,
		};

		const contextItems = await PromptManager.getInstance().chatContext(creationContext);
		console.log(contextItems)
		if(contextItems.length > 0) {
			templateContext.chatContext = contextItems.map(item => item.text).join("\n - ");
		}

		console.log(templateContext.chatContext);

		let content = await PromptManager.getInstance().build(ActionType.AutoDoc, templateContext);
		console.info(`request: ${content}`);

		let msg: ChatMessage = {
			role: ChatRole.User,
			content: content
		};

		AutoDevStatusManager.instance.setStatusBar(AutoDevStatus.InProgress);
		let llm = LlmProvider.instance();
		let doc: string = "";

		try {
			for await (const chunk of llm._streamChat([msg])) {
				doc += chunk.content;
			}
		} catch (e) {
			console.error(e);
			AutoDevStatusManager.instance.setStatusBar(AutoDevStatus.Error);
			return;
		}

		AutoDevStatusManager.instance.setStatusBar(AutoDevStatus.Done);
		console.info(`result: ${doc}`);

		const output = FencedCodeBlock.parse(doc).text;

		selectCodeInRange(this.range.blockRange.start, this.range.blockRange.end);
		insertCodeByRange(this.range.blockRange.start, output);
	}
}
