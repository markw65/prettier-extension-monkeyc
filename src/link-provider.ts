import { isStateNode } from "@markw65/monkeyc-optimizer/api.js";
import { mctree } from "@markw65/prettier-plugin-monkeyc";
import * as vscode from "vscode";
import { findProject, normalize, visitReferences } from "./project-manager";

export class MonkeyCLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DocumentLink[]> {
    const project = findProject(document.uri);
    if (!project) return Promise.reject("No project found");
    return project.getAnalysis().then((analysis) => {
      if (!analysis) {
        return Promise.reject("Project analysis not found");
      }
      if (!("state" in analysis)) {
        return Promise.reject("Project contains errors");
      }
      const file = analysis.fnMap[normalize(document.uri.fsPath)];
      if (!file) {
        return Promise.reject(
          "Document ${document.uri.fsPath} not found in project"
        );
      }
      const links: vscode.DocumentLink[] = [];
      const push = (node: mctree.Node, link: string) => {
        const loc =
          node.type === "MemberExpression" ? node.property.loc : node.loc;
        if (!loc) return;
        links.push(
          new vscode.DocumentLink(
            new vscode.Range(
              loc.start.line - 1,
              loc.start.column - 1,
              loc.end.line - 1,
              loc.end.column - 1
            ),
            vscode.Uri.parse(link)
          )
        );
      };
      visitReferences(analysis.state, file.ast, null, null, (node, results) => {
        if (results.length != 1 || !node.loc) return;
        const result = results[0];
        const result_node = isStateNode(result) ? result.node : result;
        if (
          !result_node ||
          !result_node.loc ||
          result_node.loc.source !== "api.mir"
        ) {
          return;
        }
        switch (result.type) {
          case "ClassDeclaration":
          case "ModuleDeclaration":
            push(
              node,
              `https://developer.garmin.com/connect-iq/api-docs/${result.fullName
                .split(".")
                .slice(1)
                .join("/")}.html`
            );
            return;
          case "FunctionDeclaration": {
            const path = result.fullName.split(".");
            push(
              node,
              `https://developer.garmin.com/connect-iq/api-docs/${path
                .slice(1, -1)
                .join("/")}.html#${path.slice(-1)[0]}-instance_function`
            );
            return;
          }
        }
      });
      return links;
    });
  }
}
