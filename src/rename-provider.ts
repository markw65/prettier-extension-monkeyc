import {
  hasProperty,
  isStateNode,
  visitReferences,
  visitorNode,
} from "@markw65/monkeyc-optimizer/api.js";
import * as vscode from "vscode";
import { findDefinition, normalize } from "./project-manager.js";

export class MonkeyCRenameRefProvider
  implements vscode.RenameProvider, vscode.ReferenceProvider
{
  private getRenameInfo(
    document: vscode.TextDocument,
    position: vscode.Position
  ) {
    return findDefinition(document, position).then(
      ({ node, results, analysis }) => {
        if (node && results) {
          if (
            !results.every(({ parent, results }) => {
              if (
                (isStateNode(results[0]) ? results[0].node : results[0])?.loc
                  ?.source === "api.mir"
              ) {
                return false;
              }
              // - Anything other than a var/const, func or enum value can be
              //   renamed wherever its declared.
              // - an identifier defined in a block (a local) or function
              //   (a parameter) can always be renamed.
              // - an identifier defined in a module can be renamed unless
              //   the program uses its symbol in unknown ways.
              return (
                !results.some(
                  (r) =>
                    r.type === "VariableDeclarator" ||
                    r.type === "EnumStringMember" ||
                    r.type === "TypedefDeclaration" ||
                    r.type === "FunctionDeclaration"
                ) ||
                (parent &&
                  (parent.type === "BlockStatement" ||
                    parent.type === "FunctionDeclaration")) ||
                ((!parent ||
                  parent.type === "ModuleDeclaration" ||
                  parent.type === "Program") &&
                  !hasProperty(analysis.state.exposed, node.name))
              );
            })
          ) {
            return Promise.reject(`Unable to rename ${node.name}`);
          }
          if (node.name === "$") {
            return Promise.reject(`Can't rename the global module`);
          }
          return {
            id: node,
            results,
            analysis,
          };
        }
        return Promise.reject("No renamable symbol found");
      }
    );
  }

  prepareRename(
    document: vscode.TextDocument,
    position: vscode.Position,
    _cancellationToken: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Range> {
    return this.getRenameInfo(document, position).then(({ id }) => {
      return new vscode.Range(
        id.loc!.start.line - 1,
        id.loc!.start.column - 1,
        id.loc!.end.line - 1,
        id.loc!.end.column - 1
      );
    });
  }

  provideRenameEdits(
    document: vscode.TextDocument,
    position: vscode.Position,
    newName: string,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.WorkspaceEdit> {
    return this.getRenameInfo(document, position)
      .then(({ id, results, analysis }) => {
        const edits = new vscode.WorkspaceEdit();
        const asts = results.every(
          ({ parent }) =>
            parent &&
            (parent.type == "BlockStatement" ||
              parent.type === "FunctionDeclaration")
        )
          ? [analysis.fnMap[normalize(document.uri.fsPath)].ast]
          : Object.values(analysis.fnMap)
              .map(({ ast }) => ast)
              .concat(analysis.state.rezAst ? [analysis.state.rezAst] : []);
        asts.forEach((ast) => {
          visitReferences(
            analysis.state,
            ast,
            id.name,
            results,
            (node) => {
              const n = visitorNode(node);
              const loc = n.loc!;
              edits.replace(
                vscode.Uri.file(loc.source!),
                new vscode.Range(
                  loc.start.line - 1,
                  loc.start.column - 1,
                  loc.end.line - 1,
                  loc.end.column - 1
                ),
                newName
              );
              return undefined;
            },
            true
          );
        });
        return edits;
      })
      .catch(() => null);
  }

  provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.ReferenceContext,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Location[]> {
    return findDefinition(document, position).then(
      ({ node, results, analysis }) => {
        if (node && results) {
          const references: vscode.Location[] = [];
          const asts = results.every(
            ({ parent }) =>
              parent &&
              (parent.type == "BlockStatement" ||
                parent.type === "FunctionDeclaration")
          )
            ? [analysis.fnMap[normalize(document.uri.fsPath)].ast]
            : Object.values(analysis.fnMap)
                .map(({ ast }) => ast)
                .concat(analysis.state.rezAst ? [analysis.state.rezAst] : []);
          asts.forEach((ast) => {
            visitReferences(analysis.state, ast, node.name, results, (node) => {
              const n = visitorNode(node);
              const loc = n.loc!;
              references.push(
                new vscode.Location(
                  vscode.Uri.file(loc.source!),
                  new vscode.Range(
                    loc.start.line - 1,
                    loc.start.column - 1,
                    loc.end.line - 1,
                    loc.end.column - 1
                  )
                )
              );
              return undefined;
            });
          });
          return references;
        }
        return null;
      }
    );
  }
}
