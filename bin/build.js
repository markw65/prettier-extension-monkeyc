const { buildOptimizedProject } = require("@markw65/monkeyc-optimizer");
const path = require("path");

const json = process.argv.slice(4).reduce((json, arg, i) => {
  arg = JSON.stringify(arg).slice(1, -1);
  return json.replace(new RegExp("\\$\\$" + (i + 1), "g"), arg);
}, process.argv[3]);
// Arguments in launch.json are processed differently on windows/macos.
// If the string looks lie '{\"', it's over quoted, and must have come
// from our launch.json (which we had to overquote to make it work on
// windows), so just remove the quoting here. This will never fire when
// this is invoked from the extension.
const options = JSON.parse(
  json.slice(0, 3) == '{\\"' ? json.replace(/\\"/g, '"') : json
);
buildOptimizedProject(
  process.argv[2] == "export" ? null : process.argv[2],
  options
)
  .then(() =>
    console.log(
      `${
        process.argv[2] == "export" ? "Export" : "Build"
      } completed successfully`
    )
  )
  .catch((e) => {
    if (e.name && e.message && e.location) {
      const source = path.relative(options.workspace, e.location.source);
      console.error(
        `ERROR: ${e.name}: ${source}:${e.location.start.line},${e.location.start.column}: ${e.message}`
      );
    } else {
      console.error(`ERROR: Internal: ${e.toString()}`);
    }
    process.exit(1);
  });
