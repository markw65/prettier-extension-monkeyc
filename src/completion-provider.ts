import { StateNode, StateNodeDecl } from "@markw65/monkeyc-optimizer";
import {
  findNamesInScope,
  formatAstLongLines,
  isStateNode,
  mapVarDeclsByType,
  traverseAst,
} from "@markw65/monkeyc-optimizer/api.js";
import { mctree } from "@markw65/prettier-plugin-monkeyc";
import * as vscode from "vscode";
import {
  findAnalysis,
  findDefinition,
  skipToPosition,
} from "./project-manager";

export class MonkeyCCompletionItemProvider
  implements vscode.CompletionItemProvider
{
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): vscode.ProviderResult<
    vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>
  > {
    return findAnalysis(document, (analysis, ast, fileName) => {
      const result = findIdentByRange(ast, fileName, position);
      if (!result) return null;
      if (
        result.type === "MemberExpression" &&
        result.object.loc &&
        !result.computed
      ) {
        const objectPosition = new vscode.Position(
          result.object.loc.end.line - 1,
          result.object.loc.end.column - 1
        );
        return findDefinition(document, objectPosition, false).then(
          (definition) => {
            const decls = mapVarDeclsByType(
              analysis.state,
              definition.results.flatMap((lookupDefn) => lookupDefn.results),
              result.object,
              analysis.typeMap
            ).filter(isStateNode);
            return findNamesInScope(decls, result.property.name)
              .map(([decl, { parent, depth }]) => {
                const name = (() => {
                  switch (decl.type) {
                    case "BinaryExpression":
                      return decl.left.name;
                    case "Identifier":
                      return decl.name;
                    case "EnumStringMember":
                      return decl.id.name;
                    default:
                      return decl.name;
                  }
                })();
                if (!name) return null;

                const item = new vscode.CompletionItem(name);
                item.sortText = `${"!!!!!!!!!!!!".substring(depth)}${name}`;
                //item.filterText = result.property.name;
                const detail = completionDetail(parent, decl);
                if (detail) {
                  item.detail = detail;
                }
                const kind = completionKind(decl);
                if (kind) {
                  item.kind = kind;
                }
                return item;
              })
              .filter((item): item is vscode.CompletionItem => item != null);
          }
        );
      }
      return null;
    });
  }
}

function findIdentByRange(
  ast: mctree.Program,
  fileName: string,
  position: vscode.Position
) {
  let result = null as mctree.Identifier | mctree.MemberExpression | null;
  traverseAst(ast, (node) => {
    if (!skipToPosition(node, position, fileName)) {
      return false;
    }
    if (node.type === "MemberExpression") {
      if (!node.computed) {
        result = node;
        return ["object"];
      }
    }
    if (node.type === "Identifier") {
      result = node;
    }
    return null;
  });
  return result;
}

function completionKind(decl: StateNodeDecl): vscode.CompletionItemKind | null {
  switch (decl.type) {
    case "ModuleDeclaration":
      return vscode.CompletionItemKind.Module;
    case "ClassDeclaration":
      return vscode.CompletionItemKind.Class;
    case "FunctionDeclaration": {
      const back = decl.stack?.slice(-1).pop();
      return back?.sn.type === "ClassDeclaration"
        ? decl.name === "initialize"
          ? vscode.CompletionItemKind.Constructor
          : vscode.CompletionItemKind.Method
        : vscode.CompletionItemKind.Function;
    }
    case "TypedefDeclaration":
      return vscode.CompletionItemKind.Variable;
    case "EnumDeclaration":
      return vscode.CompletionItemKind.Enum;
    case "EnumStringMember":
      return vscode.CompletionItemKind.EnumMember;
    case "VariableDeclarator":
      return decl.node.kind === "const"
        ? vscode.CompletionItemKind.Constant
        : vscode.CompletionItemKind.Variable;
    case "BinaryExpression":
    case "Identifier":
      return vscode.CompletionItemKind.Variable;
  }
  return null;
}
function completionDetail(
  parent: StateNode,
  decl: StateNodeDecl
): string | null {
  const detail = (() => {
    switch (decl.type) {
      case "ModuleDeclaration":
      case "ClassDeclaration":
      case "FunctionDeclaration":
      case "EnumDeclaration": {
        const body = decl.node.body;
        decl.node.body = null;
        const detail = formatAstLongLines(decl.node);
        decl.node.body = body;
        return detail;
      }
      case "TypedefDeclaration":
      case "VariableDeclarator":
        return formatAstLongLines(decl.node);
      case "EnumStringMember":
      case "BinaryExpression":
      case "Identifier":
        return formatAstLongLines(decl);
    }
    return null;
  })();
  if (!detail) return null;
  return `${parent.fullName}: ${detail}`;
}
