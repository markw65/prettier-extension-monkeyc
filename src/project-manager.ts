import {
  Analysis,
  BuildConfig,
  getProjectAnalysis,
  get_jungle,
  JungleBuildDependencies,
  JungleError,
  JungleResourceMap,
  LookupDefinition,
  manifestProducts,
  PreAnalysis,
  ProgramState,
  ProgramStateAnalysis,
  ResolvedJungle,
  TypeMap,
} from "@markw65/monkeyc-optimizer";
import {
  createDocumentationMap,
  hasProperty,
  isStateNode,
  visitorNode,
  visitReferences,
} from "@markw65/monkeyc-optimizer/api.js";
import {
  connectiq,
  getDeviceInfo,
  getFunctionDocumentation,
  xmlUtil,
} from "@markw65/monkeyc-optimizer/sdk-util.js";
import { mctree } from "@markw65/prettier-plugin-monkeyc";
import { existsSync } from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { extensionVersion } from "./extension";

type UpdateElem = { file: string; content: string | null | false };

export function normalize(filepath: string) {
  return filepath.replace(/[\\]/g, "/");
}

export class Project implements vscode.Disposable {
  private currentAnalysis: Analysis | PreAnalysis | null = null;
  public lastGoodAnalysis: Analysis | null = null;
  private junglePromise: Promise<void> = Promise.resolve();
  public resources: JungleResourceMap | null | undefined;
  public buildRuleDependencies: JungleBuildDependencies = {};
  private jungleResult: ResolvedJungle | null = null;
  private currentTimer: NodeJS.Timeout | null = null;
  private currentUpdates: Record<string, string | null | false> | null = null;
  private firstUpdateInBatch = 0;
  private disposables: vscode.Disposable[] = [];
  private extraWatchers: vscode.Disposable[] = [];
  private diagnosticCollection =
    vscode.languages.createDiagnosticCollection("analysis");
  private lastDevice: string | null = null;
  private functionDocumentation: Promise<Map<string, string> | null> | null =
    null;

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
          if (!deviceInfo[device]) return;
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
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(connectiq, "current-sdk.cfg")
    );

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
            this.reloadJungles(this.currentAnalysis, this.resources);
          }
        }
      }),
      watcher,
      watcher.onDidChange(() => {
        this.reloadJungles(this.currentAnalysis, this.resources);
        this.functionDocumentation = null;
        this.getFunctionDocumentation();
      })
    );

    this.reloadJungles(null, null);
    this.getFunctionDocumentation();
  }

  clearExtraWatchers() {
    this.extraWatchers.forEach((item) => item.dispose());
    this.extraWatchers.length = 0;
  }

  dispose() {
    this.disposables.forEach((item) => item.dispose());
    this.clearExtraWatchers();
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
        error.location.end.line - 1,
        error.location.end.column - 1
      );
      if (error.location.source) {
        filepath = error.location.source;
      }
    } else {
      range = new vscode.Range(0, 0, 0, 0);
    }
    const diagnostic = new vscode.Diagnostic(
      range,
      error.message,
      vscode.DiagnosticSeverity.Error
    );
    diagnostic.source = "[pmc-analysis]";
    const diagnostics = [diagnostic];

    this.diagnosticCollection.set(vscode.Uri.file(filepath), diagnostics);
  }

  private reloadJungles(
    oldAnalysis: PreAnalysis | null,
    resources: JungleResourceMap | undefined | null
  ) {
    this.currentAnalysis = null;
    this.clearExtraWatchers();
    this.junglePromise = get_jungle(
      this.options.jungleFiles!,
      this.options,
      resources || undefined
    )
      .catch((e) => {
        this.resources = null;
        this.jungleResult = null;
        if (e instanceof Error) {
          const err: JungleError = e;
          if (err && err.buildDependencies) {
            this.buildRuleDependencies = err.buildDependencies;
            throw err;
          }
        }
        this.buildRuleDependencies = Object.fromEntries(
          this.options
            .jungleFiles!.split(";")
            .concat("barrels.jungle")
            .concat("manifest.xml")
            .map((file) => [
              normalize(path.resolve(this.options!.workspace!, file)),
              true,
            ])
        );
        throw e;
      })
      .then((jungleResult) => {
        this.jungleResult = jungleResult;
        if (!jungleResult) return;
        return this.runAnalysis(oldAnalysis);
      })
      .catch((e) => {
        this.addExtraWatchers();
        if (e instanceof Error) {
          this.diagnosticCollection.clear();
          this.diagnosticFromError(e, this.options.jungleFiles || "");
          return;
        }
        throw e;
      });
  }

  private addExtraWatchers() {
    if (!this.buildRuleDependencies) return;
    const filesToWatch = Object.keys(this.buildRuleDependencies);
    if (this.currentAnalysis) {
      filesToWatch.push(...Object.keys(this.currentAnalysis.fnMap));
    }
    if (this.resources) {
      filesToWatch.push(...Object.keys(this.resources));
    }
    const workspace = this.workspaceFolder.uri.fsPath;
    filesToWatch
      .map((file) => path.relative(workspace, file))
      .filter((file) => file.startsWith("."))
      .map((file) => normalize(path.dirname(path.resolve(workspace, file))))
      .sort()
      // uniquify, but also drop subfolders.
      // ie given foo and foo/bar, only keep foo.
      .reduce((result, dir) => {
        const i = result.length;
        if (
          !i ||
          (dir !== result[i - 1] && !dir.startsWith(result[i - 1] + "/"))
        ) {
          result.push(dir);
        }
        return result;
      }, [] as string[])
      .forEach((dir) => {
        const watcher = vscode.workspace.createFileSystemWatcher(
          new vscode.RelativePattern(dir, "**/*")
        );
        const fileChange = (uri: vscode.Uri, content: false | null) => {
          this.onFilesUpdate([{ file: normalize(uri.fsPath), content }]);
        };

        this.extraWatchers.push(
          watcher,
          watcher.onDidChange((e) => fileChange(e, null)),
          watcher.onDidCreate((e) => fileChange(e, null)),
          watcher.onDidDelete((e) => fileChange(e, false))
        );
      });
  }

  private runAnalysis(oldAnalysis: PreAnalysis | null) {
    this.currentAnalysis = null;
    this.clearExtraWatchers();
    if (!this.jungleResult) {
      throw new Error("Missing jungleResult");
    }
    const { targets, resources, buildDependencies, xml /*, annotations */ } =
      this.jungleResult;
    this.buildRuleDependencies = buildDependencies;
    this.resources = resources;
    return getProjectAnalysis(targets, oldAnalysis, xml, this.options)
      .then((analysis) => {
        this.currentAnalysis = analysis;
        this.diagnosticCollection.clear();
        this.addExtraWatchers();
        const disableLiveAnalysis =
          vscode.workspace
            .getConfiguration("prettierMonkeyC", this.workspaceFolder)
            .get("disableLiveAnalysis") === true;

        disableLiveAnalysis ||
          Object.entries(resources).forEach(
            ([file, rez_or_err]) =>
              rez_or_err instanceof Error &&
              this.diagnosticFromError(rez_or_err, file)
          );

        if ("state" in analysis) {
          this.lastGoodAnalysis = analysis;
          disableLiveAnalysis ||
            processDiagnostics(
              analysis.state.diagnostics,
              {},
              this.diagnosticCollection,
              "analysis"
            );
          return;
        }
        disableLiveAnalysis ||
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
    const analysis: PreAnalysis | null = this.currentAnalysis;
    files.forEach(({ file, content }) => {
      if (hasProperty(this.resources, file)) {
        if (content) {
          const rez = this.resources[file];
          if (!rez || rez.source === content) {
            if (this.currentUpdates) {
              // if there was an update to the file, and then this
              // change reverts that, we should delete the original
              // update.
              delete this.currentUpdates[file];
            }
            return;
          }
        }
      } else if (hasProperty(this.buildRuleDependencies, file)) {
        if (content) {
          const rez = this.buildRuleDependencies[file];
          if (!(rez instanceof xmlUtil.Document)) {
            // Ignore in memory changes to non-resource
            // buildRuleDependencies, because get_jungles always
            // reads from the file system.
            return;
          }
          if (rez.source === content) {
            if (this.currentUpdates) {
              // if there was an update to the file, and then this
              // change reverts that, we should delete the original
              // update.
              delete this.currentUpdates[file];
            }
            return;
          }
        }
      } else if (analysis && hasProperty(analysis.fnMap, file)) {
        const fileInfo = analysis.fnMap[file];
        if (!fileInfo || content === fileInfo.monkeyCSource) {
          if (this.currentUpdates) {
            // if there was an update to the file, and then this
            // change reverts that, we should delete the original
            // update.
            delete this.currentUpdates[file];
          }
          return;
        }
      } else if (content === false) {
        // A delete event. If a whole directory is deleted, we get
        // the event for the directory, but not for its contents.
        // So check that here...
        const update = Object.keys(analysis ? analysis.fnMap : {})
          .concat(Object.keys(this.buildRuleDependencies))
          .concat(this.resources ? Object.keys(this.resources) : [])
          .filter((f) => !normalize(path.relative(file, f)).startsWith("."))
          .map((f) => ({ file: f, content: false } as const));
        update.length && this.onFilesUpdate(update);
        return;
      } else if (
        normalize(
          path.relative(this.workspaceFolder.uri.fsPath, file)
        ).startsWith(".")
      ) {
        // This file belongs to another project in the same
        // workspace. Ignore it.
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
    let resources: JungleResourceMap = this.resources || {};
    let restart = false;
    Object.entries(files).forEach(([file, content]) => {
      if (hasProperty(resources, file)) {
        const rez = resources[file];
        if (!rez || content === rez.source) {
          return;
        }
        if (resources === this.resources) {
          resources = { ...resources };
        }
        if (!content) {
          // the file was deleted, or we don't know what
          // its contents are. Either way, just remove it
          // from the cache
          delete resources[file];
        } else {
          resources[file] = xmlUtil.parseXml(content, file);
        }
        restart = true;
        return;
      }
      if (hasProperty(this.buildRuleDependencies, file)) {
        const oldContent = this.buildRuleDependencies[file];
        if (oldContent instanceof xmlUtil.Document) {
          if (content === oldContent.source) {
            return;
          }
          if (resources === this.resources) {
            resources = { ...resources };
          }
          if (!content) {
            // the file was deleted, or we don't know what
            // its contents are. Either way, just remove it
            // from the cache
            delete this.buildRuleDependencies[file];
          } else {
            this.buildRuleDependencies[file] = xmlUtil.parseXml(content, file);
          }
        }
        restart = true;
        return;
      }
      if (analysis) {
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
              const { ast: _a, monkeyCSource: _m, ...rest } = fileInfo;
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
      if (resources === this.resources) {
        resources = { ...resources };
      }
      Object.entries(this.buildRuleDependencies).forEach(([k, v]) => {
        if (v instanceof xmlUtil.Document) {
          resources[k] = v;
        }
      });
      this.reloadJungles(analysis, resources);
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

  getResources(): Promise<JungleResourceMap | null> {
    return this.getAnalysis().then(() => this.resources || null);
  }

  isWatching(file: string): boolean {
    return (this.currentAnalysis &&
      hasProperty(this.currentAnalysis.fnMap, file) &&
      this.currentAnalysis.fnMap[file]) ||
      (this.resources &&
        hasProperty(this.resources, file) &&
        this.resources[file])
      ? true
      : false;
  }

  getFunctionDocumentation() {
    if (!this.functionDocumentation) {
      this.functionDocumentation = getFunctionDocumentation().then(
        (doc) => doc && createDocumentationMap(doc)
      );
    }
    return this.functionDocumentation;
  }
}

const projects: Record<string, Project> = {};
// Given a URI, find or construct the corresponding
// MonkeyC project.
export function findProject(entity: vscode.Uri) {
  const workspace = vscode.workspace.getWorkspaceFolder(entity);
  if (!workspace) {
    // barrel files will often be outside the workspace of the file
    // that's using them; in that case, search the projects to see
    // if this is one of those files.
    const fsPath = normalize(entity.fsPath);
    return Object.values(projects).find((p) => p.isWatching(fsPath));
  }
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

export function skipToPosition(
  node: mctree.Node,
  position: vscode.Position,
  filename: string | null
) {
  if (!node.loc || node.type === "Program") return true;
  if (filename && node.loc.source && node.loc.source !== filename) {
    return false;
  }
  // skip over nodes that end before the range begins
  if (
    node.loc.end.line <= position.line ||
    (node.loc.end.line == position.line + 1 &&
      node.loc.end.column <= position.character)
  ) {
    return false;
  }
  return (
    node.loc.start.line <= position.line ||
    (node.loc.start.line == position.line + 1 &&
      node.loc.start.column <= position.character + 1)
  );
}

function findItemsByRange(
  state: ProgramStateAnalysis,
  ast: mctree.Program,
  filename: string,
  position: vscode.Position,
  typeMap: TypeMap | null | undefined,
  findSingleDefinition: boolean
) {
  const result: {
    node: mctree.Node;
    results: LookupDefinition[];
  }[] = [];
  visitReferences(
    state,
    ast,
    null,
    false,
    (node, results, error) => {
      if (node.loc && !error && results.length) {
        result.push({
          node,
          results,
        });
      }
      return undefined;
    },
    true,
    (node) => skipToPosition(node, position, filename),
    typeMap,
    findSingleDefinition
  );
  while (true) {
    const res = result.pop();
    if (!res) return null;
    if (
      res.results.some((r) =>
        r.results.some((sn) => (isStateNode(sn) ? sn.node : sn)?.loc)
      )
    ) {
      return res;
    }
  }
}

export function findAnalysis<T>(
  document: vscode.TextDocument,
  callback: (
    analysis: Analysis,
    ast: mctree.Program,
    fileName: string,
    isLastGood: boolean,
    project: Project
  ) => T,
  useLastGood = false
): Promise<Awaited<T>> {
  const project = findProject(document.uri);
  if (!project) return Promise.reject("No project found");
  return project.getAnalysis().then((analysisIn) => {
    let analysis: Analysis | null = null;
    let isLastGood = false;
    try {
      if (!analysisIn) {
        throw new Error("Project analysis not found");
      }
      if (!("state" in analysisIn)) {
        throw new Error("Project contains errors");
      }
      analysis = analysisIn;
    } catch (ex) {
      if (!useLastGood || !project.lastGoodAnalysis) {
        throw ex;
      }
      analysis = project.lastGoodAnalysis;
      isLastGood = true;
    }
    const fileName = normalize(document.uri.fsPath);
    const ast = hasProperty(analysis.fnMap, fileName)
      ? analysis.fnMap[fileName]?.ast
      : (hasProperty(project.resources, fileName) ||
          fileName === analysis.state?.manifestXML?.prolog?.loc?.source) &&
        analysis.state.rezAst;
    if (!ast) {
      throw new Error(
        hasProperty(project.buildRuleDependencies, fileName)
          ? "Symbols can only be looked up in the project's monkeyc files"
          : "Document ${document.uri.fsPath} not found in project"
      );
    }
    return Promise.resolve(
      callback(analysis, ast, fileName, isLastGood, project)
    );
  });
}

export function findDefinition(
  document: vscode.TextDocument,
  position: vscode.Position,
  findSingleDefinition: boolean
) {
  return findAnalysis(document, (analysis, ast, fileName) => {
    const result = findItemsByRange(
      analysis.state,
      ast,
      fileName,
      position,
      analysis.typeMap,
      findSingleDefinition
    );
    if (!result) {
      throw new Error("No symbol found");
    }
    const node = visitorNode(result.node);
    if (node.type !== "Identifier") {
      throw new Error(`Unexpected node type '${node.type}'`);
    }
    return {
      node,
      results: result.results,
      analysis,
    };
  });
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
  let prettier: Record<string, unknown> | null = null;

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
    "checkInvalidSymbols",
    "sizeBasedPRE",
    "enforceStatic",
    "compilerLookupRules",
    "checkCompilerLookupRules",
    "typeCheckLevel",
    "useLocalOptimizer",
    "trustDeclaredTypes",
    "propagateTypes",
    "singleUseCopyProp",
    "minimizeLocals",
    "minimizeModules",
    "iterateOptimizer",
    "postBuildOptimizer",
    "removeArgc",
    "postBuildPRE",
    "checkTypes",
  ]) {
    if (pmcConfig[i] !== undefined) {
      if (i !== "typeCheckLevel" || pmcConfig[i] !== "Default") {
        config[i] = pmcConfig[i];
      }
    }
  }

  const prettierConfig = vscode.workspace.getConfiguration(
    "prettier",
    workspaceFolder
  );
  for (const i of [
    "printWidth",
    "tabWidth",
    "useTabs",
    "trailingComma",
    "bracketSpacing",
    "requirePragma",
    "insertPragma",
  ]) {
    if (prettierConfig[i]) {
      if (!prettier) {
        prettier = {};
      }
      prettier[i] = prettierConfig[i];
    }
  }
  if (prettier) {
    config.prettier = prettier;
  }
  config.extensionVersion = extensionVersion;
  return config;
}

export function processDiagnostics(
  optimizerDiags: ProgramState["diagnostics"],
  diagnostics: Record<string, vscode.Diagnostic[]>,
  diagnosticCollection: vscode.DiagnosticCollection,
  tag: string,
  callback?: (
    diagnostic: NonNullable<ProgramState["diagnostics"]>[string][number],
    rel: string
  ) => void,
  workspace?: string
) {
  if (!optimizerDiags) return;
  const rangeFromLoc = (loc: mctree.SourceLocation) =>
    new vscode.Range(
      loc.start.line - 1,
      loc.start.column - 1,
      loc.end.line - 1,
      loc.end.column - 1
    );
  Object.entries(optimizerDiags).forEach(([file, diags]) => {
    const rel = workspace ? path.relative(workspace, file) : file;
    diags.forEach((diag) => {
      const range = rangeFromLoc(diag.loc);
      const diagnostic = new vscode.Diagnostic(
        range,
        `${diag.message}`,
        diag.type === "ERROR"
          ? vscode.DiagnosticSeverity.Error
          : diag.type === "WARNING"
          ? vscode.DiagnosticSeverity.Warning
          : vscode.DiagnosticSeverity.Information
      );
      diagnostic.source = `[pmc-${tag}]`;
      if (diag.extra) {
        diagnostic.code = {
          target: vscode.Uri.parse(diag.extra.uri),
          value: diag.extra.message,
        };
      }
      if (diag.related) {
        diagnostic.relatedInformation = [];
        diag.related.forEach((rel) =>
          diagnostic.relatedInformation?.push(
            new vscode.DiagnosticRelatedInformation(
              new vscode.Location(
                vscode.Uri.file(rel.loc.source),
                rangeFromLoc(rel.loc)
              ),
              rel.message
            )
          )
        );
      }

      if (!hasProperty(diagnostics, rel)) {
        diagnostics[rel] = [];
      }
      diagnostics[rel].push(diagnostic);
      callback && callback(diag, file);
    });
    const uri = vscode.Uri.file(file);
    diagnosticCollection.set(uri, diagnostics[rel]);
  });
}
