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
    if (
      vscode.workspace
        .getConfiguration("prettierMonkeyC", document)
        .get("disableSignature") === true
    ) {
      return null;
    }
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
          findDefinition(document, calleePosition, false).then((results) =>
            Promise.all(
              results.flatMap((result) =>
                Promise.all(
                  result.results.flatMap((lookupDef) =>
                    lookupDef.results.map(async (decl) => {
                      if (decl.type !== "FunctionDeclaration") return null;
                      const node = { ...decl.node };
                      node.body = null;
                      const sig = new vscode.SignatureInformation(
                        await formatAstLongLines(node)
                      );
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
                  )
                )
              )
            ).then((signatures) => {
              const compare = (
                sig1: vscode.SignatureInformation,
                sig2: vscode.SignatureInformation
              ) => {
                if (sig1.label < sig2.label) return -1;
                if (sig1.label > sig2.label) return 1;
                if (sig1.parameters.length !== sig2.parameters.length) {
                  return sig1.parameters.length - sig2.parameters.length;
                }
                for (let i = 0; i < sig1.parameters.length; i++) {
                  const p1 = sig1.parameters[i];
                  const p2 = sig2.parameters[i];
                  if (p1.label < p2.label) return -1;
                  if (p1.label > p2.label) return 1;
                  const diff =
                    (p1.documentation?.toString().length ?? 0) -
                    (p2.documentation?.toString().length ?? 0);
                  if (diff) return diff;
                }
                return (
                  (sig1.documentation?.toString().length ?? 0) -
                  (sig2.documentation?.toString().length ?? 0)
                );
              };
              const help = new vscode.SignatureHelp();
              help.signatures = signatures
                .flat()
                .filter((s): s is vscode.SignatureInformation => s != null)
                .sort(compare)
                .filter((s, i, arr) => !i || compare(s, arr[i - 1]));
              help.activeParameter = arg;
              return help;
            })
          )
        );
      }
    );
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
        (argument.loc.end.line === position.line + 1 &&
          argument.loc.end.column <= position.character + 1))
        ? index + 1
        : i,
    0
  );
  return [result, arg] as const;
}
