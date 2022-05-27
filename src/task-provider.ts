import * as vscode from "vscode";
import { CustomBuildTaskTerminal } from "./custom-build";
import { findProject, getOptimizerBaseConfig } from "./project-manager";
import { diagnosticCollection } from "./extension";

export class OptimizedMonkeyCBuildTaskProvider implements vscode.TaskProvider {
  static type: string = "omonkeyc";
  // Interface function that determines if the given task is valid
  provideTasks(): vscode.Task[] {
    return [];
  }
  static finalizeTask(task: vscode.Task) {
    if (typeof task.scope !== "object") {
      return null;
    }
    const options = {
      ...getOptimizerBaseConfig(task.scope),
      // For now disable typechecking unless explicitly enabled
      // in the task definition
      typeCheckLevel: "Off",
      ...task.definition,
      workspace: task.scope.uri.fsPath,
    };
    return new vscode.Task(
      task.definition,
      task.scope,
      task.definition.device || "generate",
      OptimizedMonkeyCBuildTaskProvider.type,
      new vscode.CustomExecution(() => {
        // When the task is executed, this callback will run. Here, we setup for running the task.
        return Promise.resolve(
          new CustomBuildTaskTerminal(
            task.definition.device,
            options,
            diagnosticCollection!
          )
        );
      }) /*,
      ["$monkeyc.error", "$monkeyc.fileWarning", "$monkeyc.genericWarning"]*/
    );
  }

  async resolveTask(task: vscode.Task) {
    if (
      task.source === "Workspace" &&
      task.scope &&
      typeof task.scope === "object" &&
      task.definition.type === OptimizedMonkeyCBuildTaskProvider.type
    ) {
      return OptimizedMonkeyCBuildTaskProvider.finalizeTask(task);
    }
    return undefined;
  }
}
