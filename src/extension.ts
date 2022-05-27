import { copyRecursiveAsNeeded } from "@markw65/monkeyc-optimizer";
import * as path from "path";
import * as vscode from "vscode";
import {
  baseDebugConfig,
  OptimizedMonkeyCDebugConfigProvider,
} from "./debug-config-provider";
import { MonkeyCDefinitionProvider } from "./definition-provider";
import { MonkeyCRenameRefProvider } from "./rename-provider";
import { MonkeyCSymbolProvider } from "./symbol-provider";
import { MonkeyCLinkProvider } from "./link-provider";
import { OptimizedMonkeyCBuildTaskProvider } from "./task-provider";
import {
  currentWorkspace,
  findProject,
  initializeProjectManager,
} from "./project-manager";

export let diagnosticCollection: vscode.DiagnosticCollection | null = null;

// this method is called when the extension is activated
// which (as currently configured) is the first time a .mc file is opened.
export async function activate(context: vscode.ExtensionContext) {
  console.log(
    "Installing @markw65/prettier-plugin-monkeyc into the esbenp.prettier-vscode extension!"
  );

  const our_extension_dir = path.resolve(__dirname, "..");
  const prettier_dir = vscode.extensions.getExtension(
    "esbenp.prettier-vscode"
  )?.extensionPath;

  if (prettier_dir) {
    const target_dir = `${prettier_dir}/node_modules/@markw65/prettier-plugin-monkeyc`;
    try {
      await copyRecursiveAsNeeded(
        `${our_extension_dir}/node_modules/@markw65/prettier-plugin-monkeyc`,
        target_dir
      );
    } catch (e) {
      console.log(`Failed: ${e}`);
    }
  }

  const renameRefProvider = new MonkeyCRenameRefProvider();
  const symbolProvider = new MonkeyCSymbolProvider();

  const workspaceOrNull = () => {
    try {
      return currentWorkspace();
    } catch (ex) {
      let message = "Unknown error";
      if (ex instanceof Error) {
        message = ex.toString();
      }
      vscode.window.showErrorMessage(`Unable to find workspace: ${message}`);
      return null;
    }
  };
  const builderTask = (device: string | null, extra: BuildConfig) => {
    const ws = workspaceOrNull();
    if (!ws) return null;
    const task = OptimizedMonkeyCBuildTaskProvider.finalizeTask(
      new vscode.Task(
        {
          ...extra,
          type: "omonkeyc",
          device,
        },
        ws,
        device === "export" ? "export" : "build",
        OptimizedMonkeyCBuildTaskProvider.type
      )
    );
    return task && vscode.tasks.executeTask(task);
  };
  context.subscriptions.push(
    (diagnosticCollection = vscode.languages.createDiagnosticCollection()),
    vscode.commands.registerCommand(
      "prettiermonkeyc.generateOptimizedProject",
      () => builderTask(null, { returnCommand: true })
    ),
    vscode.commands.registerCommand(
      "prettiermonkeyc.buildOptimizedProject",
      () => builderTask("choose", {})
    ),
    vscode.commands.registerCommand(
      "prettiermonkeyc.runOptimizedProject",
      () => {
        const ws = workspaceOrNull();
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
      "prettiermonkeyc.getTargetDevice",
      (args) => {
        let ws;
        if (Array.isArray(args) && args.length && typeof args[0] === "string") {
          ws = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(args[0]));
        }
        if (!ws) ws = workspaceOrNull();
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
      { scheme: "file", language: "monkeyc" },
      new MonkeyCDefinitionProvider()
    ),
    vscode.languages.registerDocumentSymbolProvider(
      { scheme: "file", language: "monkeyc" },
      symbolProvider
    ),
    vscode.languages.registerWorkspaceSymbolProvider(symbolProvider),
    vscode.languages.registerRenameProvider(
      { scheme: "file", language: "monkeyc" },
      renameRefProvider
    ),
    vscode.languages.registerReferenceProvider(
      { scheme: "file", language: "monkeyc" },
      renameRefProvider
    ),
    vscode.languages.registerDocumentLinkProvider(
      { scheme: "file", language: "monkeyc" },
      new MonkeyCLinkProvider()
    ),
    ...initializeProjectManager()
  );
}

// this method is called when your extension is deactivated
export function deactivate() {
  diagnosticCollection = null;
}
