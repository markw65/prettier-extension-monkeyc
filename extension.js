"use strict";

const vscode = require("vscode");
const fs = require("fs/promises");
const path = require("path");
const {
  generateOptimizedProject,
  buildOptimizedProject,
  copyRecursiveAsNeeded,
  launchSimulator,
} = require("@markw65/monkeyc-optimizer");
const { CustomBuildTaskTerminal } = require("./src/custom-build.js");

let debugConfigProvider;
let buildTaskProvider;
let diagnosticCollection;

const baseDebugConfig = {
  name: "Run Optimized",
  request: "launch",
  type: "omonkeyc",
  device: "${command:GetTargetDevice}",
};

// this method is called when the extension is activated
// which (as currently configured) is the first time a .mc file is opened.
async function activate() {
  console.log(
    "Installing @markw65/prettier-plugin-monkeyc into the esbenp.prettier-vscode extension!"
  );

  const our_extension_dir = __dirname;
  const prettier_dir = vscode.extensions.getExtension(
    "esbenp.prettier-vscode"
  ).extensionPath;

  const target_dir = `${prettier_dir}/node_modules/@markw65/prettier-plugin-monkeyc`;
  try {
    await copyRecursiveAsNeeded(
      `${our_extension_dir}/node_modules/@markw65/prettier-plugin-monkeyc`,
      target_dir
    );
  } catch (e) {
    console.log(`Failed: ${e}`);
  }

  vscode.commands.registerCommand(
    "prettiermonkeyc.generateOptimizedProject",
    () => generateOptimizedProject(getOptimizerBaseConfig())
  );
  vscode.commands.registerCommand("prettiermonkeyc.buildOptimizedProject", () =>
    buildOptimizedProject(getOptimizerBaseConfig())
  );
  vscode.commands.registerCommand("prettiermonkeyc.runOptimizedProject", () =>
    vscode.debug.startDebugging(vscode.workspace.workspaceFolders[0], {
      ...getOptimizerBaseConfig(),
      ...baseDebugConfig,
    })
  );
  vscode.commands.registerCommand(
    "prettiermonkeyc.exportOptimizedProject",
    () => {
      return vscode.tasks.executeTask(
        OptimizedMonkeyCBuildTaskProvider.finalizeTask(
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
        )
      );
    }
  );

  diagnosticCollection = vscode.languages.createDiagnosticCollection();
  debugConfigProvider = await vscode.debug.registerDebugConfigurationProvider(
    "omonkeyc",
    new OptimizedMonkeyCDebugConfigProvider(),
    vscode.DebugConfigurationProviderTriggerKind.Dynamic
  );
  buildTaskProvider = vscode.tasks.registerTaskProvider(
    OptimizedMonkeyCBuildTaskProvider.type,
    new OptimizedMonkeyCBuildTaskProvider()
  );
}

// this method is called when your extension is deactivated
function deactivate() {
  debugConfigProvider && debugConfigProvider.dispose();
  debugConfigProvider = null;
  buildTaskProvider && buildTaskProvider.dispose();
  buildTaskProvider = null;
}

class OptimizedMonkeyCDebugConfigProvider {
  provideDebugConfigurations(_folder) {
    return [baseDebugConfig];
  }

  async resolveDebugConfigurationWithSubstitutedVariables(
    folder,
    config,
    _token
  ) {
    const workspace = folder.uri.fsPath;
    const definition = {
      ...config,
      workspace,
      type: OptimizedMonkeyCBuildTaskProvider.type,
    };
    if (!definition.device || definition.device === "export") return;
    try {
      await Promise.all([
        vscode.tasks.executeTask(
          OptimizedMonkeyCBuildTaskProvider.finalizeTask(
            new vscode.Task(
              definition,
              folder,
              definition.device,
              OptimizedMonkeyCBuildTaskProvider.type
            )
          )
        ),
        new Promise((resolve, reject) => {
          let disposable = vscode.tasks.onDidEndTaskProcess((e) => {
            if (e.execution.task.definition === definition) {
              disposable.dispose();
              if (e.exitCode == 0) {
                resolve();
              } else {
                reject();
              }
            }
          });
        }),
      ]);
    } catch {
      return;
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
  // Interface function that determines if the given task is valid
  provideTasks() {
    return;
  }
  static finalizeTask(task) {
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
            diagnosticCollection
          )
        );
      }),
      [("$monkeyc.error", "$monkeyc.fileWarning", "$monkeyc.genericWarning")]
    );
  }

  async resolveTask(task) {
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

OptimizedMonkeyCBuildTaskProvider.type = "omonkeyc";

function getOptimizerBaseConfig() {
  const config = { workspace: vscode.workspace.workspaceFolders[0].uri.fsPath };

  const pmcConfig = vscode.workspace.getConfiguration("prettierMonkeyC");
  for (const i of [
    "releaseBuild",
    "outputPath",
    "ignoredExcludeAnnotations",
    "ignoredAnnotations",
    "ignoredSourcePaths",
  ]) {
    if (pmcConfig[i]) config[i] = pmcConfig[i];
  }

  const mcConfig = vscode.workspace.getConfiguration("monkeyC");
  for (const i of [
    "jungleFiles",
    "developerKeyPath",
    "typeCheckLevel",
    "compilerOptions",
    "compilerWarnings",
  ]) {
    if (mcConfig[i]) config[i] = mcConfig[i];
  }
  return config;
}

module.exports = {
  activate,
  deactivate,
};
