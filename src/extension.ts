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
import { OptimizedMonkeyCBuildTaskProvider } from "./task-provider";
import { initializeProjectManager } from "./project-manager";

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

  const builderTask = (device: string | null, extra: BuildConfig) => {
    const task = OptimizedMonkeyCBuildTaskProvider.finalizeTask(
      new vscode.Task(
        {
          ...extra,
          type: "omonkeyc",
          device,
        },
        vscode.workspace.workspaceFolders![0],
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
      () =>
        vscode.commands
          .executeCommand("monkeyc.getTargetDevice")
          .then((device: string) => builderTask(device, {}))
    ),
    vscode.commands.registerCommand(
      "prettiermonkeyc.runOptimizedProject",
      () =>
        vscode.workspace.workspaceFolders &&
        vscode.workspace.workspaceFolders.length &&
        vscode.debug.startDebugging(vscode.workspace.workspaceFolders[0], {
          ...baseDebugConfig,
        })
    ),
    vscode.commands.registerCommand(
      "prettiermonkeyc.exportOptimizedProject",
      () => {
        if (
          !vscode.workspace.workspaceFolders ||
          !vscode.workspace.workspaceFolders.length
        ) {
          return null;
        }
        return builderTask("export", {});
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
    ...initializeProjectManager()
  );
}

// this method is called when your extension is deactivated
export function deactivate() {
  diagnosticCollection = null;
}
