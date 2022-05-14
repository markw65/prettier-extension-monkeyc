import {
  buildOptimizedProject,
  copyRecursiveAsNeeded,
  generateOptimizedProject,
  launchSimulator,
} from "@markw65/monkeyc-optimizer";
import * as fs from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";
import { CustomBuildTaskTerminal } from "./custom-build";
import { MonkeyCDefinitionProvider } from "./definition-provider";
import { getOptimizerBaseConfig } from "./project-manager";

let diagnosticCollection: vscode.DiagnosticCollection | null = null;

const baseDebugConfig = {
  name: "Run Optimized",
  request: "launch",
  type: "omonkeyc",
  device: "${command:GetTargetDevice}",
};

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

  context.subscriptions.push(
    (diagnosticCollection = vscode.languages.createDiagnosticCollection()),
    vscode.commands.registerCommand(
      "prettiermonkeyc.generateOptimizedProject",
      () => generateOptimizedProject(getOptimizerBaseConfig())
    ),
    vscode.commands.registerCommand(
      "prettiermonkeyc.buildOptimizedProject",
      () =>
        vscode.commands
          .executeCommand("monkeyc.getTargetDevice")
          .then((device: string) =>
            buildOptimizedProject(device, getOptimizerBaseConfig())
          )
    ),
    vscode.commands.registerCommand(
      "prettiermonkeyc.runOptimizedProject",
      () =>
        vscode.workspace.workspaceFolders &&
        vscode.workspace.workspaceFolders.length &&
        vscode.debug.startDebugging(vscode.workspace.workspaceFolders[0], {
          ...getOptimizerBaseConfig(),
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
        const task = OptimizedMonkeyCBuildTaskProvider.finalizeTask(
          new vscode.Task(
            {
              ...getOptimizerBaseConfig(),
              type: "omonkeyc",
              device: "export",
            },
            vscode.workspace.workspaceFolders[0],
            "export",
            OptimizedMonkeyCBuildTaskProvider.type
          )
        );
        return task && vscode.tasks.executeTask(task);
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
    )
  );
}

// this method is called when your extension is deactivated
export function deactivate() {
  diagnosticCollection = null;
}

class OptimizedMonkeyCDebugConfigProvider {
  provideDebugConfigurations(_folder: vscode.WorkspaceFolder) {
    return [baseDebugConfig];
  }

  async resolveDebugConfigurationWithSubstitutedVariables(
    folder: vscode.WorkspaceFolder,
    config: vscode.DebugConfiguration,
    _token: vscode.CancellationToken
  ) {
    const workspace = folder.uri.fsPath;
    const definition = {
      ...config,
      workspace,
      type: OptimizedMonkeyCBuildTaskProvider.type,
    } as vscode.TaskDefinition;
    if (!definition.device || definition.device === "export") return null;
    try {
      const task = OptimizedMonkeyCBuildTaskProvider.finalizeTask(
        new vscode.Task(
          definition,
          folder,
          definition.device,
          OptimizedMonkeyCBuildTaskProvider.type
        )
      );
      if (!task) {
        throw new Error("Internal error: Failed to create Build Task");
      }
      await Promise.all([
        vscode.tasks.executeTask(task),
        new Promise<void>((resolve, reject) => {
          let disposable = vscode.tasks.onDidEndTaskProcess((e) => {
            if (e.execution.task.definition === definition) {
              disposable.dispose();
              if (e.exitCode == 0) {
                resolve();
              } else {
                reject(e.exitCode);
              }
            }
          });
        }),
      ]);
    } catch {
      return null;
    }

    const basePath = path.join(workspace, "bin", `optimized-${folder.name}`);
    // The monkeyc resolveDebugConfigurationWithSubstitutedVariables
    // would overwrite prg, prgDebugXml and settingsJson. By creating the config
    // with type == "omonkeyc", and then switching it here, it goes straight to the
    // debug adapter, without being munged.
    config.type = "monkeyc";
    config.prg = `${basePath}.prg`;
    config.prgDebugXml = `${basePath}.prg.debug.xml`;
    const settingsFile = `${basePath}-settings.json`;
    if (await fs.stat(settingsFile).catch(() => null)) {
      config.settingsJson = settingsFile;
    }
    await launchSimulator();
    return config;
  }
}

class OptimizedMonkeyCBuildTaskProvider {
  static type: string = "omonkeyc";
  // Interface function that determines if the given task is valid
  provideTasks(): vscode.Task[] {
    return [];
  }
  static finalizeTask(task: vscode.Task) {
    if (typeof task.scope !== "object" || !("uri" in task.scope)) {
      return null;
    }
    const options = {
      ...getOptimizerBaseConfig(),
      // For now disable typechecking unless explicitly enabled
      // in the task definition
      typeCheckLevel: "Off",
      ...task.definition,
      workspace: task.scope.uri.fsPath,
    };
    return new vscode.Task(
      task.definition,
      task.scope,
      task.definition.device,
      OptimizedMonkeyCBuildTaskProvider.type,
      //new vscode.ProcessExecution(exe, args),
      new vscode.CustomExecution(() => {
        // When the task is executed, this callback will run. Here, we setup for running the task.
        return Promise.resolve(
          new CustomBuildTaskTerminal(
            task.definition.device,
            options,
            diagnosticCollection!
          )
        );
      }),
      ["$monkeyc.error", "$monkeyc.fileWarning", "$monkeyc.genericWarning"]
    );
  }

  async resolveTask(task: vscode.Task) {
    // Monkey C only works with workspace based tasks
    if (task.source === "Workspace") {
      // make sure that this is an Optimized Monkey C task and that the device is available
      if (
        task.definition.type === OptimizedMonkeyCBuildTaskProvider.type &&
        task.definition.device
      ) {
        return OptimizedMonkeyCBuildTaskProvider.finalizeTask(task);
      }
    }
    return undefined;
  }
}
