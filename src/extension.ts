import { BuildConfig } from "@markw65/monkeyc-optimizer";
import * as fs from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";
import { MonkeyCCompletionItemProvider } from "./completion-provider";
import {
  baseDebugConfig,
  OptimizedMonkeyCDebugConfigProvider,
} from "./debug-config-provider";
import { MonkeyCDefinitionProvider } from "./definition-provider";
import { MonkeyCFomattingEditProvider } from "./format-provider";
import { MonkeyCHoverProvider } from "./hover-provider";
import { MonkeyCLinkProvider } from "./link-provider";
import {
  currentWorkspace,
  findProject,
  getOptimizerBaseConfig,
  initializeProjectManager,
} from "./project-manager";
import { MonkeyCRenameRefProvider } from "./rename-provider";
import { MonkeyCSignatureProvider } from "./signature-provider";
import { MonkeyCSymbolProvider } from "./symbol-provider";
import { OptimizedMonkeyCBuildTaskProvider } from "./task-provider";

export let diagnosticCollection: vscode.DiagnosticCollection | null = null;
export let extensionVersion: string | null = null;

// this method is called when the extension is activated
// which (as currently configured) is the first time a .mc file is opened.
export async function activate(context: vscode.ExtensionContext) {
  extensionVersion = context.extension.packageJSON.version;

  const renameRefProvider = new MonkeyCRenameRefProvider();
  const symbolProvider = new MonkeyCSymbolProvider();

  const workspaceOrNull = async () => {
    try {
      return currentWorkspace();
    } catch (ex) {
      const ws = await vscode.window.showWorkspaceFolderPick({
        placeHolder: "Select a MonkeyC Project",
      });
      return ws ? ws : null;
    }
  };

  const builderTask = async (device: string, extra: BuildConfig) => {
    const ws = await workspaceOrNull();
    if (!ws) return null;
    const task = OptimizedMonkeyCBuildTaskProvider.finalizeTask(
      new vscode.Task(
        {
          ...extra,
          type: "omonkeyc",
          device,
        },
        ws,
        device === "export" || device === "generate" ? device : "build",
        OptimizedMonkeyCBuildTaskProvider.type
      )
    );
    return task && vscode.tasks.executeTask(task);
  };
  const projectFiles = [
    { scheme: "file", language: "monkeyc" },
    { scheme: "file", language: "xml" },
    { scheme: "file", language: "jungle" },
    { scheme: "file", language: "manifest" },
    { scheme: "file", language: "mss" },
  ];
  context.subscriptions.push(
    (diagnosticCollection =
      vscode.languages.createDiagnosticCollection("build")),
    vscode.commands.registerCommand(
      "prettiermonkeyc.generateOptimizedProject",
      () => builderTask("generate", { returnCommand: true })
    ),
    vscode.commands.registerCommand(
      "prettiermonkeyc.buildOptimizedProject",
      () => builderTask("choose", {})
    ),
    vscode.commands.registerCommand(
      "prettiermonkeyc.runOptimizedProject",
      async () => {
        const ws = await workspaceOrNull();
        return (
          ws &&
          vscode.debug.startDebugging(ws, {
            ...baseDebugConfig,
          })
        );
      }
    ),
    vscode.commands.registerCommand(
      "prettiermonkeyc.exportOptimizedProject",
      () => builderTask("export", {})
    ),
    vscode.commands.registerCommand(
      "prettiermonkeyc.cleanOptimizedBuild",
      () => {
        const config = getOptimizerBaseConfig();
        if (!config.workspace || !config.outputPath) return;
        const folder = path.resolve(config.workspace, config.outputPath);
        diagnosticCollection?.clear();
        return (
          config.outputPath === "bin/optimized"
            ? Promise.resolve(true)
            : vscode.window
                .showInformationMessage(
                  `Delete all files at non-default outputPath '${folder}'?`,
                  "Yes",
                  "No"
                )
                .then((answer) => answer === "Yes")
        ).then((doit) =>
          doit ? fs.rm(folder, { recursive: true, force: true }) : undefined
        );
      }
    ),
    vscode.commands.registerCommand(
      "prettiermonkeyc.getTargetDevice",
      async (args) => {
        let ws;
        if (Array.isArray(args) && args.length && typeof args[0] === "string") {
          ws = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(args[0]));
        }
        if (!ws) ws = OptimizedMonkeyCDebugConfigProvider.lastWorkspace;
        if (!ws) ws = await workspaceOrNull();
        return ws && findProject(ws.uri)?.getDeviceToBuild();
      }
    ),
    vscode.debug.registerDebugConfigurationProvider(
      "omonkeyc",
      new OptimizedMonkeyCDebugConfigProvider(),
      vscode.DebugConfigurationProviderTriggerKind.Dynamic
    ),
    vscode.tasks.registerTaskProvider(
      OptimizedMonkeyCBuildTaskProvider.type,
      new OptimizedMonkeyCBuildTaskProvider()
    ),
    vscode.languages.registerDefinitionProvider(
      projectFiles,
      new MonkeyCDefinitionProvider()
    ),
    vscode.languages.registerDocumentSymbolProvider(
      projectFiles,
      symbolProvider
    ),
    vscode.languages.registerSignatureHelpProvider(
      "monkeyc",
      new MonkeyCSignatureProvider(),
      "(",
      ","
    ),
    vscode.languages.registerCompletionItemProvider(
      "monkeyc",
      new MonkeyCCompletionItemProvider(),
      "."
    ),
    vscode.languages.registerHoverProvider(
      "monkeyc",
      new MonkeyCHoverProvider()
    ),
    vscode.languages.registerWorkspaceSymbolProvider(symbolProvider),
    vscode.languages.registerRenameProvider(projectFiles, renameRefProvider),
    vscode.languages.registerReferenceProvider(projectFiles, renameRefProvider),
    vscode.languages.registerDocumentLinkProvider(
      projectFiles,
      new MonkeyCLinkProvider()
    ),
    vscode.languages.registerDocumentFormattingEditProvider(
      "monkeyc",
      new MonkeyCFomattingEditProvider()
    ),
    ...initializeProjectManager()
  );
}

// this method is called when your extension is deactivated
export function deactivate() {
  diagnosticCollection = null;
}
