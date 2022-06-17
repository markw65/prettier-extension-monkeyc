import {
  isStateNode,
  visitReferences,
} from "@markw65/monkeyc-optimizer/api.js";
import { mctree } from "@markw65/prettier-plugin-monkeyc";
import * as vscode from "vscode";
import { findProject, normalize } from "./project-manager";

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
      visitReferences(
        analysis.state,
        file.ast,
        null,
        null,
        (node, lookupDefns) => {
          if (
            !node.loc ||
            lookupDefns.length != 1 ||
            lookupDefns[0].results.length !== 1
          ) {
            return undefined;
          }
          const result = lookupDefns[0].results[0];
          const result_node = isStateNode(result) ? result.node : result;
          if (
            !result_node ||
            !result_node.loc ||
            result_node.loc.source !== "api.mir"
          ) {
            return undefined;
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
              if (result.fullName.startsWith("$.Toybox")) {
                push(node, make_link(result.fullName));
              }
              break;

            case "FunctionDeclaration":
              push(node, make_link(result.fullName, "instance_function"));
              break;

            case "EnumStringMember":
              if (
                result.init.enumType &&
                typeof result.init.enumType === "string"
              ) {
                push(node, make_link("$." + result.init.enumType, "module"));
              }
              break;

            case "EnumDeclaration":
              if (
                result.id &&
                result.body.members[0].type === "EnumStringMember" &&
                result.body.members[0].init?.enumType
              ) {
                push(
                  node,
                  make_link(
                    "$." + result.body.members[0].init?.enumType,
                    "module"
                  )
                );
              }
              break;

            case "TypedefDeclaration":
              push(node, make_link(result.fullName, "named_type"));
              break;

            case "VariableDeclarator":
              push(node, make_link(result.fullName, "var"));
              break;
          }
          return undefined;
        }
      );
      return links;
    });
  }
}
