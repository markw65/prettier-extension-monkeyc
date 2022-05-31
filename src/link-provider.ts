import { isStateNode } from "@markw65/monkeyc-optimizer/api.js";
import { mctree } from "@markw65/prettier-plugin-monkeyc";
import * as vscode from "vscode";
import { findProject, normalize, visitReferences } from "./project-manager";

export class MonkeyCLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DocumentLink[]> {
    const config = vscode.workspace.getConfiguration(
      "prettierMonkeyC",
      document
    );
    if (config && !config.documentLinks) {
      return null;
    }
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
        const make_link = (fullName: string, fragment?: string) => {
          const path = fullName.split(".");
          return (
            `https://developer.garmin.com/connect-iq/api-docs/${path
              .slice(1, fragment ? -1 : undefined)
              .join("/")}.html` +
            (fragment ? `#${path.slice(-1)[0]}-${fragment}` : "")
          );
        };
        switch (result.type) {
          case "ClassDeclaration":
          case "ModuleDeclaration":
            push(node, make_link(result.fullName));
            return;

          case "FunctionDeclaration":
            push(node, make_link(result.fullName, "instance_function"));
            return;

          case "EnumStringMember":
            if (
              result.init.enumType &&
              typeof result.init.enumType === "string"
            ) {
              push(node, make_link("$." + result.init.enumType, "module"));
            }
            return;

          case "TypedefDeclaration":
            push(node, make_link(result.fullName, "named_type"));
            return;

          case "VariableDeclarator":
            push(node, make_link(result.fullName, "var"));
            return;
        }
      });
      return links;
    });
  }
}
