import { hasProperty, isStateNode } from "@markw65/monkeyc-optimizer/api.js";
import * as vscode from "vscode";
import {
  findDefinition,
  visitReferences,
  normalize,
} from "./project-manager.js";

export class MonkeyCRenameRefProvider
  implements vscode.RenameProvider, vscode.ReferenceProvider
{
  private getRenameInfo(
    document: vscode.TextDocument,
    position: vscode.Position
  ) {
    return findDefinition(document, position).then(
      ({ node, name, results, where, analysis }) => {
        if (
          name &&
          where &&
          where.length &&
          results &&
          (node.type === "Identifier" || node.type === "MemberExpression")
        ) {
          const back = where[where.length - 1];
          // - an identifier defined in a block (a local) or function
          //   (a parameter) can always be renamed.
          // - an identifier defined in a module can be renamed unless
          //   the program uses its symbol in unknown ways.
          if (
            back.type !== "BlockStatement" &&
            back.type !== "FunctionDeclaration" &&
            ((back.type !== "ModuleDeclaration" && back.type !== "Program") ||
              hasProperty(analysis.state.exposed, name))
          ) {
            return Promise.reject(`Unable to rename ${name}`);
          }
          const id = node.type === "Identifier" ? node : node.property;
          if (id.type === "Identifier") {
            if (id.name === "$") {
              return Promise.reject(`Can't rename the global module`);
            }
            const origin = isStateNode(results[0])
              ? results[0].node
              : results[0];
            return {
              id,
              results,
              where,
              analysis,
              source: origin?.loc?.source,
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
    return this.getRenameInfo(document, position).then(({ id, source }) => {
      if (source == "api.mir") {
        return Promise.reject("Can't rename Toybox api entities");
      }
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
      .then(({ id, results, where, analysis }) => {
        const back = where[where.length - 1];
        const edits = new vscode.WorkspaceEdit();
        const files =
          back.type == "BlockStatement" || back.type === "FunctionDeclaration"
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
      ({ node, name: ref_name, results, where, analysis }) => {
        if (
          ref_name &&
          where &&
          where.length &&
          results &&
          (node.type === "Identifier" || node.type === "MemberExpression")
        ) {
          const back = where[where.length - 1];
          const references: vscode.Location[] = [];
          const files =
            back.type == "BlockStatement" || back.type === "FunctionDeclaration"
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
