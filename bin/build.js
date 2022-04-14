const { buildOptimizedProject } = require("@markw65/monkeyc-optimizer");
const path = require("path");

const options = JSON.parse(process.argv[3]);
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
    }
    process.exit(1);
  });
