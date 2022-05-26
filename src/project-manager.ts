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

type UpdateElem = { file: string; content: string | null | false };

export function normalize(filepath: string) {
  return filepath.replace(/[\\]/g, "/");
}

export class Project implements vscode.Disposable {
  private currentAnalysis: Analysis | PreAnalysis | null = null;
  private junglePromise: Promise<void> = Promise.resolve();
  private buildRuleDependencies: Record<string, string | true> = {};
  private jungleResult: ResolvedJungle | null = null;
  private options: BuildConfig;
  private currentTimer: NodeJS.Timeout | null = null;
  private currentUpdates: Record<string, string | null | false> | null = null;
  private firstUpdateInBatch: number = 0;
  private disposables: vscode.Disposable[] = [];
  private diagnosticCollection = vscode.languages.createDiagnosticCollection();

  constructor(private workspaceFolder: vscode.WorkspaceFolder) {
    const workspace = normalize(this.workspaceFolder.uri.fsPath);
    const options = getOptimizerBaseConfig(this.workspaceFolder);
    if (!options.jungleFiles || options.jungleFiles === "") {
      options.jungleFiles = "monkey.jungle";
    }
    this.options = options;

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
        if (content === this.buildRuleDependencies[file]) {
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
  try {
    return (projects[key] = new Project(workspace));
  } catch (ex) {
    return null;
  }
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
