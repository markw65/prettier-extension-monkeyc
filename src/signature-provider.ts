import {
  formatAstLongLines,
  traverseAst,
  variableDeclarationName,
} from "@markw65/monkeyc-optimizer/api.js";
import { mctree } from "@markw65/prettier-plugin-monkeyc";
import * as vscode from "vscode";
import {
  findAnalysis,
  findDefinition,
  skipToPosition,
} from "./project-manager";

export class MonkeyCSignatureProvider implements vscode.SignatureHelpProvider {
  provideSignatureHelp(
    document: vscode.TextDocument,
    position: vscode.Position,
    _cancellationToken: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.SignatureHelp> {
    return findAnalysis(
      document,
      (analysis, ast, fileName, isLastGood, project) => {
        const functionDocumentation =
          project.getFunctionDocumentation() || Promise.resolve(null);
        const result = findCallByRange(ast, fileName, position);
        if (!result) return null;
        const call = result[0];
        if (!call.callee.loc) return null;
        let calleeName: string | null = null;
        if (call.callee.type === "Identifier") {
          calleeName = call.callee.name;
        } else if (
          call.callee.type === "MemberExpression" &&
          !call.callee.computed
        ) {
          calleeName = call.callee.property.name;
        }
        if (!calleeName) return null;
        const calleePosition = new vscode.Position(
          call.callee.loc.end.line - 1,
          call.callee.loc.end.column - 1
        );
        const arg = result[1];
        return functionDocumentation.then((docinfo) =>
          findDefinition(document, calleePosition, false).then((result) => {
            const help = new vscode.SignatureHelp();
            help.signatures = result.results.flatMap((lookupDef) =>
              lookupDef.results.flatMap((decl) => {
                if (decl.type !== "FunctionDeclaration") return [];
                const body = decl.node.body;
                decl.node.body = null;
                const sig = new vscode.SignatureInformation(
                  formatAstLongLines(decl.node)
                );
                decl.node.body = body;
                sig.parameters = decl.node.params.map(
                  (param) =>
                    new vscode.ParameterInformation(
                      variableDeclarationName(param)
                    )
                );
                const doc = docinfo?.get(decl.fullName);
                if (doc) {
                  sig.documentation = new vscode.MarkdownString(doc);
                }
                return sig;
              })
            );
            help.activeParameter = arg;
            return help;
          })
        );
      }
    ).then((x) => x);
  }
}

function findCallByRange(
  ast: mctree.Program,
  fileName: string,
  position: vscode.Position
) {
  let result = null as mctree.CallExpression | null;
  traverseAst(ast, (node) => {
    if (!skipToPosition(node, position, fileName)) {
      return false;
    }
    if (node.type === "CallExpression") {
      result = node;
    }
    return null;
  });
  if (!result) return null;
  const arg = result.arguments.reduce(
    (i, argument, index) =>
      argument.loc &&
      (argument.loc.end.line <= position.line ||
        (argument.loc.end.line == position.line + 1 &&
          argument.loc.end.column <= position.character + 1))
        ? index + 1
        : i,
    0
  );
  return [result, arg] as const;
}
