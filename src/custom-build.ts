import {
  buildOptimizedProject,
  isErrorWithLocation,
} from "@markw65/monkeyc-optimizer";
import { hasProperty } from "@markw65/monkeyc-optimizer/api.js";
import { spawnByLine } from "@markw65/monkeyc-optimizer/util.js";
import * as path from "path";
import * as vscode from "vscode";

export class CustomBuildTaskTerminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  onDidWrite: vscode.Event<string> = this.writeEmitter.event;
  private closeEmitter = new vscode.EventEmitter<number>();
  onDidClose?: vscode.Event<number> = this.closeEmitter.event;

  constructor(
    public device: string,
    public options: BuildConfig,
    public diagnosticCollection: vscode.DiagnosticCollection
  ) {}

  open(_initialDimensions: vscode.TerminalDimensions) {
    this.doBuild();
  }

  close() {}

  doBuild() {
    const diagnostics: Record<string, vscode.Diagnostic[]> = {};
    this.diagnosticCollection.clear();
    const logger = (line: string) => {
      let match,
        type,
        file = "unknown",
        lnum = "1",
        char,
        message = "Unknown error";
      if (
        (match = line.match(
          /^(ERROR|WARNING):\s+\w+:\s+(.*):(\d+)(?:,(\d+))?:\s+(.*)$/
        ))
      ) {
        type = match[1];
        file = match[2];
        lnum = match[3];
        char = match[4];
        message = match[5];
      } else if ((match = line.match(/^(ERROR|WARNING):\s+(.*)$/))) {
        type = match[1];
        message = match[2];
      }
      if (type === "ERROR") {
        line = `\x1b[31m${line}\x1b[0m`;
      } else if (type === "WARNING") {
        line = `\x1b[33m${line}\x1b[0m`;
      }
      this.writeEmitter.fire(`${line}\r\n`);
      if (!type) return;
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
    return buildOptimizedProject(this.device == "export" ? null : this.device, {
      ...this.options,
      returnCommand: true,
    })
      .then(({ exe, args }) => {
        logger("Optimization step completed successfully...\r\n");
        if (returnCommand) {
          return 0;
        }
        logger(
          `> Executing task: ${[exe, ...args]
            .map((arg) => JSON.stringify(arg))
            .join(" ")}\r\n`
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
              `${this.device == "export" ? "Export" : "Build"} ${
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
                .forEach(logger);
            }
          }
        } else {
          logger(`ERROR: Internal: ${e}`);
        }
        this.closeEmitter.fire(1);
      });
  }
}
