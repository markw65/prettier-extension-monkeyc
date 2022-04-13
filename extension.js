"use strict";

const vscode = require("vscode");
const {
  generateOptimizedProject,
  buildOptimizedProject,
  generateApiMirTests,
  copyRecursiveAsNeeded,
  launchSimulator,
} = require("@markw65/monkeyc-optimizer");

let debugConfigProvider;

const baseDebugConfig = {
  name: "Run Optimized",
  request: "launch",
  type: "omonkeyc",
  device: "${command:GetTargetDevice}",
};

// this method is called when the extension is activated
// which (as currently configured) is the first time a .mc file is opened.
async function activate() {
  console.log(
    "Installing @markw65/prettier-plugin-monkeyc into the esbenp.prettier-vscode extension!"
  );

  const our_extension_dir = __dirname; //.replace(/^(.*[\/\\]).*$/, "$1");
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
    "prettiermonkeyc.generateOptimizedProject",
    () => generateOptimizedProject(getOptimizerBaseConfig())
  );
  vscode.commands.registerCommand("prettiermonkeyc.buildOptimizedProject", () =>
    buildOptimizedProject(getOptimizerBaseConfig())
  );
  vscode.commands.registerCommand("prettiermonkeyc.runOptimizedProject", () =>
    vscode.debug.startDebugging({
      ...getOptimizerBaseConfig(),
      ...baseDebugConfig,
    })
  );
  vscode.commands.registerCommand("prettiermonkeyc.generateApiMirTests", () => {
    return generateApiMirTests(getOptimizerBaseConfig());
  });

  debugConfigProvider = await vscode.debug.registerDebugConfigurationProvider(
    "omonkeyc",
    new OptimizedMonkeyCDebugConfigProvider(),
    vscode.DebugConfigurationProviderTriggerKind.Dynamic
  );
}

// this method is called when your extension is deactivated
function deactivate() {
  debugConfigProvider && debugConfigProvider.dispose();
  debugConfigProvider = null;
}

class OptimizedMonkeyCDebugConfigProvider {
  provideDebugConfigurations(_folder) {
    return [baseDebugConfig];
  }

  async resolveDebugConfigurationWithSubstitutedVariables(
    folder,
    config,
    _token
  ) {
    const workspace = folder.uri.fsPath;
    const buildConfig = { ...getOptimizerBaseConfig(), ...config, workspace };
    if (!buildConfig.device) return;
    await buildOptimizedProject(buildConfig.device, buildConfig);
    config.type = "monkeyc";
    config.prg = `${workspace}/bin/optimized-${folder.name}.prg`;
    config.prgDebugXml = `${workspace}/bin/optimized-${folder.name}.prg.debug.xml`;
    await launchSimulator();
    return config;
  }
}

function getOptimizerBaseConfig() {
  const config = { workspace: vscode.workspace.workspaceFolders[0].uri.fsPath };

  const pmcConfig = vscode.workspace.getConfiguration("prettierMonkeyC");
  for (const i of [
    "outputPath",
    "ignoredExcludeAnnotations",
    "ignoredAnnotations",
    "ignoredSourcePaths",
  ]) {
    if (pmcConfig[i]) config[i] = pmcConfig[i];
  }

  const mcConfig = vscode.workspace.getConfiguration("monkeyC");
  for (const i of [
    "jungleFiles",
    "developerKeyPath",
    "typeCheckLevel",
    "compilerOptions",
    "compilerWarnings",
  ]) {
    if (mcConfig[i]) config[i] = mcConfig[i];
  }
  return config;
}

module.exports = {
  activate,
  deactivate,
};
