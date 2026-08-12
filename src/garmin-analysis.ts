import { getSdkPath } from "@markw65/monkeyc-optimizer/sdk-util.js";
import { globa } from "@markw65/monkeyc-optimizer/util.js";
import child_process, { ExecException } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import util from "node:util";
import * as vscode from "vscode";

const exec = util.promisify(child_process.exec);

export const enum GarminAnalysis {
  Unavailable = 0,
  Disabled = 1,
  Enabled = 2,
}

function killLanguageServerProcesses() {
  const platform = process.platform;
  let command = "";

  if (platform === "darwin" || platform === "linux") {
    // macOS & Linux: Use pkill with the -f flag to scan full command arguments
    command = `pkill -f "LanguageServer.jar.*com.garmin.monkeybrains.languageserver.LSLauncher"`;
  } else if (platform === "win32") {
    // Windows: PowerShell matches command lines via WMI/CIM data
    // Stops any java.exe running our target JAR file
    command = `powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name = 'java.exe'\\" | Where-Object { $_.CommandLine -like '*LanguageServer.jar*com.garmin.monkeybrains.languageserver.LSLauncher*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`;
  } else {
    console.warn(
      `Unsupported platform for automated process cleanup: ${platform}`
    );
    return;
  }

  return exec(command).then(
    () => console.log("LanguageServer process sweep completed successfully."),
    (error: ExecException) => {
      if (error.code !== 1) {
        console.error(
          `Failed to execute language server cleanup: ${error.stderr ?? error.message}`
        );
      }
    }
  );
}

export function getGarminLanguageServer() {
  return getSdkPath(undefined)
    .then((sdkPath) =>
      globa("LanguageServer.jar*", {
        cwd: path.resolve(sdkPath, "bin"),
      })
    )
    .then((paths) => {
      if (!paths.length) return null;
      for (const path of paths) {
        if (path.toLowerCase() === "languageserver.jar") {
          return true;
        }
      }
      return paths[0];
    });
}

export function checkGarminAnalysisStatus() {
  return getGarminLanguageServer().then((server) =>
    typeof server === "string"
      ? GarminAnalysis.Disabled
      : server
        ? GarminAnalysis.Enabled
        : GarminAnalysis.Unavailable
  );
}

export function enableGarminAnalysis(flag: boolean) {
  const finishUp = () => {
    const messages = ["Restart Extensions", "Dismiss"];
    if (!flag) messages.unshift("Kill Server");
    return vscode.window
      .showInformationMessage(
        flag
          ? `Garmin Language Server has been enabled for future sessions. You can restart extensions to start it now`
          : `Garmin Language Server has been disabled for future sessions. You can kill the server, or restart extensions to stop it now`,
        ...messages
      )
      .then((selection): unknown => {
        switch (selection) {
          case "Restart Extensions":
            return vscode.commands.executeCommand(
              "workbench.action.restartExtensionHost"
            );
          case "Kill Server":
            return killLanguageServerProcesses();
          default:
            return;
        }
      });
  };
  return getGarminLanguageServer().then((server) => {
    if (flag) {
      if (typeof server === "string") {
        return getSdkPath(undefined)
          .then((sdkPath) => {
            const languageServer = path.resolve(
              sdkPath,
              "bin",
              "LanguageServer.jar"
            );
            const disabledServer = path.resolve(sdkPath, "bin", server);
            return fs.rename(disabledServer, languageServer);
          })
          .then(finishUp);
      }
    } else {
      if (server === true) {
        return getSdkPath(undefined).then((sdkPath) => {
          const languageServer = path.resolve(
            sdkPath,
            "bin",
            "LanguageServer.jar"
          );
          const disabledServer = path.resolve(
            sdkPath,
            "bin",
            `${languageServer}.disabled`
          );
          return fs
            .rm(disabledServer)
            .catch(() => null)
            .then(() => fs.rename(languageServer, disabledServer))
            .then(finishUp);
        });
      }
    }
    return Promise.reject(new Error(`The Sdk was changed externally`));
  });
}
