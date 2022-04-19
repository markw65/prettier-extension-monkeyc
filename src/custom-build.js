const vscode = require("vscode");
const { buildOptimizedProject } = require("@markw65/monkeyc-optimizer");
const { spawnByLine } = require("@markw65/monkeyc-optimizer/util.js");
const path = require("path");
const { hasProperty } = require("@markw65/monkeyc-optimizer/api.js");

class CustomBuildTaskTerminal {
  constructor(device, options, diagnosticCollection) {
    this.device = device;
    this.options = options;
    this.writeEmitter = new vscode.EventEmitter();
    this.onDidWrite = this.writeEmitter.event;
    this.closeEmitter = new vscode.EventEmitter();
    this.onDidClose = this.closeEmitter.event;
    this.diagnosticCollection = diagnosticCollection;
  }

  open(_initialDimensions) {
    /*
		// At this point we can start using the terminal.
		if (this.flags.indexOf('watch') > -1) {
			const pattern = path.join(this.workspaceRoot, 'customBuildFile');
			this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
			this.fileWatcher.onDidChange(() => this.doBuild());
			this.fileWatcher.onDidCreate(() => this.doBuild());
			this.fileWatcher.onDidDelete(() => this.doBuild());
		}
        */
    this.doBuild();
  }

  close() {
    /*
		// The terminal has been closed. Shutdown the build.
		if (this.fileWatcher) {
			this.fileWatcher.dispose();
		}
        */
  }

  doBuild() {
    const diagnostics = {};
    this.diagnosticCollection.clear();
    const logger = (line) => {
      let match, type, file, lnum, char, message;
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
        lnum = 1;
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
      const uri = vscode.Uri.file(path.resolve(this.options.workspace, file));
      this.diagnosticCollection.set(uri, diagnostics[file]);
    };
    logger("Starting optimization step...");
    return buildOptimizedProject(this.device == "export" ? null : this.device, {
      ...this.options,
      returnCommand: true,
    })
      .then(({ exe, args }) => {
        logger("Optimization step completed successfully...");

        return spawnByLine(exe, args, [logger, logger], {
          cwd: this.options.workspace,
        })
          .then(() => 0)
          .catch((e) => e);
      })
      .then((result) => {
        if (result === 0) {
          logger(
            `${process.argv[2] == "export" ? "Export" : "Build"} ${
              result !== 0
                ? `failed with error code ${result}`
                : "completed successfully"
            }`
          );
        }
        this.closeEmitter.fire(result);
      })
      .catch((e) => {
        if (e.name && e.message && e.location) {
          const source = path.relative(
            this.options.workspace,
            e.location.source
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
        this.closeEmitter.fire(1);
      });
  }
}

module.exports = { CustomBuildTaskTerminal };
