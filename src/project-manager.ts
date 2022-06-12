import {
  Analysis,
  getProjectAnalysis,
  get_jungle,
  manifestProducts,
  PreAnalysis,
  ResolvedJungle,
} from "@markw65/monkeyc-optimizer";
import {
  collectNamespaces,
  hasProperty,
  sameLookupResult,
} from "@markw65/monkeyc-optimizer/api.js";
import { getDeviceInfo } from "@markw65/monkeyc-optimizer/sdk-util.js";
import { mctree } from "@markw65/prettier-plugin-monkeyc";
import { existsSync } from "fs";
import * as path from "path";
import * as vscode from "vscode";

type UpdateElem = { file: string; content: string | null | false };

export function normalize(filepath: string) {
  return filepath.replace(/[\\]/g, "/");
}

export class Project implements vscode.Disposable {
  private currentAnalysis: Analysis | PreAnalysis | null = null;
  private junglePromise: Promise<void> = Promise.resolve();
  private buildRuleDependencies: Record<string, string | true> = {};
  private jungleResult: ResolvedJungle | null = null;
  private currentTimer: NodeJS.Timeout | null = null;
  private currentUpdates: Record<string, string | null | false> | null = null;
  private firstUpdateInBatch: number = 0;
  private disposables: vscode.Disposable[] = [];
  private diagnosticCollection = vscode.languages.createDiagnosticCollection();
  private lastDevice: string | null = null;

  static create(workspaceFolder: vscode.WorkspaceFolder) {
    const options = getOptimizerBaseConfig(workspaceFolder);
    if (!options.jungleFiles || options.jungleFiles === "") {
      options.jungleFiles = "monkey.jungle";
    }
    const hasAny = options.jungleFiles
      .split(";")
      .some((jungleFile) =>
        existsSync(path.resolve(workspaceFolder.uri.fsPath, jungleFile))
      );

    if (!hasAny) return null;
    return new Project(workspaceFolder, options);
  }

  public getDeviceToBuild(): Promise<string | null> {
    if (!this.jungleResult) {
      return this.getAnalysis().then(() => {
        if (this.jungleResult) return this.getDeviceToBuild();
        return null;
      });
    }
    const { xml } = this.jungleResult;

    const availableDevices: string[] = manifestProducts(xml);
    if (availableDevices.length === 0) {
      vscode.window.showErrorMessage(
        `No devices available to build for ${this.workspaceFolder.name}. Download devices using the SDK Manager.`
      );
      return Promise.resolve(null);
    }

    if (availableDevices.length === 1) {
      return Promise.resolve(availableDevices[0]);
    }

    return getDeviceInfo()
      .then((deviceInfo) => {
        const quickPickItems: { label: string; description: string }[] = [];
        availableDevices.forEach((device) => {
          const item = {
            label: deviceInfo[device].displayName,
            description: device,
          };
          if (device === this.lastDevice) {
            quickPickItems.unshift(item);
          } else {
            quickPickItems.push(item);
          }
        });
        return vscode.window.showQuickPick(quickPickItems, {
          matchOnDescription: true,
        });
      })
      .then((item) => (item ? (this.lastDevice = item.description) : null));
  }

  private constructor(
    private workspaceFolder: vscode.WorkspaceFolder,
    private options: BuildConfig
  ) {
    const workspace = normalize(this.workspaceFolder.uri.fsPath);

    this.disposables.push(
      this.diagnosticCollection,
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (
          e.affectsConfiguration("monkeyC", this.workspaceFolder) ||
          e.affectsConfiguration("prettierMonkeyC", this.workspaceFolder)
        ) {
          const old = JSON.stringify(this.options);
          this.options = getOptimizerBaseConfig(this.workspaceFolder);
          if (JSON.stringify(this.options) !== old) {
            this.reloadJungles(this.currentAnalysis);
          }
        }
      })
    );

    this.reloadJungles(null);
  }

  dispose() {
    this.disposables.forEach((item) => item.dispose());
  }

  diagnosticFromError(e: Error, filepath: string) {
    interface PeggyError extends Error {
      location: mctree.Node["loc"];
    }
    const error = e as Error | PeggyError;
    let range;
    if ("location" in error && error.location) {
      range = new vscode.Range(
        error.location.start.line - 1,
        error.location.start.column - 1,
        error.location.start.line - 1,
        error.location.start.column - 1
      );
      if (error.location.source) {
        filepath = error.location.source;
      }
    } else {
      range = new vscode.Range(0, 0, 0, 0);
    }
    const diagnostics = [
      new vscode.Diagnostic(
        range,
        error.message,
        vscode.DiagnosticSeverity.Error
      ),
    ];

    this.diagnosticCollection.set(vscode.Uri.file(filepath), diagnostics);
  }

  private reloadJungles(oldAnalysis: PreAnalysis | null) {
    this.currentAnalysis = null;
    this.junglePromise = get_jungle(this.options.jungleFiles!, this.options)
      .catch((e) => {
        this.buildRuleDependencies = Object.fromEntries(
          this.options
            .jungleFiles!.split(";")
            .concat("barrels.jungle")
            .map((file) => [
              normalize(path.resolve(this.options!.workspace!, file)),
              true,
            ])
        );
        this.jungleResult = null;
        throw e;
      })
      .then((jungleResult) => {
        this.jungleResult = jungleResult;
        if (!jungleResult) return;
        return this.runAnalysis(oldAnalysis);
      })
      .catch((e) => {
        if (e instanceof Error) {
          this.diagnosticCollection.clear();
          this.diagnosticFromError(e, this.options.jungleFiles || "");
          return;
        }
        throw e;
      });
  }

  private runAnalysis(oldAnalysis: PreAnalysis | null) {
    this.currentAnalysis = null;
    if (!this.jungleResult) {
      throw new Error("Missing jungleResult");
    }
    const { manifest, targets, jungles /*xml, annotations */ } =
      this.jungleResult;
    Promise.all(
      [manifest, ...jungles].map((f) =>
        vscode.workspace.fs
          .readFile(vscode.Uri.file(f))
          .then((d) => [f, d.toString()] as const)
      )
    ).then(
      (results) => (this.buildRuleDependencies = Object.fromEntries(results))
    );
    return getProjectAnalysis(targets, oldAnalysis, this.options)
      .then((analysis) => {
        this.currentAnalysis = analysis;
        this.diagnosticCollection.clear();
        if ("state" in analysis) {
          return;
        }
        Object.entries(analysis.fnMap).forEach(([filepath, info]) => {
          if (info.parserError) {
            this.diagnosticFromError(info.parserError, filepath);
          }
        });
        return;
      })
      .catch((e) => {
        if (e instanceof Error) {
          this.diagnosticCollection.clear();
          this.diagnosticFromError(e, "<unknown>");
          return;
        }
        throw e;
      });
  }

  public onFilesUpdate(files: Array<UpdateElem>) {
    if (!this.buildRuleDependencies) return;
    let analysis: PreAnalysis | null = this.currentAnalysis;
    files.forEach(({ file, content }) => {
      if (
        normalize(
          path.relative(this.workspaceFolder.uri.fsPath, file)
        ).startsWith(".")
      ) {
        // This file belongs to another project in the same
        // workspace. Ignore it.
        return;
      }
      if (hasProperty(this.buildRuleDependencies, file)) {
        if (content) {
          // Ignore in memory changes to TextDocuments, because
          // get_jungles always reads from the file system.
          return;
        }
      } else if (analysis && hasProperty(analysis.fnMap, file)) {
        const fileInfo = analysis.fnMap[file];
        if (!fileInfo || content === fileInfo.monkeyCSource) {
          return;
        }
      } else if (content === false) {
        // A delete event. If a whole directory is deleted, we get
        // the event for the directory, but not for its contents.
        // So check that here...
        const update = Object.keys(analysis ? analysis.fnMap : {})
          .concat(Object.keys(this.buildRuleDependencies))
          .filter((f) => !normalize(path.relative(file, f)).startsWith("."))
          .map((f) => ({ file: f, content }));
        update.length && this.onFilesUpdate(update);
        return;
      } else if (analysis && !file.endsWith(".mc")) {
        return;
      }

      if (!this.currentUpdates) {
        this.firstUpdateInBatch = Date.now();
        this.currentUpdates = {};
      }
      this.currentUpdates[file] = content;
    });
    if (this.currentTimer !== null) {
      clearTimeout(this.currentTimer);
      this.currentTimer = null;
    }
    if (this.currentUpdates) {
      const now = Date.now();
      if (now - this.firstUpdateInBatch > 1000) {
        this.doFilesUpdate();
      } else {
        // wait 200ms to collect more updates
        this.currentTimer = setTimeout(() => {
          this.currentTimer = null;
          this.doFilesUpdate();
        }, 200);
      }
    }
  }

  private doFilesUpdate() {
    if (!this.buildRuleDependencies) return;
    const files = this.currentUpdates;
    this.currentUpdates = null;
    if (!files) return;
    let analysis: PreAnalysis | null = this.currentAnalysis;
    let restart = false;
    Object.entries(files).forEach(([file, content]) => {
      if (
        hasProperty(this.buildRuleDependencies, file) &&
        content !== this.buildRuleDependencies[file]
      ) {
        restart = true;
      } else if (analysis) {
        if (hasProperty(analysis.fnMap, file)) {
          const fileInfo = analysis.fnMap[file];
          if (!fileInfo) {
            return;
          }
          if (content !== fileInfo.monkeyCSource) {
            if (analysis === this.currentAnalysis) {
              analysis = { ...analysis, fnMap: { ...analysis.fnMap } };
            }
            if (content === false) {
              delete analysis.fnMap[file];
              restart = true;
            } else {
              const { ast, monkeyCSource, ...rest } = fileInfo;
              analysis.fnMap[file] = rest;
              if (content != null) {
                analysis.fnMap[file].monkeyCSource = content;
              }
            }
          }
        } else if (file.endsWith(".mc") && content !== false) {
          restart = true;
        }
      }
    });
    if (restart) {
      this.reloadJungles(analysis);
    } else if (analysis !== this.currentAnalysis) {
      this.junglePromise = this.runAnalysis(analysis);
    }
  }

  getAnalysis(): Promise<Analysis | PreAnalysis | null> {
    if (this.currentTimer !== null) {
      clearTimeout(this.currentTimer);
      this.currentTimer = null;
      this.doFilesUpdate();
    }
    return this.junglePromise.then(() => this.currentAnalysis);
  }
}

const projects: Record<string, Project> = {};
// Given a URI, find or construct the corresponding
// MonkeyC project.
export function findProject(entity: vscode.Uri) {
  const workspace = vscode.workspace.getWorkspaceFolder(entity);
  if (!workspace) return null;
  const key = workspace.uri.toString();
  if (hasProperty(projects, key)) {
    return projects[key];
  }
  const project = Project.create(workspace);
  if (!project) return null;
  projects[key] = project;
  return project;
}

export function initializeProjectManager(): vscode.Disposable[] {
  const fileChange = (
    uri: vscode.Uri,
    content: string | false | null = null
  ) => {
    Object.values(projects).forEach((project) =>
      project.onFilesUpdate([{ file: normalize(uri.fsPath), content }])
    );
  };

  const fileSystemWatcher = vscode.workspace.createFileSystemWatcher("**/*");

  return [
    vscode.workspace.onDidChangeWorkspaceFolders((e) => {
      e.removed.forEach((w) => {
        const key = w.uri.toString();
        if (hasProperty(projects, key)) {
          const project = projects[key];
          delete projects[key];
          project.dispose();
        }
      });
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (!e.contentChanges.length) return;
      fileChange(e.document.uri, e.document.getText());
    }),
    fileSystemWatcher,
    fileSystemWatcher.onDidChange((e) => fileChange(e, null)),
    fileSystemWatcher.onDidCreate((e) => fileChange(e, null)),
    fileSystemWatcher.onDidDelete((e) => fileChange(e, false)),
  ];
}

export function findItemsByRange(
  state: ProgramStateAnalysis,
  ast: mctree.Program,
  range: vscode.Range
) {
  let result: {
    node: mctree.Node;
    stack: ProgramStateStack;
    isType: boolean;
  }[] = [];
  state.pre = (node: mctree.Node) => {
    if (!node.loc || node === ast) return null;
    // skip over nodes that end before the range begins
    if (
      node.loc.end.line <= range.start.line ||
      (node.loc.end.line == range.start.line + 1 &&
        node.loc.end.column <= range.start.character)
    ) {
      return [];
    }
    if (
      node.loc.start.line <= range.start.line ||
      (node.loc.start.line == range.start.line + 1 &&
        node.loc.start.column <= range.start.character + 1)
    ) {
      result.push({
        node,
        stack: state.stackClone(),
        isType: state.inType,
      });
    } else {
      return [];
    }
    return null;
  };
  collectNamespaces(ast, state);
  delete state.pre;
  return result;
}

export function findDefinition(
  document: vscode.TextDocument,
  position: vscode.Position
) {
  const project = findProject(document.uri);
  if (!project) return Promise.reject("No project found");
  const range = document.getWordRangeAtPosition(position);
  if (!range) return Promise.reject("No symbol found");
  return project.getAnalysis().then((analysis) => {
    if (!analysis) {
      return Promise.reject("Project analysis not found");
    }
    if (!("state" in analysis)) {
      return Promise.reject("Project contains errors");
    }
    const file = analysis.fnMap[normalize(document.uri.fsPath)];
    if (!file) {
      return Promise.reject(
        "Document ${document.uri.fsPath} not found in project"
      );
    }
    const items = findItemsByRange(analysis.state, file.ast, range);
    let expr = null;
    for (let i = items.length; i--; ) {
      const item = items[i];
      switch (item.node.type) {
        case "Literal":
          // enum's with no explict value get a generated literal
          // node with the same range as the identifier, so just
          // ignore literals.
          expr = null;
          continue;
        case "CallExpression":
          if (item.node.callee.type === "Identifier") {
            const loc = item.node.callee.loc;
            if (
              loc &&
              loc.start.line === range.start.line + 1 &&
              loc.start.column === range.start.character + 1 &&
              loc.end.line === range.end.line + 1 &&
              loc.end.column === range.end.character + 1
            ) {
              expr = item;
              break;
            }
          }
          break;
        case "Identifier":
          expr = item;
          continue;
        case "MemberExpression":
          if (
            item.node.loc!.end.line !== range.end.line + 1 ||
            item.node.loc!.end.column != range.end.character + 1
          ) {
            continue;
          }
          if (item.node.computed || item.node.property.type !== "Identifier") {
            continue;
          }
          expr = item;
          continue;
      }
      break;
    }
    if (!expr) {
      return Promise.reject("No symbol found");
    }
    const [name, results] =
      expr.node.type === "CallExpression"
        ? analysis.state.lookupNonlocal(
            (expr.node = expr.node.callee),
            null,
            expr.stack
          )
        : analysis.state[expr.isType ? "lookupType" : "lookupValue"](
            expr.node,
            null,
            expr.stack
          );
    return { node: expr.node, name, results, analysis };
  });
}

export function visitReferences(
  state: ProgramStateAnalysis,
  ast: mctree.Program,
  name: string | null,
  defn: LookupDefinition[] | null,
  callback: (node: mctree.Node, results: LookupDefinition[]) => void
) {
  const checkResults = (results: LookupDefinition[] | null) => {
    return results && (!defn || sameLookupResult(results, defn));
  };
  state.pre = (node) => {
    switch (node.type) {
      case "CallExpression":
        // A call expression whose callee is an identifier is looked
        // up as a non-local. ie even if there's a same named local,
        // it will be ignored, and the lookup will start as if the
        // call had been written self.foo() rather than foo().
        if (node.callee.type === "Identifier") {
          if (!name || node.callee.name === name) {
            const [name, results] = state.lookupNonlocal(node.callee);
            if (name && checkResults(results)) {
              callback(node.callee, results);
            }
          }
          return ["arguments"];
        }
        break;
      case "Identifier":
        if (!name || node.name === name) {
          const [name, results] = state.lookup(node);
          if (name && checkResults(results)) {
            callback(node, results);
          }
        }
        break;
      case "MemberExpression":
        if (!node.computed && node.property.type === "Identifier") {
          if (!name || node.property.name === name) {
            const [name, results] = state.lookup(node);
            if (name && checkResults(results)) {
              callback(node, results);
            }
          }
          return ["object"];
        }
        break;
    }
    return null;
  };
  collectNamespaces(ast, state);
  delete state.pre;
}

export function currentWorkspace(
  ws?: string | vscode.WorkspaceFolder
): vscode.WorkspaceFolder {
  if (ws) {
    if (typeof ws === "string") {
      const wsf = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(ws));
      if (!wsf) throw new Error(`No workspace at ${ws}`);
      return wsf;
    }
    return ws;
  }

  if (vscode.workspace.workspaceFolders?.length === 1) {
    return vscode.workspace.workspaceFolders[0];
  }

  if (vscode.window.activeTextEditor) {
    const wsf = vscode.workspace.getWorkspaceFolder(
      vscode.window.activeTextEditor.document.uri
    );
    if (wsf) {
      return wsf;
    }
  }
  throw new Error(`No workspace found`);
}

export function getOptimizerBaseConfig(
  ws?: string | vscode.WorkspaceFolder
): BuildConfig {
  const workspaceFolder = currentWorkspace(ws);
  const workspace = normalize(workspaceFolder.uri.fsPath);
  const config: Record<string, unknown> = { workspace };
  const pmcConfig = vscode.workspace.getConfiguration(
    "prettierMonkeyC",
    workspaceFolder
  );
  for (const i of [
    "releaseBuild",
    "outputPath",
    "ignoredExcludeAnnotations",
    "ignoredAnnotations",
    "ignoredSourcePaths",
  ]) {
    if (pmcConfig[i]) config[i] = pmcConfig[i];
  }

  const mcConfig = vscode.workspace.getConfiguration(
    "monkeyC",
    workspaceFolder
  );
  for (const i of [
    "jungleFiles",
    "developerKeyPath",
    "typeCheckLevel",
    "compilerOptions",
    "compilerWarnings",
  ] as const) {
    if (mcConfig[i]) config[i] = mcConfig[i];
  }
  return config;
}
