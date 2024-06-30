import {
  ProgramStateAnalysis,
  ProgramStateStack,
  StateNode,
  StateNodeDecl,
} from "@markw65/monkeyc-optimizer";
import {
  collectNamespaces,
  findNamesInScope,
  formatAstLongLines,
  isStateNode,
  lookupWithType,
  mapVarDeclsByType,
} from "@markw65/monkeyc-optimizer/api.js";
import { mctree } from "@markw65/prettier-plugin-monkeyc";
import * as vscode from "vscode";
import { findAnalysis, skipToPosition } from "./project-manager";

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
    if (
      vscode.workspace
        .getConfiguration("prettierMonkeyC", document)
        .get("disableCompletion") === true
    ) {
      return null;
    }
    return findAnalysis(
      document,
      (analysis, ast, fileName, isLastGood, project) => {
        const functionDocumentation =
          project.getFunctionDocumentation() || Promise.resolve(null);
        if (isLastGood) {
          let text = document.getText(
            new vscode.Range(0, 0, position.line, position.character)
          );
          const match = text.match(/(?<=\S)\s*\.\s*$/);
          if (!match) return null;
          text = text.substring(0, text.length - match[0].length);
          if (
            text !==
            analysis.fnMap[fileName].monkeyCSource?.substring(0, text.length)
          ) {
            return null;
          }
          position = position.translate(0, -match[0].length);
        }
        const info = findIdentByRange(analysis.state, ast, fileName, position);
        if (!info) return null;
        const { node, stack } = info;
        let decls: StateNode[][] | null = null;
        let name: string | null = null;
        if (isLastGood) {
          const [, definition] = lookupWithType(
            analysis.state,
            node,
            analysis.typeMap,
            false,
            stack
          );
          if (!definition) return null;
          decls = [
            mapVarDeclsByType(
              analysis.state,
              definition.flatMap((lookupDefn) => lookupDefn.results),
              node,
              analysis.typeMap
            ).filter(isStateNode),
          ];
          name = "";
        } else if (
          node.type === "MemberExpression" &&
          node.object.loc &&
          !node.computed
        ) {
          const [, definition] = lookupWithType(
            analysis.state,
            node.object,
            analysis.typeMap,
            false,
            stack
          );
          if (!definition) return null;
          decls = [
            mapVarDeclsByType(
              analysis.state,
              definition.flatMap((lookupDefn) => lookupDefn.results),
              node.object,
              analysis.typeMap
            ).filter(isStateNode),
          ];
          name = node.property.name;
        } else if (node.type === "Identifier") {
          decls = stack.map((elm) => [elm.sn]);
          name = node.name;
        }
        if (!decls) return null;
        return functionDocumentation.then((docinfo) =>
          Promise.all(
            findNamesInScope(decls!, name!).map(
              async ([decl, { parent, depth }]) => {
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
                //item.filterText = result.property.name;
                const detail = await completionDetail(parent, decl);
                if (detail) {
                  item.detail = detail.replace(/\$\.(Toybox\.)?/g, "");
                }
                if (docinfo && decl.type === "FunctionDeclaration") {
                  const doc = docinfo.get(decl.fullName);
                  if (doc) {
                    item.documentation = new vscode.MarkdownString(doc);
                  }
                }
                const info = completionInfo(decl);
                const kind = info?.[0];
                const sort = info?.[1];
                if (kind != null) {
                  item.kind = kind;
                }
                item.sortText = `!${"!!!!!!!!!!!!!!!!!".substring(depth)}${
                  sort != null ? String.fromCharCode(sort + 32) : ""
                }${name}`;
                if (!isLastGood) {
                  item.range = document.getWordRangeAtPosition(position);
                }
                return item;
              }
            )
          ).then((items) =>
            items.filter((item): item is vscode.CompletionItem => item != null)
          )
        );
      },
      true
    );
  }
}

function findIdentByRange(
  state: ProgramStateAnalysis,
  ast: mctree.Program,
  fileName: string,
  position: vscode.Position
) {
  let result = null as {
    node: mctree.Expression;
    stack: ProgramStateStack;
  } | null;
  const { pre, post, stack } = state;
  delete state.post;
  state.pre = (node) => {
    if (!skipToPosition(node, position, fileName)) {
      return [];
    }
    switch (node.type) {
      case "MemberExpression":
        if (!node.computed) {
          result = { node, stack: state.stackClone() };
        }
        break;
      case "Identifier":
      case "ThisExpression":
        result = { node, stack: state.stackClone() };
        break;
    }
    return null;
  };
  state.stack = stack.slice(0, 1);
  try {
    collectNamespaces(ast, state);
  } finally {
    state.pre = pre;
    state.post = post;
    state.stack = stack;
  }
  return result;
}

function completionInfo(
  decl: StateNodeDecl
): [vscode.CompletionItemKind, number] | null {
  switch (decl.type) {
    case "ModuleDeclaration":
      return [vscode.CompletionItemKind.Module, 0];
    case "ClassDeclaration":
      return [vscode.CompletionItemKind.Class, 10];
    case "FunctionDeclaration": {
      const back = decl.stack?.slice(-1).pop();
      return back?.sn.type === "ClassDeclaration"
        ? decl.name === "initialize"
          ? [vscode.CompletionItemKind.Constructor, 30]
          : [vscode.CompletionItemKind.Method, 40]
        : [vscode.CompletionItemKind.Function, 40];
    }
    case "TypedefDeclaration":
      return [vscode.CompletionItemKind.Variable, 50];
    case "EnumDeclaration":
      return [vscode.CompletionItemKind.Enum, 51];
    case "EnumStringMember":
      return [vscode.CompletionItemKind.EnumMember, 60];
    case "VariableDeclarator":
      return decl.node.kind === "const"
        ? [vscode.CompletionItemKind.Constant, 20]
        : [vscode.CompletionItemKind.Variable, 25];
    case "BinaryExpression":
    case "Identifier":
      return [vscode.CompletionItemKind.Variable, 25];
  }
  return null;
}

async function completionDetail(
  parent: StateNode,
  decl: StateNodeDecl
): Promise<string | null> {
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
  return `${parent.fullName}: ${await detail}`;
}
