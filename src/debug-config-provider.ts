import { launchSimulator } from "@markw65/monkeyc-optimizer";
import * as fs from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";
import { OptimizedMonkeyCBuildTaskProvider } from "./task-provider";

export const baseDebugConfig = {
  name: "Run Optimized",
  request: "launch",
  type: "omonkeyc",
  device: "${command:GetTargetDevice}",
};

export class OptimizedMonkeyCDebugConfigProvider
  implements vscode.DebugConfigurationProvider
{
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
