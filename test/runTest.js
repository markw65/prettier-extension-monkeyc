const path = require("path");
const {
  runTests,
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
} = require("@vscode/test-electron");
const { spawnByLine } = require("@markw65/monkeyc-optimizer/util.js");

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, "../");

    // The path to the extension test script
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");

    const vscodeExecutablePath = await downloadAndUnzipVSCode();
    const [cliPath, ...args] =
      resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

    await spawnByLine(
      cliPath,
      [
        ...args,
        "--force",
        "--install-extension",
        "garmin.monkey-c",
        "--install-extension",
        "esbenp.prettier-vscode",
      ],
      (line) => console.log(line)
    )
      .then((r) => console.log(r))
      .catch((e) => {
        console.log(e);
      });

    // Download VS Code, unzip it and run the integration test
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      vscodeExecutablePath,
      launchArgs: [
        path.resolve(
          __dirname,
          "IntegrationTests",
          "IntegrationTests.code-workspace"
        ),
      ],
    });
  } catch (err) {
    console.error("Failed to run tests");
    process.exit(1);
  }
}

main();
