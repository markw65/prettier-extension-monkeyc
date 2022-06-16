const assert = require("assert");
const path = require("path");

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
const vscode = require("vscode");
//const myExtension = require("../build/extension");

suite("Extension Test Suite", function () {
  vscode.window.showInformationMessage("Start all tests.");

  const dir = path.resolve(__dirname, "..", "IntegrationTests", "source");
  setup(function () {
    this.timeout(0);
    return vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  const getRefs = async (docSym) => {
    const refs = await vscode.commands.executeCommand(
      "vscode.executeReferenceProvider",
      docSym.location.uri,
      new vscode.Position(
        docSym.selectionRange.start.line,
        docSym.selectionRange.start.character
      )
    );
    assert(
      Array.isArray(refs),
      `Expected an array of references to ${docSym.name}`
    );
    return refs;
  };

  let symbols;
  const getSymbols = async (source) => {
    for (let i = 0; !symbols && i < 3; i++) {
      symbols = await vscode.workspace
        .openTextDocument(source)
        .then((doc) => vscode.window.showTextDocument(doc))
        .then(() =>
          vscode.commands.executeCommand(
            "vscode.executeDocumentSymbolProvider",
            vscode.Uri.file(source)
          )
        );
      if (symbols) return;
      await new Promise((resolve) => setTimeout(() => resolve(), 200));
    }
    if (!symbols) assert.fail(`Unable to get symbols for ${source}`);
  };
  const findSymbol = async (source, path, kind) => {
    await getSymbols(source);
    const symbol = path.reduce((current, name, i) => {
      const symbol = (current ? current.children : symbols).find(
        (symbol) => symbol.name === name
      );
      if (!symbol) {
        assert.fail(`Failed to find ${path.slice(0, i + 1).join(":")}`);
      }
      return symbol;
    }, null);
    assert.equal(symbol.kind, vscode.SymbolKind[kind], `Expected a ${kind}`);
    return symbol;
  };
  const checkSymbolRefs = async (source, path, kind, count) => {
    const symbol = await findSymbol(source, path, kind);
    const refs = await getRefs(symbol);
    assert.equal(
      refs.length,
      count,
      `Expected ${symbol.name} to have ${count} references, but got ${refs.length}`
    );
    return symbol;
  };
  const checkFoo = async (funcName, varName) => {
    const testsSource = path.resolve(dir, "IntegrationTestsSource.mc");
    const fooFunc = await checkSymbolRefs(
      testsSource,
      [funcName],
      "Function",
      3
    );
    const fooVar = await checkSymbolRefs(
      testsSource,
      [funcName, varName],
      "Variable",
      2
    );
    return [fooFunc, fooVar];
  };

  const doRename = async (docSym, newName) => {
    const renameEdits = await vscode.commands.executeCommand(
      "vscode.executeDocumentRenameProvider",
      docSym.location.uri,
      new vscode.Position(
        docSym.selectionRange.start.line,
        docSym.selectionRange.start.character
      ),
      newName
    );
    await vscode.workspace.applyEdit(renameEdits);
    symbols = null;
  };

  const revertAll = () =>
    vscode.workspace.textDocuments
      .filter((doc) => doc.isDirty)
      .reduce((promise, doc) => {
        return promise
          .then(() => vscode.window.showTextDocument(doc))
          .then(() =>
            vscode.commands.executeCommand("workbench.action.files.revert")
          );
      }, Promise.resolve());

  test("Test Refs and Renames", async function () {
    this.timeout(0);
    {
      symbols = null;
      let fooFunc, fooVar;
      [fooFunc, fooVar] = await checkFoo("foo", "foo");
      await doRename(fooFunc, "bar");
      [fooFunc, fooVar] = await checkFoo("bar", "foo");
      await doRename(fooVar, "baz");
      [fooFunc, fooVar] = await checkFoo("bar", "baz");
      await revertAll();
    }
    {
      symbols = null;
      const testsSource = path.resolve(dir, "IntegrationTestsSource.mc");
      const symbol = await checkSymbolRefs(
        testsSource,
        ["buz", "ex"],
        "Variable",
        2
      );
      await doRename(symbol, "ex2");
      // There's a second catch variable named ex that shouldn't
      // have been renamed
      await checkSymbolRefs(testsSource, ["buz", "ex"], "Variable", 2);
      await checkSymbolRefs(testsSource, ["buz", "ex2"], "Variable", 2);
      await revertAll();
    }
    {
      symbols = null;
      const testsSource = path.resolve(dir, "IntegrationTestsView.mc");
      const symbol = await checkSymbolRefs(
        testsSource,
        ["IntegrationTestsView"],
        "Class",
        2
      );
      await doRename(symbol, "SomeOtherView");
      await checkSymbolRefs(testsSource, ["SomeOtherView"], "Class", 2);
      await revertAll();
    }
  });

  test("Pause after tests", async function () {
    this.timeout(0);
    // await new Promise((resolve) => setTimeout(() => resolve(), 10000));
  });
});
