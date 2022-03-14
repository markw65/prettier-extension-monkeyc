const fs = require("fs/promises");

async function remove() {
  const prettier_extension_name = "esbenp.prettier-vscode";
  const our_extension_dir = __dirname;
  const extensions_dir = our_extension_dir // "/Users/mwilliams/.vscode/extensions/whatever"
    .replace(/^(.*[\/\\]).*$/, "$1");

  const prettier_dir = (
    await fs.readdir(extensions_dir, { encoding: "utf-8" })
  ).filter((s) => s.startsWith(prettier_extension_name))[0];

  const target_dir = `${extensions_dir}${prettier_dir}/node_modules/@markw65`;
  return fs.rm(target_dir, { recursive: true, force: true });
}

remove().then(() => console.log("Removed!"));