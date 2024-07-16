import assert from "assert";
import * as path from "node:path";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
//const myExtension = require("../build/extension");

suite("Extension Test Suite", function () {
  vscode.window.showInformationMessage("Start all tests.");

  const rootDir = path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "test",
    "IntegrationTests"
  );

  const project1Dir = path.resolve(rootDir, "Project1", "source");
  this.timeout(0);
  this.slow(2500);

  suiteSetup(function () {
    this.slow(10000);
    console.log("Running suite setup");
    // make sure that both app projects are activated
    return getSymbols(path.resolve(project1Dir, "Project1App.mc")).then(() =>
      vscode.commands.executeCommand("workbench.action.closeAllEditors")
    );
  });

  const getRefsEx = async (
    uri: vscode.Uri,
    pos: vscode.Position,
    name: string
  ) => {
    const refs = await vscode.commands.executeCommand(
      "vscode.executeReferenceProvider",
      uri,
      pos
    );
    assert(Array.isArray(refs), `Expected an array of references to ${name}`);
    return refs;
  };

  const getDefsEx = async (
    uri: vscode.Uri,
    pos: vscode.Position,
    name: string
  ) => {
    const defs = await vscode.commands.executeCommand(
      "vscode.executeDefinitionProvider",
      uri,
      pos
    );
    assert(Array.isArray(defs), `Expected an array of references to ${name}`);
    return defs;
  };

  type VSSymbol = vscode.DocumentSymbol & { location?: vscode.Location };
  let symbols: VSSymbol[] | null = null;
  const getSymbols = async (source: string) => {
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
      await new Promise<void>((resolve) => setTimeout(() => resolve(), 200));
    }
    if (!symbols) assert.fail(`Unable to get symbols for ${source}`);
  };
  const findSymbol = async (
    source: string,
    path: string[],
    kind: keyof typeof vscode.SymbolKind
  ) => {
    await getSymbols(source);
    const symbol = path.reduce((current, name, i) => {
      const symbol = (current?.children ?? symbols)?.find(
        (symbol) => symbol.name === name
      );
      if (!symbol) {
        assert.fail(`Failed to find ${path.slice(0, i + 1).join(":")}`);
      }
      return symbol;
    }, null as VSSymbol | null);
    assert(symbol);
    assert.equal(symbol.kind, vscode.SymbolKind[kind], `Expected a ${kind}`);
    return symbol;
  };
  const checkRefsEx = async (
    uri: vscode.Uri,
    pos: vscode.Position,
    name: string,
    refsCount: number,
    defsCount: number
  ) => {
    const refs = await getRefsEx(uri, pos, name);
    assert.equal(
      refs.length,
      refsCount,
      `Expected ${path.join(".")} to have ${refsCount} references, but got ${
        refs.length
      }`
    );
    const defs = await getDefsEx(uri, pos, name);
    assert.equal(
      defs.length,
      defsCount,
      `Expected ${path.join(".")} to have ${defsCount} definitions, but got ${
        defs.length
      }`
    );
    return { uri, pos, refs, defs };
  };

  const checkSymbolRefsEx = async (
    source: string,
    path: string[],
    kind: keyof typeof vscode.SymbolKind,
    refsCount: number,
    defsCount: number
  ) => {
    const symbol = await findSymbol(source, path, kind);
    const { refs, defs } = await checkRefsEx(
      symbol.location!.uri,
      new vscode.Position(
        symbol.selectionRange.start.line,
        symbol.selectionRange.start.character
      ),
      symbol.name,
      refsCount,
      defsCount
    );
    return { symbol, refs, defs };
  };
  const checkSymbolRefs = (
    source: string,
    path: string[],
    kind: keyof typeof vscode.SymbolKind,
    refsCount: number,
    defsCount: number
  ) =>
    checkSymbolRefsEx(source, path, kind, refsCount, defsCount).then(
      (result) => result.symbol
    );

  const checkFoo = async (funcName: string, varName: string) => {
    const testsSource = path.resolve(project1Dir, "Project1Source.mc");
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

  const doRenameEx = async (
    uri: vscode.Uri,
    pos: vscode.Position,
    newName: string
  ) => {
    const renameEdits = (await vscode.commands.executeCommand(
      "vscode.executeDocumentRenameProvider",
      uri,
      pos,
      newName
    )) as vscode.WorkspaceEdit;
    await vscode.workspace.applyEdit(renameEdits);
    symbols = null;
  };

  const doRename = async (docSym: VSSymbol, newName: string) =>
    doRenameEx(
      docSym.location!.uri,
      new vscode.Position(
        docSym.selectionRange.start.line,
        docSym.selectionRange.start.character
      ),
      newName
    );

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

  let serializer = Promise.resolve<unknown>(null);
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
    const testsSource = path.resolve(project1Dir, "Project1Source.mc");
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
    const testsSource = path.resolve(project1Dir, "Project1View.mc");
    const result = serializer
      .then(() => {
        symbols = null;
      })
      .then(() => checkSymbolRefs(testsSource, ["Project1View"], "Class", 1, 1))
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

  const checkRefsTargetString = (
    source: string,
    target: string,
    name: string,
    refs: number,
    defs: number
  ) => {
    return vscode.workspace
      .openTextDocument(source)
      .then((doc) => vscode.window.showTextDocument(doc).then(() => doc))
      .then((doc) => {
        const text = doc.getText();
        const index = text.indexOf(target);
        assert(index >= 0, `Expected to find ${target} in ${source}`);
        return checkRefsEx(
          doc.uri,
          doc.positionAt(index + target.length - name.length),
          name,
          refs,
          defs
        );
      });
  };

  test("Test Refs and Renames - types", function () {
    const testsSource = path.resolve(project1Dir, "Project1Source.mc");
    const result = serializer
      .then(() =>
        checkRefsTargetString(testsSource, "value as Type", "Type", 2, 1)
      )
      .then(({ uri, pos }) =>
        doRenameEx(uri, pos, "RenamedType").then(() =>
          checkRefsTargetString(
            testsSource,
            "value as RenamedType",
            "RenamedType",
            2,
            1
          )
        )
      )
      .finally(revertAll)
      .then(() =>
        checkRefsTargetString(
          testsSource,
          "as AnotherType",
          "AnotherType",
          1,
          1
        )
      )
      .then(({ uri, pos }) =>
        doRenameEx(uri, pos, "RenamedType").then(() =>
          checkRefsTargetString(
            testsSource,
            "as RenamedType",
            "RenamedType",
            1,
            1
          )
        )
      )
      .finally(revertAll)
      .then(() =>
        checkRefsTargetString(testsSource, "or TestEnum", "TestEnum", 1, 1)
      )
      .then(({ uri, pos }) =>
        doRenameEx(uri, pos, "RenamedEnum").then(() =>
          checkRefsTargetString(
            testsSource,
            "or RenamedEnum",
            "RenamedEnum",
            1,
            1
          )
        )
      )
      .finally(revertAll);

    serializer = result.catch(() => null);
    return result;
  });

  test("Test Refs and Renames - barrels", function () {
    const testsSource = path.resolve(project1Dir, "Project1Source.mc");
    const result = serializer
      .then(() =>
        checkRefsTargetString(
          testsSource,
          "BarrelTest.Rez.Strings.TestString",
          "TestString",
          4,
          1
        )
      )
      .then(({ uri, pos }) =>
        doRenameEx(uri, pos, "ChangedString").then(() =>
          checkRefsTargetString(
            testsSource,
            "BarrelTest.Rez.Strings.ChangedString",
            "ChangedString",
            4,
            1
          )
        )
      )
      .finally(revertAll);
    serializer = result.catch(() => null);
    return result;
  });

  test("Test References and inheritance", function () {
    const testsSource = path.resolve(project1Dir, "Project1Inheritance.mc");
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
