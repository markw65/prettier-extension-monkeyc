import {
  hasProperty,
  isStateNode,
  visitReferences,
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
      ({ node, name, results, analysis }) => {
        if (
          name &&
          results &&
          (node.type === "Identifier" || node.type === "MemberExpression")
        ) {
          if (
            !results.every(({ parent, results }) => {
              if (
                (isStateNode(results[0]) ? results[0].node : results[0])?.loc
                  ?.source === "api.mir"
              ) {
                return false;
              }
              // - an identifier defined in a block (a local) or function
              //   (a parameter) can always be renamed.
              // - an identifier defined in a module can be renamed unless
              //   the program uses its symbol in unknown ways.
              return (
                (parent &&
                  (parent.type === "BlockStatement" ||
                    parent.type === "FunctionDeclaration")) ||
                ((!parent ||
                  parent.type === "ModuleDeclaration" ||
                  parent.type === "Program") &&
                  !hasProperty(analysis.state.exposed, name))
              );
            })
          ) {
            return Promise.reject(`Unable to rename ${name}`);
          }
          const id = node.type === "Identifier" ? node : node.property;
          if (id.type === "Identifier") {
            if (id.name === "$") {
              return Promise.reject(`Can't rename the global module`);
            }
            return {
              id,
              results,
              analysis,
            };
          }
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
        const files = results.every(
          ({ parent }) =>
            parent &&
            (parent.type == "BlockStatement" ||
              parent.type === "FunctionDeclaration")
        )
          ? [normalize(document.uri.fsPath)]
          : Object.keys(analysis.fnMap);
        files.forEach((name) => {
          const file = analysis.fnMap[name];
          visitReferences(
            analysis.state,
            file.ast,
            id.name,
            results,
            (node) => {
              const n = node.type === "MemberExpression" ? node.property : node;
              const loc = n.loc!;
              edits.replace(
                vscode.Uri.file(name),
                new vscode.Range(
                  loc.start.line - 1,
                  loc.start.column - 1,
                  loc.end.line - 1,
                  loc.end.column - 1
                ),
                newName
              );
            }
          );
        });
        return edits;
      })
      .catch(() => null);
  }

  provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Location[]> {
    return findDefinition(document, position).then(
      ({ node, name: ref_name, results, analysis }) => {
        if (
          ref_name &&
          results &&
          (node.type === "Identifier" || node.type === "MemberExpression")
        ) {
          const references: vscode.Location[] = [];
          const files = results.every(
            ({ parent }) =>
              parent &&
              (parent.type == "BlockStatement" ||
                parent.type === "FunctionDeclaration")
          )
            ? [normalize(document.uri.fsPath)]
            : Object.keys(analysis.fnMap);
          files.forEach((filepath) => {
            const file = analysis.fnMap[filepath];
            visitReferences(
              analysis.state,
              file.ast,
              ref_name,
              results,
              (node) => {
                const n =
                  node.type === "MemberExpression" ? node.property : node;
                const loc = n.loc!;
                references.push(
                  new vscode.Location(
                    vscode.Uri.file(filepath),
                    new vscode.Range(
                      loc.start.line - 1,
                      loc.start.column - 1,
                      loc.end.line - 1,
                      loc.end.column - 1
                    )
                  )
                );
              }
            );
          });
          return references;
        }
        return null;
      }
    );
  }
}
