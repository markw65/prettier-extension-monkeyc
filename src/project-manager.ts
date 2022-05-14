import {
  Analysis,
  getProjectAnalysis,
  get_jungle,
  ESTreeProgram,
  ESTreeNode,
} from "@markw65/monkeyc-optimizer";
import {
  collectNamespaces,
  hasProperty,
} from "@markw65/monkeyc-optimizer/api.js";
import { existsSync } from "fs";
import * as path from "path";
import * as vscode from "vscode";

class Project {
  private currentAnalysis: Analysis | null = null;
  private junglePromise: Promise<Analysis>;
  private buildRuleDependencies: string[] = [];

  constructor(workspaceFolder: vscode.WorkspaceFolder) {
    const workspace = workspaceFolder.uri.fsPath;
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
    this.junglePromise = get_jungle(options.jungleFiles, options)
      .then(({ manifest, targets, jungles /*xml, annotations */ }) => {
        this.buildRuleDependencies = [manifest, ...jungles];
        return getProjectAnalysis(targets, this.currentAnalysis, options);
      })
      .then((analysis) => (this.currentAnalysis = analysis));
  }

  getAnalysis(): Promise<Analysis> {
    return this.junglePromise.then((analysis) => analysis);
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
  ast: ESTreeProgram,
  range: vscode.Range
) {
  let result: { node: ESTreeNode; stack: ProgramStateStack }[] = [];
  state.pre = (node: ESTreeNode) => {
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
    const file = analysis.fnMap[document.uri.fsPath];
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
