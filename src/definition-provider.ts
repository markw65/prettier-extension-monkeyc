import { isStateNode } from "@markw65/monkeyc-optimizer/api.js";
import { mctree } from "@markw65/prettier-plugin-monkeyc";
import * as vscode from "vscode";
import { filterLocations, findDefinition } from "./project-manager";

export class MonkeyCDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _cancellationToken: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Definition> {
    return findDefinition(
      document,
      position,
      vscode.workspace
        .getConfiguration("prettierMonkeyC", document)
        .get("findSingleDefinition") === true
    )
      .then((defns) =>
        defns.flatMap(({ node, results }) =>
          node && results
            ? results
                .flatMap((lookupDefn) => lookupDefn.results)
                .flatMap<mctree.Node>((sn) =>
                  sn.type === "ModuleDeclaration"
                    ? Array.from(sn.nodes.keys())
                    : isStateNode(sn)
                    ? sn.node ?? []
                    : sn
                )
                .flatMap((r) => {
                  if (!r.loc || !r.loc.source) return [];
                  if (r.loc.source === "api.mir") {
                    // Would be nice to go to the sdk documentation,
                    // but that doesn't seem to be possible from here.
                    // Instead, we use a DocumentLinkProvider to turn
                    // these into https links.
                    return [];
                  }
                  return new vscode.Location(
                    vscode.Uri.file(r.loc.source),
                    new vscode.Range(
                      r.loc.start.line - 1,
                      r.loc.start.column - 1,
                      r.loc.end.line - 1,
                      r.loc.end.column - 1
                    )
                  );
                })
            : []
        )
      )
      .then((locations) => filterLocations(locations));
  }
}
