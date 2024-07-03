const assert = require("assert");
const path = require("path");

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
const vscode = require("vscode");
//const myExtension = require("../build/extension");

suite("Extension Test Suite", function () {
  vscode.window.showInformationMessage("Start all tests.");

  const dir = path.resolve(__dirname, "..", "IntegrationTests", "source");
  this.timeout(0);
  this.slow(2500);

  suiteSetup(function () {
    this.slow(10000);
    console.log("Running suite setup");
    return getSymbols(path.resolve(dir, "IntegrationTestsSource.mc")).then(() =>
      vscode.commands.executeCommand("workbench.action.closeAllEditors")
    );
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
  const getDefs = async (docSym) => {
    const defs = await vscode.commands.executeCommand(
      "vscode.executeDefinitionProvider",
      docSym.location.uri,
      new vscode.Position(
        docSym.selectionRange.start.line,
        docSym.selectionRange.start.character
      )
    );
    assert(
      Array.isArray(defs),
      `Expected an array of references to ${docSym.name}`
    );
    return defs;
  };

  let symbols;
  const getSymbols = async (source) => {
    for (let i = 0; !symbols && i < 10; i++) {
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
  const checkSymbolRefsEx = async (
    source,
    path,
    kind,
    refsCount,
    defsCount
  ) => {
    const symbol = await findSymbol(source, path, kind);
    const refs = await getRefs(symbol);
    assert.equal(
      refs.length,
      refsCount,
      `Expected ${path.join(".")} to have ${refsCount} references, but got ${
        refs.length
      }`
    );
    const defs = await getDefs(symbol);
    assert.equal(
      defs.length,
      defsCount,
      `Expected ${path.join(".")} to have ${defsCount} definitions, but got ${
        defs.length
      }`
    );
    return { symbol, refs, defs };
  };
  const checkSymbolRefs = (source, path, kind, refsCount, defsCount) =>
    checkSymbolRefsEx(source, path, kind, refsCount, defsCount).then(
      (result) => result.symbol
    );

  const checkFoo = async (funcName, varName) => {
    const testsSource = path.resolve(dir, "IntegrationTestsSource.mc");
    const fooFunc = await checkSymbolRefs(
      testsSource,
      [funcName],
      "Function",
      2,
      1
    );
    const fooVar = await checkSymbolRefs(
      testsSource,
      [funcName, varName],
      "Variable",
      1,
      1
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

  let serializer = Promise.resolve();
  test("Test Refs and Renames - locals vs functions", function () {
    const result = serializer
      .then(() => {
        symbols = null;
      })
      .then(() => checkFoo("foo", "foo"))
      .then(([fooFunc]) => doRename(fooFunc, "bar"))
      .then(() => checkFoo("bar", "foo"))
      .then(([, fooVar]) => doRename(fooVar, "baz"))
      .then(() => checkFoo("bar", "baz"))
      .finally(() => revertAll());
    serializer = result.catch(() => null);
    return result;
  });

  test("Test Refs and Renames - catch variables", function () {
    const testsSource = path.resolve(dir, "IntegrationTestsSource.mc");
    const result = serializer
      .then(() => {
        symbols = null;
      })
      .then(() => checkSymbolRefs(testsSource, ["buz", "ex"], "Variable", 1, 1))
      .then((symbol) => doRename(symbol, "ex2"))
      .then(() =>
        Promise.all([
          // There's a second catch variable named ex that shouldn't
          // have been renamed
          checkSymbolRefs(testsSource, ["buz", "ex"], "Variable", 1, 1),
          checkSymbolRefs(testsSource, ["buz", "ex2"], "Variable", 1, 1),
        ])
      )
      .finally(() => revertAll());
    serializer = result.catch(() => null);
    return result;
  });

  test("Test Refs and Renames - classes", function () {
    const testsSource = path.resolve(dir, "IntegrationTestsView.mc");
    const result = serializer
      .then(() => {
        symbols = null;
      })
      .then(() =>
        checkSymbolRefs(testsSource, ["IntegrationTestsView"], "Class", 1, 1)
      )
      .then((symbol) => doRename(symbol, "SomeOtherView"))
      .then(() =>
        checkSymbolRefs(testsSource, ["SomeOtherView"], "Class", 1, 1)
      )
      .then(() =>
        checkSymbolRefs(
          testsSource,
          ["SomeOtherView", "onShow"],
          "Method",
          0,
          1
        )
      )
      .then((onShow) => doRename(onShow, "onShowRenamed"))
      .then(
        () => {
          throw new Error("Rename should not succeed!");
        },
        () => {
          // This is supposed to fail, so just ignore the
          // failure.
          return;
        }
      )
      .then(() =>
        checkSymbolRefs(
          testsSource,
          ["SomeOtherView", "onShow"],
          "Method",
          0,
          1
        )
      )
      .finally(() => revertAll());
    serializer = result.catch(() => null);
    return result;
  });

  test("Test References and inheritance", function () {
    const testsSource = path.resolve(dir, "IntegrationTestsInheritance.mc");
    const result = serializer
      .then(() => {
        symbols = null;
      })
      .then(() => checkSymbolRefs(testsSource, ["Base", "f1"], "Method", 1, 1))
      .then(() => {
        // When we lookup references to Base.f2, via the definition, we should only
        // find 2, because one of the calls to f2 must go to Derived.f2...
        return checkSymbolRefsEx(testsSource, ["Base", "f2"], "Method", 2, 1);
      })
      .then(({ refs }) =>
        Promise.all([
          vscode.commands.executeCommand(
            "vscode.executeReferenceProvider",
            refs[0].uri,
            refs[0].range.start
          ),
          vscode.commands.executeCommand(
            "vscode.executeDefinitionProvider",
            refs[0].uri,
            refs[0].range.start
          ),
        ])
      )
      .then(([refs, defs]) => {
        // ...but when we lookup references to Base.f2, via a reference in Base,
        // we should find 3, because that reference could call either Base.f2 or
        // Derived.f2
        assert(
          Array.isArray(refs) && refs.length === 3,
          `Expected an array of 2 references to 'Base.f2'`
        );
        // Similarly looking up a call to f2() in Base should find two possible defs
        assert(
          Array.isArray(defs) && defs.length === 2,
          `Expected an array of 2 definitions for 'f2'`
        );
      })
      .then(() => {
        // We currently expect 3 refs for Derived.f2, but one of them is an
        // explicit call to Base.f2. When we fix that, this needs changing.
        return checkSymbolRefs(testsSource, ["Derived", "f2"], "Method", 3, 1);
      });
    serializer = result.catch(() => null);
    return result;
  });

  test("Pause after tests", function () {
    console.log("Pause");
    // return new Promise((resolve) => setTimeout(() => resolve(), 10000));
  });
});
