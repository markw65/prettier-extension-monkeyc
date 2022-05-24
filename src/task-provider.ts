import * as vscode from "vscode";
import { CustomBuildTaskTerminal } from "./custom-build";
import { getOptimizerBaseConfig } from "./project-manager";
import { diagnosticCollection } from "./extension";

export class OptimizedMonkeyCBuildTaskProvider implements vscode.TaskProvider {
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
