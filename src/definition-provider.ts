import { isStateNode } from "@markw65/monkeyc-optimizer/api.js";
import * as vscode from "vscode";
import { findDefinition } from "./project-manager";

export class MonkeyCDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _cancellationToken: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Definition> {
    return findDefinition(document, position).then(({ name, results }) => {
      if (name && results) {
        return results
          .map((sn) => {
            const r = isStateNode(sn) ? sn.node : sn;
            if (!r || !r.loc || !r.loc.source) return null;
            if (r.loc.source === "api.mir") {
              // Would be nice to go to the sdk documentation,
              // but that doesn't seem to be possible (or at least,
              // doing so opens it as text, not html)
              return null;
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
          .filter((r): r is vscode.Location => r != null);
      }
      return null;
    });
  }
}
