import * as esbuild from "esbuild";
import * as child_process from "node:child_process";
import * as readline from "node:readline";

const cjsDir = "build";
const releaseBuild = process.argv.includes("--release");
const sourcemap = !releaseBuild;

let buildActive = 0;
function activate() {
  if (!buildActive++) {
    console.log(`${new Date().toLocaleString()} - Build active`);
  }
}

function deactivate() {
  setTimeout(() => {
    if (!--buildActive) {
      console.log(`${new Date().toLocaleString()} - Build inactive`);
    }
  }, 500);
}

function report(diagnostics, kind) {
  diagnostics.forEach((diagnostic) => diagnostic.location.column++);

  esbuild
    .formatMessages(diagnostics, {
      kind,
      color: true,
      terminalWidth: 100,
    })
    .then((messages) => messages.forEach((error) => console.log(error)));
}

const startEndPlugin = {
  name: "startEnd",
  setup(build) {
    build.onStart(() => {
      activate();
      console.log(`${new Date().toLocaleString()} - ESBuild start`);
    });
    build.onEnd((result) => {
      report(result.errors, "error");
      report(result.warnings, "warning");
      Object.entries(result.metafile?.outputs ?? {}).forEach(
        ([key, value]) =>
          key.endsWith(".js") &&
          value.bytes > 10000 &&
          console.log(`${key}: ${value.bytes >>> 10}kb`)
      );
      console.log("");

      console.log(`${new Date().toLocaleString()} - ESBuild end`);
      deactivate();
    });
  },
};

const cjsConfig = {
  entryPoints: ["src/extension.js"],
  bundle: true,
  platform: "node",
  outdir: `${cjsDir}`,
  //outExtension: ".js",
  target: "node16.4",
  external: [
    "vscode",
    "prettier",
    "@markw65/monkeyc-optimizer",
    "@markw65/prettier-plugin-monkeyc",
  ],
  format: "cjs",
  plugins: [startEndPlugin],
  sourcemap,
  sourcesContent: false,
  metafile: true,
  minify: releaseBuild,
  logLevel: "silent",
};

function spawnByLine(command, args, lineHandler, options) {
  return new Promise((resolve, reject) => {
    const proc = child_process.spawn(command, args, {
      ...(options || {}),
      shell: false,
    });
    const rl = readline.createInterface({
      input: proc.stdout,
    });
    const rle = readline.createInterface({
      input: proc.stderr,
    });
    proc.on("error", reject);
    proc.stderr.on("data", (data) => console.error(data.toString()));
    rl.on("line", lineHandler);
    rle.on("line", lineHandler);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      reject(code);
    });
  });
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const tscCommand = ["tsc"];
const logger = (line) => {
  // tsc in watch mode does ESC-c to clear the screen
  // eslint-disable-next-line no-control-regex
  line = line.replace(/[\x1b]c/g, "");
  if (
    /Starting compilation in watch mode|File change detected\. Starting incremental compilation/.test(
      line
    )
  ) {
    activate();
  }
  console.log(line);
  if (/Found \d+ errors?\. Watching for file changes/.test(line)) {
    deactivate();
  }
};
if (process.argv.includes("--watch")) {
  const ctx = await esbuild.context(cjsConfig);
  await Promise.all([
    ctx.watch(),
    spawnByLine(npx, tscCommand.concat("--watch"), logger),
  ]);
} else {
  await Promise.all([
    esbuild.build(cjsConfig),
    spawnByLine(npx, tscCommand, logger).then(() => {
      console.log(`${new Date().toLocaleString()} - tsc end`);
    }),
  ]);
}
