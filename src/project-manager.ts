import {
  Analysis,
  PreAnalysis,
  getProjectAnalysis,
  get_jungle,
  ResolvedJungle,
} from "@markw65/monkeyc-optimizer";
import { mctree } from "@markw65/prettier-plugin-monkeyc";

import {
  collectNamespaces,
  hasProperty,
} from "@markw65/monkeyc-optimizer/api.js";
import { existsSync } from "fs";
import * as path from "path";
import * as vscode from "vscode";

type UpdateElem = { file: string; content: string | null };

export function normalize(filepath: string) {
  return filepath.replace(/[\\]/g, "/");
}

export class Project implements vscode.Disposable {
  private currentAnalysis: Analysis | PreAnalysis | null = null;
  private junglePromise: Promise<unknown>;
  private buildRuleDependencies: Record<string, string> = {};
  private jungleResult: ResolvedJungle | null = null;
  private options: BuildConfig;
  private currentTimer: NodeJS.Timeout | null = null;
  private currentUpdates: Record<string, string | null> | null = null;
  private firstUpdateInBatch: number = 0;
  private fileSystemWatcher: vscode.FileSystemWatcher;
  private disposables: vscode.Disposable[] = [];
  private diagnosticCollection = vscode.languages.createDiagnosticCollection();

  constructor(private workspaceFolder: vscode.WorkspaceFolder) {
    const workspace = normalize(this.workspaceFolder.uri.fsPath);
    const options = getOptimizerBaseConfig(workspace);
    if (!options.jungleFiles || options.jungleFiles === "") {
      options.jungleFiles = "monkey.jungle";
    }
    if (
      !options.jungleFiles
        .split(";")
        .map((file) => path.resolve(workspace, file))
        .every((file) => existsSync(file))
    ) {
      throw new Error(`Didn't find a ciq project at '${workspace}'`);
    }
    this.options = options;
    this.reloadJungles(null);

    this.fileSystemWatcher = vscode.workspace.createFileSystemWatcher(
      "**/*.{mc,jungle,xml}"
    );

    const fileChange = (e: vscode.Uri) => {
      this.onFilesUpdate([{ file: normalize(e.fsPath), content: null }]);
    };

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (!e.contentChanges.length) return;
        this.onFilesUpdate([
          {
            file: normalize(e.document.uri.fsPath),
            content: e.document.getText(),
          },
        ]);
      }),

      vscode.workspace.onDidChangeWorkspaceFolders((e) => {
        if (
          e.removed.find(
            (w) => normalize(w.uri.fsPath) === this.options.workspace
          )
        ) {
          delete projects[this.workspaceFolder.uri.toString()];
          this.dispose();
        }
      }),
      this.fileSystemWatcher.onDidChange(fileChange),
      this.fileSystemWatcher.onDidCreate(fileChange),
      this.fileSystemWatcher.onDidDelete(fileChange),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (
          e.affectsConfiguration("monkeyC") ||
          e.affectsConfiguration("prettierMonkeyC")
        ) {
          const old = JSON.stringify(this.options);
          this.options = getOptimizerBaseConfig(workspace);
          if (JSON.stringify(this.options) !== old) {
            this.reloadJungles(this.currentAnalysis);
          }
        }
      })
    );
  }

  dispose() {
    this.disposables.forEach((item) => item.dispose());
    this.fileSystemWatcher.dispose();
    this.diagnosticCollection.dispose();
  }

  private reloadJungles(oldAnalysis: PreAnalysis | null) {
    this.junglePromise = get_jungle(
      this.options.jungleFiles!,
      this.options
    ).then((jungleResult) => {
      this.jungleResult = jungleResult;
      return this.runAnalysis(oldAnalysis);
    });
  }

  private runAnalysis(oldAnalysis: PreAnalysis | null) {
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
    return getProjectAnalysis(targets, oldAnalysis, this.options).then(
      (analysis) => {
        this.currentAnalysis = analysis;
        if ("state" in analysis) {
          this.diagnosticCollection.clear();
          return;
        }
        Object.entries(analysis.fnMap).forEach(([filepath, info]) => {
          const diagnostics = [];
          if (info.parserError) {
            interface PeggyError extends Error {
              location: mctree.Node["loc"];
            }
            const error = info.parserError as Error | PeggyError;
            const range =
              "location" in error && error.location
                ? new vscode.Range(
                    error.location.start.line - 1,
                    error.location.start.column - 1,
                    error.location.start.line - 1,
                    error.location.start.column - 1
                  )
                : new vscode.Range(0, 0, 0, 0);
            diagnostics.push(
              new vscode.Diagnostic(
                range,
                error.message,
                vscode.DiagnosticSeverity.Error
              )
            );
          }
          this.diagnosticCollection.set(vscode.Uri.file(filepath), diagnostics);
        });
      }
    );
  }

  private onFilesUpdate(files: Array<UpdateElem>) {
    if (!this.currentAnalysis) return;
    let analysis: PreAnalysis = this.currentAnalysis;
    files.forEach(({ file, content }) => {
      if (hasProperty(analysis.fnMap, file)) {
        const fileInfo = analysis.fnMap[file];
        if (!fileInfo || content === fileInfo.monkeyCSource) {
          return;
        }
      } else if (
        !hasProperty(this.buildRuleDependencies, file) ||
        content === this.buildRuleDependencies[file]
      ) {
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
    if (!this.currentAnalysis) return;
    const files = this.currentUpdates;
    this.currentUpdates = null;
    if (!files) return;
    let analysis: PreAnalysis = this.currentAnalysis;
    let restart = false;
    Object.entries(files).forEach(([file, content]) => {
      if (hasProperty(analysis.fnMap, file)) {
        const fileInfo = analysis.fnMap[file];
        if (!fileInfo) {
          return;
        }
        if (content !== fileInfo.monkeyCSource) {
          if (analysis === this.currentAnalysis) {
            analysis = { ...analysis, fnMap: { ...analysis.fnMap } };
          }
          const { ast, monkeyCSource, ...rest } = fileInfo;
          analysis.fnMap[file] = rest;
          if (content != null) {
            analysis.fnMap[file].monkeyCSource = content;
          }
        }
      } else if (
        hasProperty(this.buildRuleDependencies, file) &&
        content !== this.buildRuleDependencies[file]
      ) {
        restart = true;
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
    return this.junglePromise
      .catch((e) => {
        if (e instanceof Error) {
          vscode.window.showErrorMessage(e.message);
        }
        throw e;
      })
      .then(() => this.currentAnalysis);
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
  try {
    return (projects[key] = new Project(workspace));
  } catch (ex) {
    return null;
  }
}

export function findItemsByRange(
  state: ProgramState,
  ast: mctree.Program,
  range: vscode.Range
) {
  let result: { node: mctree.Node; stack: ProgramStateStack }[] = [];
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
      result.push({ node, stack: state.stack!.slice() });
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
    const [name, results, where] = analysis.state.lookup!(
      expr.node,
      null,
      expr.stack
    );
    return { node: expr.node, name, results, where, analysis };
  });
}

export function visitReferences(
  state: ProgramState,
  ast: mctree.Program,
  name: string,
  defn: StateNodeDecl[],
  callback: (node: mctree.Node) => void
) {
  const checkResults = (results: StateNodeDecl[] | null) => {
    return (
      results &&
      results.length === defn.length &&
      results.every((r, i) => r === defn[i])
    );
  };
  state.pre = (node) => {
    switch (node.type) {
      case "Identifier":
        if (node.name === name) {
          const [name, results] = state.lookup!(node);
          if (name && checkResults(results)) {
            callback(node);
          }
        }
        break;
      case "MemberExpression":
        if (!node.computed && node.property.type === "Identifier") {
          if (node.property.name === name) {
            const [name, results] = state.lookup!(node);
            if (name && checkResults(results)) {
              callback(node);
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

export function getOptimizerBaseConfig(workspace?: string): BuildConfig {
  if (!workspace) {
    if (
      !vscode.workspace.workspaceFolders ||
      !vscode.workspace.workspaceFolders.length
    ) {
      throw new Error("No workspace folder found!");
    }
    workspace = vscode.workspace.workspaceFolders[0].uri.fsPath;
  }
  workspace = normalize(workspace);
  const config: Record<string, unknown> = { workspace };
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
  ] as const) {
    if (mcConfig[i]) config[i] = mcConfig[i];
  }
  return config;
}
