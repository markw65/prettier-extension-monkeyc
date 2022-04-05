"use strict";

const vscode = require("vscode");
const {
  buildOptimizedProject,
  generateApiMirTests,
  copyRecursiveAsNeeded,
} = require("@markw65/monkeyc-optimizer");

// this method is called when the extension is activated
// which (as currently configured) is the first time a .mc file is opened.
async function activate() {
  console.log(
    "Installing @markw65/prettier-plugin-monkeyc into the esbenp.prettier-vscode extension!"
  );

  const our_extension_dir = __dirname.replace(/^(.*[\/\\]).*$/, "$1");
  const prettier_dir = vscode.extensions.getExtension(
    "esbenp.prettier-vscode"
  ).extensionPath;

  const target_dir = `${prettier_dir}/node_modules/@markw65/prettier-plugin-monkeyc`;
  try {
    await copyRecursiveAsNeeded(
      `${our_extension_dir}/node_modules/@markw65/prettier-plugin-monkeyc`,
      target_dir
    );
  } catch (e) {
    console.log(`Failed: ${e}`);
  }

  vscode.commands.registerCommand(
    "prettiermonkeyc.optimizeCurrentProject",
    () => {
      const { pathsToClone, outputPath } =
        vscode.workspace.getConfiguration("prettierMonkeyC");
      const workspace = vscode.workspace.workspaceFolders[0].uri.fsPath;
      return buildOptimizedProject({ pathsToClone, outputPath, workspace });
    }
  );
  vscode.commands.registerCommand("prettiermonkeyc.generateApiMirTests", () => {
    const workspace = vscode.workspace.workspaceFolders[0].uri.fsPath;
    return generateApiMirTests({ workspace });
  });
}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
