import {
  buildOptimizedProject,
  isErrorWithLocation,
  BuildConfig,
} from "@markw65/monkeyc-optimizer";
import { hasProperty } from "@markw65/monkeyc-optimizer/api.js";
import { spawnByLine } from "@markw65/monkeyc-optimizer/util.js";
import * as path from "path";
import * as vscode from "vscode";
import { findProject, processDiagnostics } from "./project-manager";

export class CustomBuildTaskTerminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  onDidWrite: vscode.Event<string> = this.writeEmitter.event;
  private closeEmitter = new vscode.EventEmitter<number>();
  onDidClose?: vscode.Event<number> = this.closeEmitter.event;
  private devicePromise: Promise<string | null>;
  constructor(
    device: string,
    public options: BuildConfig,
    public diagnosticCollection: vscode.DiagnosticCollection
  ) {
    if (device === "choose") {
      const project = findProject(vscode.Uri.file(options.workspace!));
      if (project) {
        this.devicePromise = project.getDeviceToBuild();
      } else {
        this.devicePromise = Promise.resolve(null);
      }
    } else {
      this.devicePromise = Promise.resolve(device);
    }
  }

  open(_initialDimensions: vscode.TerminalDimensions) {
    this.devicePromise.then((device) => this.doBuild(device));
  }

  close() {}

  doBuild(device: string | null) {
    if (!device) {
      this.closeEmitter.fire(0);
      return;
    }
    this.options.device = device;
    const diagnostics: Record<string, vscode.Diagnostic[]> = {};
    this.diagnosticCollection.clear();
    const logger = (line: string, skip_diagnostics: boolean = false) => {
      let match,
        type,
        file = "unknown",
        lnum = "1",
        char,
        message = "Unknown error";
      if (
        (match = line.match(
          /^(ERROR|WARNING|INFO):\s+\w+:\s+(.*):(\d+)(?:,(\d+))?:\s+(.*)$/
        ))
      ) {
        type = match[1];
        file = match[2];
        lnum = match[3];
        char = match[4];
        message = match[5];
      } else if ((match = line.match(/^(ERROR|WARNING|INFO):\s+(.*)$/))) {
        type = match[1];
        message = match[2];
      }
      if (type === "ERROR") {
        line = `\x1b[31m${line}\x1b[0m`;
      } else if (type === "WARNING") {
        line = `\x1b[33m${line}\x1b[0m`;
      } else if (type === "INFO") {
        line = `\x1b[34m${line}\x1b[0m`;
      }
      this.writeEmitter.fire(`${line}\r\n`);
      if (!type || skip_diagnostics) return;
      const range = new vscode.Range(
        parseInt(lnum) - 1,
        char == null ? 0 : parseInt(char) - 1,
        parseInt(lnum) - 1,
        Number.MAX_VALUE
      );

      const diagnostic = new vscode.Diagnostic(
        range,
        message,
        type === "ERROR"
          ? vscode.DiagnosticSeverity.Error
          : vscode.DiagnosticSeverity.Warning
      );
      if (!hasProperty(diagnostics, file)) {
        diagnostics[file] = [];
      }
      diagnostics[file].push(diagnostic);
      const uri = vscode.Uri.file(path.resolve(this.options.workspace!, file));
      this.diagnosticCollection.set(uri, diagnostics[file]);
    };
    logger("Starting optimization step...");
    const { returnCommand } = this.options;
    return buildOptimizedProject(
      device == "export" || device == "generate" ? null : device,
      {
        ...this.options,
        returnCommand: true,
      }
    )
      .then(({ exe, args, diagnostics: optimizerDiags }) => {
        logger("Optimization step completed successfully...\r\n");
        processDiagnostics(
          optimizerDiags,
          diagnostics,
          this.diagnosticCollection,
          (diag, rel) =>
            logger(
              `${diag.type}: ${device}: ${rel}:${diag.loc.start.line},${diag.loc.start.column}: ${diag.message}`,
              true
            ),
          this.options.workspace
        );
        if (returnCommand) {
          return 0;
        }
        logger(
          `> Executing task: ${[exe, ...args]
            .map((arg) => JSON.stringify(arg))
            .join(" ")} <\r\n`
        );
        return spawnByLine(exe, args, [logger, logger], {
          cwd: this.options.workspace,
        })
          .then(() => 0)
          .catch((e) => e);
      })
      .then((result) => {
        if (result === 0) {
          returnCommand ||
            logger(
              `${device == "export" ? "Export" : "Build"} ${
                result !== 0
                  ? `failed with error code ${result}`
                  : "completed successfully"
              }`
            );
        }
        this.closeEmitter.fire(result);
      })
      .catch((e: unknown) => {
        if (e instanceof Error) {
          if (isErrorWithLocation(e) && e.location) {
            const source = path.relative(
              this.options.workspace!,
              e.location.source || "unknown"
            );
            logger(
              `ERROR: ${e.name}: ${source}:${e.location.start.line},${e.location.start.column}: ${e.message}`
            );
          } else {
            logger(`ERROR: Internal: ${e.toString()}`);
            if (e.stack) {
              e.stack
                .toString()
                .split(/[\r\n]+/)
                .forEach((s) => logger(s));
            }
          }
        } else {
          logger(`ERROR: Internal: ${e}`);
        }
        this.closeEmitter.fire(1);
      });
  }
}
