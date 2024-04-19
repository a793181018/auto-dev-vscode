import vscode from "vscode";
import { NamedElementBlock } from "../../document/NamedElementBlock";
import { AutoDevExtension } from "../../../AutoDevExtension";

export interface ActionCreatorContext {
	ranges: NamedElementBlock[],
	range: vscode.Range | vscode.Selection,
	document: vscode.TextDocument,
	lang: string
}

export interface ActionCreator {
	build(extension: AutoDevExtension, context: ActionCreatorContext): Promise<vscode.CodeAction[]>;
}

