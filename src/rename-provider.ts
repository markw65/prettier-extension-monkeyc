import {
  declKey,
  getSuperClasses,
  hasProperty,
  isStateNode,
  lookupWithType,
  visitReferences,
  visitorNode,
} from "@markw65/monkeyc-optimizer/api.js";
import * as vscode from "vscode";
import {
  filterLocations,
  findDefinition,
  normalize,
} from "./project-manager.js";

export class MonkeyCRenameRefProvider
  implements vscode.RenameProvider, vscode.ReferenceProvider
{
  private getRenameInfo(
    document: vscode.TextDocument,
    position: vscode.Position
  ) {
    return findDefinition(document, position, false).then((results) =>
      Promise.all(
        results.map(({ node, results, analysis }) => {
          if (node && results) {
            if (
              !results.every(({ parent, results }) => {
                if (
                  results.some((result) =>
                    result.type === "ModuleDeclaration"
                      ? Array.from(result.nodes.keys()).some(
                          (node) => node.loc?.source === "api.mir"
                        )
                      : (isStateNode(result) ? result.node : result)?.loc
                          ?.source === "api.mir"
                  )
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
              return Promise.reject(new Error(`Unable to rename ${node.name}`));
            }
            if (node.name === "$") {
              return Promise.reject(
                new Error(`Can't rename the global module`)
              );
            }
            return {
              id: node,
              results,
              analysis,
            };
          }
          return Promise.reject(new Error("No renamable symbol found"));
        })
      )
    );
  }

  prepareRename(
    document: vscode.TextDocument,
    position: vscode.Position,
    _cancellationToken: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Range> {
    return this.getRenameInfo(document, position)
      .then((results) =>
        results.filter(({ id }, i, arr) => {
          if (!i) return true;
          const prev = arr[i - 1].id;
          if (prev.name !== id.name) return true;
          return false;
        })
      )
      .then((results) => {
        if (results.length !== 1) {
          return Promise.reject(
            new Error("Inconsistent rename info across different projects")
          );
        }
        const [{ id }] = results;
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
      .then((renames) => {
        const locations: vscode.Location[] = [];
        renames.forEach(({ id, results, analysis }) => {
          const asts = results.every(
            ({ parent }) =>
              parent &&
              (parent.type === "BlockStatement" ||
                parent.type === "FunctionDeclaration")
          )
            ? [analysis.fnMap[normalize(document.uri.fsPath)].ast]
            : Object.values(analysis.fnMap)
                .map(({ ast }) => ast)
                .concat(analysis.state.rezAst ? [analysis.state.rezAst] : []);
          if (asts.every((ast) => ast != null)) {
            asts.forEach((ast) => {
              visitReferences(
                analysis.state,
                ast!,
                id.name,
                results,
                (node) => {
                  const n = visitorNode(node);
                  const loc = n.loc!;
                  locations.push(
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
                },
                true,
                null,
                analysis.typeMap
              );
            });
          }
        });
        const edits = new vscode.WorkspaceEdit();
        filterLocations(locations).forEach((loc) =>
          edits.replace(loc.uri, loc.range, newName)
        );
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
    return findDefinition(document, position, false).then((definitions) => {
      const references: vscode.Location[] = [];
      definitions.forEach(({ node, results, analysis }) => {
        if (node && results) {
          const isLocal = results.every(
            ({ parent }) =>
              parent &&
              (parent.type === "BlockStatement" ||
                parent.type === "FunctionDeclaration")
          );
          const asts = isLocal
            ? [analysis.fnMap[normalize(document.uri.fsPath)].ast]
            : Object.values(analysis.fnMap)
                .map(({ ast }) => ast)
                .concat(analysis.state.rezAst ? [analysis.state.rezAst] : []);
          const defnSet = new Set(
            results.flatMap((r) => r.results.map((sn) => declKey(sn)))
          );
          const superSet: typeof defnSet = new Set();
          results.forEach((result) =>
            result.results.forEach((sn) => {
              if (isStateNode(sn)) {
                const name = sn.name;
                const owner = sn.stack?.at(-1);
                if (
                  name &&
                  owner?.sn.type === "ClassDeclaration" &&
                  owner.sn.superClass
                ) {
                  getSuperClasses(owner.sn)?.forEach((klass) =>
                    klass.decls?.[name]?.forEach((d) =>
                      superSet.add(declKey(d))
                    )
                  );
                }
              }
            })
          );
          asts.forEach((ast) => {
            if (!ast) return;
            visitReferences(
              analysis.state,
              ast,
              node.name,
              null,
              (node, results) => {
                if (
                  !results.some((r) =>
                    r.results.some((result) => {
                      const key = declKey(result);
                      // if the node matches one of the definitions, its a reference
                      if (defnSet.has(key)) return true;
                      // if its a NewExpression, the type was exact, so definitely not
                      // a match
                      if (node.type === "NewExpression") return false;
                      // if it doesn't match a definition in a superclass, it can't be
                      // a reference to the defns of interest
                      if (!superSet.has(key)) return false;
                      // if its not a MemberExpression, it's not restricted, so it might
                      // be a reference
                      if (node.type !== "MemberExpression") return true;
                      const [, base] = lookupWithType(
                        analysis.state,
                        node.object,
                        analysis.typeMap
                      );
                      if (!base) return true;
                      return !base.every((lookupDef) =>
                        lookupDef.results.every(
                          (sn) => sn.type === "ClassDeclaration"
                        )
                      );
                    })
                  )
                ) {
                  return;
                }
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
              },
              false,
              null,
              analysis.typeMap
            );
          });
        }
      });
      return filterLocations(references);
    });
  }
}
