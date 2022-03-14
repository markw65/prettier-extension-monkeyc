const fs = require("fs/promises");
const fsc = require("fs");
var path = require("path");

// this method is called when the extension is activated
// which (as currently configured) is the first time a .mc file is opened.
async function activate() {
  console.log(
    "Installing @markw65/prettier-plugin-monkeyc into the esbenp.prettier-vscode extension!"
  );

  const prettier_extension_name = "esbenp.prettier-vscode";
  const our_extension_dir = __dirname;
  const extensions_dir = our_extension_dir // "/Users/mwilliams/.vscode/extensions/whatever"
    .replace(/^(.*[\/\\]).*$/, "$1");

  const prettier_dir = (
    await fs.readdir(extensions_dir, { encoding: "utf-8" })
  ).filter((s) => s.startsWith(prettier_extension_name))[0];

  const target_dir = `${extensions_dir}${prettier_dir}/node_modules/@markw65`;
  try {
    await copyFolderAsNeeded(
      `${our_extension_dir}/node_modules/@markw65`,
      target_dir
    );
  } catch (e) {
    console.log(`Failed: ${e}`);
  }
}

async function copyFolderAsNeeded(source, target) {
  const stat = await fs.lstat(target).catch(() => null);

  if (!stat || !stat.isDirectory()) {
    stat && (await fs.rm(target, { force: true }));
    await fs.mkdir(target);
  }

  const files = await fs.readdir(source);
  return Promise.all(
    files.map(async (file) => {
      var src = path.join(source, file);
      var tgt = path.join(target, file);
      const sstat = await fs.lstat(src);
      if (sstat.isDirectory()) {
        return copyFolderAsNeeded(src, tgt);
      } else {
        const tstat = await fs.lstat(tgt).catch(() => null);
        if (!tstat || tstat.mtimeMs < sstat.mtimeMs) {
          console.log(`Copying ${src} to ${tgt}...`);
          await fs.copyFile(src, tgt, fsc.constants.COPYFILE_FICLONE);
        }
      }
    })
  );
}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
