import * as vscode from "vscode";
import { findProject, Project, normalize } from "./project-manager";
import { mctree } from "@markw65/monkeyc-optimizer";
import {
  traverseAst,
  variableDeclarationName,
} from "@markw65/monkeyc-optimizer/api.js";

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
      const file = analysis.fnMap[normalize(document.uri.fsPath)];
      if (!file) {
        return Promise.resolve([]);
      }
      if (!file.ast) {
        return Promise.reject(
          "Document ${document.uri.fsPath} did not parse correctly"
        );
      }
      const symbol = (
        name: string,
        kind: vscode.SymbolKind,
        node: mctree.Node,
        selNode: mctree.Node
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

      return this.getSymbols(file.ast, symbol);
    });
  }
  getSymbols<T extends SymbolInfo>(
    ast: mctree.Program,
    symbol: (
      name: string,
      kind: vscode.SymbolKind,
      node: mctree.Node,
      selNode: mctree.Node
    ) => T | undefined
  ) {
    const stack: SymbolElem<T>[] = [{ type: "" }];
    const appendChildren = (symbol: T, children: T[]) => {
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
    };
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
              node.kind == "const"
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
      () => {
        const elm = stack.pop()!;
        const back = stack[stack.length - 1];
        if (elm.children && elm.symbol) {
          appendChildren(elm.symbol, elm.children);
          elm.children = undefined;
        }
        const symbols = elm.symbol ? [elm.symbol] : elm.children;
        if (symbols) {
          if (back.symbol) {
            appendChildren(back.symbol, symbols);
          } else if (back.children) {
            back.children.push(...symbols);
          } else {
            back.children = symbols;
          }
        }
      }
    );
    return stack[0].children;
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
    return Promise.all(
      projects.map((project) =>
        project.getAnalysis().then(
          (analysis) =>
            analysis &&
            Object.entries(analysis.fnMap).map(([filepath, file]) => {
              if (!file.ast) {
                return null;
              }
              const symbol = (
                name: string,
                kind: vscode.SymbolKind,
                node: mctree.Node,
                selNode: mctree.Node
              ) => {
                if (!search.test(name)) return undefined;
                const loc = selNode.loc || node.loc;
                if (!loc) return undefined;
                return new vscode.SymbolInformation(
                  name,
                  kind,
                  "",
                  new vscode.Location(vscode.Uri.file(filepath), range(loc))
                );
              };

              return this.getSymbols(file.ast, symbol);
            })
        )
      )
    ).then((symbolArrays) =>
      symbolArrays
        .flat(3)
        .filter((s): s is vscode.SymbolInformation => s != null)
    );
  }
}
