import {
  hasProperty,
  isStateNode,
  makeToyboxLink,
  visitorNode,
  visitReferences,
} from "@markw65/monkeyc-optimizer/api.js";
import { mctree } from "@markw65/prettier-plugin-monkeyc";
import * as vscode from "vscode";
import { findProject, normalize } from "./project-manager";

export class MonkeyCLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DocumentLink[]> {
    if (
      vscode.workspace
        .getConfiguration("prettierMonkeyC", document)
        .get("documentLinks") === false
    ) {
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

      const fileName = normalize(document.uri.fsPath);
      const ast = hasProperty(analysis.fnMap, fileName)
        ? analysis.fnMap[fileName]?.ast
        : (hasProperty(project.resources, fileName) ||
            fileName === analysis.state?.manifestXML?.prolog?.loc?.source) &&
          analysis.state.rezAst;
      if (!ast) {
        return Promise.resolve([]);
      }

      const links: vscode.DocumentLink[] = [];
      const push = (node: mctree.Node, link: string) => {
        const loc = visitorNode(node).loc;
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
        ast,
        null,
        null,
        (node, lookupDefns) => {
          if (
            !node.loc ||
            lookupDefns.length !== 1 ||
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
          const link = makeToyboxLink(result);
          if (link) {
            push(node, link);
          }
          return undefined;
        },
        true,
        (node) => {
          return !node.loc || !node.loc.source || node.loc.source === fileName;
        },
        analysis.typeMap
      );
      return links;
    });
  }
}
