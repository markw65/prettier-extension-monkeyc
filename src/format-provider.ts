import * as vscode from "vscode";

import * as Prettier from "prettier";

async function formatCode(
  sourceCode: string,
  filepath: string,
  vscodeOptions: vscode.FormattingOptions
) {
  try {
    const options = (await Prettier.resolveConfig(filepath)) ?? {};
    if (!options.plugins) {
      options.plugins = [];
    }
    const pmc =
      __dirname + "/../../node_modules/@markw65/prettier-plugin-monkeyc";

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const plugin = require(pmc);

    if (!options.plugins.includes(plugin)) {
      options.plugins.push(plugin);
    }

    const formattedCode = await Prettier.format(sourceCode, {
      tabWidth: vscodeOptions.tabSize,
      useTabs: !vscodeOptions.insertSpaces,
      ...options,
      filepath,
    });

    return formattedCode;
  } catch (error) {
    console.error("Prettier formatting error:", error);
    throw error;
  }
}

export class MonkeyCFomattingEditProvider
  implements vscode.DocumentFormattingEditProvider
{
  async provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    options: vscode.FormattingOptions,
    _token: vscode.CancellationToken
  ): Promise<vscode.TextEdit[] | null> {
    const original = document.getText();
    const formatted = await formatCode(
      original,
      document.fileName,
      options
    ).catch(() => null);
    if (formatted) {
      return [
        new vscode.TextEdit(
          new vscode.Range(
            document.positionAt(0),
            document.positionAt(original.length)
          ),
          formatted
        ),
      ];
    }
    return null;
  }
}
