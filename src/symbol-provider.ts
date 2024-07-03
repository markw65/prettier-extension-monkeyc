import * as vscode from "vscode";
import { findProject, Project, normalize } from "./project-manager";
import { mctree } from "@markw65/monkeyc-optimizer";
import {
  traverseAst,
  variableDeclarationName,
  visit_resources,
} from "@markw65/monkeyc-optimizer/api.js";
import { xmlUtil } from "@markw65/monkeyc-optimizer/sdk-util.js";

type SymbolInfo = vscode.DocumentSymbol | vscode.SymbolInformation;
type SymbolElem<T extends SymbolInfo> = {
  type: string;
  symbol?: T;
  children?: T[];
};

function range(loc: NonNullable<mctree.Node["loc"]>) {
  return new vscode.Range(
    loc.start.line - 1,
    loc.start.column - 1,
    loc.end.line - 1,
    loc.end.column - 1
  );
}

export class MonkeyCSymbolProvider
  implements vscode.DocumentSymbolProvider, vscode.WorkspaceSymbolProvider
{
  provideDocumentSymbols(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<
    vscode.SymbolInformation[] | vscode.DocumentSymbol[]
  > {
    const project = findProject(document.uri);
    if (!project) return Promise.reject("No project found");
    return project.getAnalysis().then((analysis) => {
      if (!analysis) {
        return Promise.reject("Project analysis not found");
      }
      const symbol = (
        name: string,
        kind: vscode.SymbolKind,
        node: mctree.Node | xmlUtil.Content,
        selNode: mctree.Node | xmlUtil.Content
      ) => {
        const loc1 = node.loc || selNode.loc;
        if (!loc1) return undefined;
        const loc2 = selNode.loc || node.loc;
        return new vscode.DocumentSymbol(
          name,
          "",
          kind,
          range(loc1),
          range(loc2!)
        );
      };
      const fsPath = normalize(document.uri.fsPath);
      const file = analysis.fnMap[fsPath];
      if (file) {
        if (!file.ast) {
          return Promise.reject(
            `Document ${document.uri.fsPath} did not parse correctly`
          );
        }

        return this.getSymbolsForMC(file.ast, symbol);
      }
      const rez = project.resources && project.resources[fsPath];
      if (rez) {
        if (!(rez.body instanceof xmlUtil.Nodes)) {
          return Promise.reject(
            `Document ${document.uri.fsPath} did not parse correctly`
          );
        }
        return this.getSymbolsForRez(rez.body, symbol);
      }
      return Promise.resolve([]);
    });
  }

  provideWorkspaceSymbols(
    query: string,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.SymbolInformation[]> {
    const projects = vscode.workspace.workspaceFolders
      ?.map((ws) => findProject(ws.uri))
      .filter((p): p is Project => p != null);
    if (!projects) return Promise.reject("No projects found");
    const search = new RegExp(
      query
        .split("")
        .map((s) => s.replace(/[-/\\^$*+?.()|[\]{}]/, "\\$&"))
        .join(".*"),
      "i"
    );
    const symbol = (
      name: string,
      kind: vscode.SymbolKind,
      node: mctree.Node | xmlUtil.Content,
      selNode: mctree.Node | xmlUtil.Content
    ) => {
      if (!search.test(name)) return undefined;
      const loc = selNode.loc || node.loc;
      if (!loc || !loc.source) return undefined;
      return new vscode.SymbolInformation(
        name,
        kind,
        "",
        new vscode.Location(vscode.Uri.file(loc.source), range(loc))
      );
    };
    return Promise.all(
      projects.map((project) =>
        project.getAnalysis().then((analysis) =>
          (analysis
            ? Object.values(analysis.fnMap).map((file) => {
                if (!file.ast) {
                  return null;
                }

                return this.getSymbolsForMC(file.ast, symbol);
              })
            : []
          ).concat(
            project.resources
              ? Object.values(project.resources).map((resources) => {
                  if (!(resources.body instanceof xmlUtil.Nodes)) {
                    return null;
                  }
                  return this.getSymbolsForRez(resources.body, symbol);
                })
              : []
          )
        )
      )
    ).then((symbolArrays) =>
      symbolArrays
        .flat(3)
        .filter((s): s is vscode.SymbolInformation => s != null)
    );
  }

  getSymbolsForMC<T extends SymbolInfo>(
    ast: mctree.Program,
    symbol: (
      name: string,
      kind: vscode.SymbolKind,
      node: mctree.Node,
      selNode: mctree.Node
    ) => T | undefined
  ) {
    const stack: SymbolElem<T>[] = [{ type: "" }];
    traverseAst(
      ast,
      (node) => {
        const back = stack[stack.length - 1];
        const elm: SymbolElem<T> = { type: node.type };
        stack.push(elm);
        switch (node.type) {
          case "ModuleDeclaration":
            elm.symbol = symbol(
              node.id.name,
              vscode.SymbolKind.Module,
              node,
              node.id
            );
            break;
          case "ClassDeclaration":
            elm.symbol = symbol(
              node.id.name,
              vscode.SymbolKind.Class,
              node,
              node.id
            );
            break;
          case "FunctionDeclaration":
            elm.symbol = symbol(
              node.id.name,
              back.type === "ClassElement"
                ? node.id.name === "initialize"
                  ? vscode.SymbolKind.Constructor
                  : vscode.SymbolKind.Method
                : vscode.SymbolKind.Function,
              node,
              node.id
            );
            break;
          case "TypedefDeclaration":
            elm.symbol = symbol(
              node.id.name,
              vscode.SymbolKind.Variable,
              node,
              node.id
            );
            return [];
          case "EnumDeclaration": {
            const members = node.body.members
              .map((m) => {
                const name = "name" in m ? m.name : m.id.name;
                return symbol(
                  name,
                  vscode.SymbolKind.EnumMember,
                  m,
                  "id" in m ? m.id : m
                );
              })
              .filter((m): m is T => m != null);
            if (node.id) {
              elm.symbol = symbol(
                node.id.name,
                vscode.SymbolKind.Enum,
                node,
                node.id
              );
            }
            elm.children = members;
            return [];
          }
          case "VariableDeclarator":
            elm.symbol = symbol(
              variableDeclarationName(node.id),
              node.kind === "const"
                ? vscode.SymbolKind.Constant
                : vscode.SymbolKind.Variable,
              node,
              node.id
            );
            return [];
          case "CatchClause":
            if (node.param) {
              const id =
                node.param.type === "Identifier" ? node.param : node.param.left;
              elm.symbol = symbol(id.name, vscode.SymbolKind.Variable, id, id);
            }
            return ["body"];
        }
        return null;
      },
      () => this.postTraverse(stack)
    );
    return stack[0].children;
  }

  private appendChildren<T extends SymbolInfo>(
    symbol: T,
    children: T[],
    stack: SymbolElem<T>[]
  ) {
    if (symbol instanceof vscode.DocumentSymbol) {
      symbol.children.push(...(children as vscode.DocumentSymbol[]));
    } else {
      children.forEach(
        (child) =>
          ((child as vscode.SymbolInformation).containerName = symbol.name)
      );
      if (!stack[0].children) {
        stack[0].children = children;
      } else {
        stack[0].children.push(...children);
      }
    }
  }

  private postTraverse<T extends SymbolInfo>(stack: SymbolElem<T>[]) {
    const elm = stack.pop()!;
    const back = stack[stack.length - 1];
    if (elm.children && elm.symbol) {
      this.appendChildren(elm.symbol, elm.children, stack);
      elm.children = undefined;
    }
    const symbols = elm.symbol ? [elm.symbol] : elm.children;
    if (symbols) {
      if (back.symbol) {
        this.appendChildren(back.symbol, symbols, stack);
      } else if (back.children) {
        back.children.push(...symbols);
      } else {
        back.children = symbols;
      }
    }
  }

  getSymbolsForRez<T extends SymbolInfo>(
    body: xmlUtil.Nodes,
    symbol: (
      name: string,
      kind: vscode.SymbolKind,
      node: xmlUtil.Element,
      selNode: xmlUtil.Element
    ) => T | undefined
  ) {
    const stack: SymbolElem<T>[] = [{ type: "" }];
    visit_resources(body.elements, null, {
      pre(node: xmlUtil.Content) {
        if (node.type !== "element") return false;
        const elm: SymbolElem<T> = { type: node.name };
        stack.push(elm);
        switch (node.name) {
          case "resources":
          case "strings":
          case "fonts":
          case "animations":
          case "bitmaps":
          case "layouts":
          case "menus":
          case "drawables":
          case "properties":
          case "settings":
          case "fitContributions":
          case "jsonDataResources":
          case "complications":
            elm.symbol = symbol(
              node.name,
              vscode.SymbolKind.Namespace,
              node,
              node
            );
            break;
        }
        return true;
      },
      visit(node: xmlUtil.Element) {
        if (node.attr.id) {
          const elm = stack[stack.length - 1];
          elm.symbol = symbol(
            node.attr.id.value.value,
            vscode.SymbolKind.Constant,
            node,
            node
          );
        }
        return null;
      },
      post: () => {
        this.postTraverse(stack);
      },
    });
    return stack[0].children;
  }
}
