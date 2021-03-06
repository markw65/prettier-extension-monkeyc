# prettier-extension-monkeyc README

This extension adds a source-to-source optimizer for Monkey C, and also a Monkey C formatter, via
the [@markw65/prettier-plugin-monkeyc](https://www.npmjs.com/package/@markw65/prettier-plugin-monkeyc) prettier plugin and the [VSCode Prettier extension](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode).

## Features

- [Source to Source Optimizer](#source-to-source-optimizer)
- [Various vscode support features for MonkeyC](#various-support-features-for-monkey-c)
- [Monkey C Code Formatter](#monkey-c-code-formatter)

---

### Source to Source Optimizer:

Various constructs in Monkey-C have runtime costs, including `const` and `enum` declarations. This plugin can generate a copy of your program with all `const`s and `enum`s replaced with their values, and also constant fold simple expressions, reducing generated code size, and improving performance. In addition, it removes dead code, and can optionally strip code based on excludeAnnotations.

#### Input

```
    import Toybox.Lang;
    import Toybox.Graphics;
    const FOO = 6;
    enum Bar { A, B=2, C}
    function foo(x as Number) as Number { return x * 3 - 1; }
    function bar(dc as Graphics.Dc) as Number {
        dc.setColor(Graphics.COLOR_RED, Graphics.COLOR_BLACK);
        return foo(FOO) - C * 3;
    }
```

#### Output

```
    import Toybox.Lang;
    import Toybox.Graphics;
    typedef Bar as Number;
    function bar(dc as Graphics.Dc) as Number {
        dc.setColor(
            16711680 as Toybox.Graphics.ColorValue,
            0 as Toybox.Graphics.ColorValue
        );
        return 8;
    }
```

Note that although the call to dc.setColor looks a lot more verbose, the literals generate much less code than the enums (and the `as Toybox.Graphics.ColorValue` generates no runtime code at all, but keeps the type checker happy).

#### Commands

- `Generate Optimized Project`: Produces the optimized source code, and a new jungle file to build it with.
- `Build Optimized Project`: Generates the optimized source code, and builds it.
- `Build and Run Optimized Project`: Generates, builds, and runs the optimized project.
- `Export Optimized Project`: Builds a .iq file from the optimized sources.

By default the optimizer will figure out the excludeAnnotations and sourcePaths for each device your project supports, and then group the sources based on identical sets. This generates the best possible results, but can be slow if each device has its own excludeAnnotations, for example. To reduce the number of groups, there are options to ignore excludeAnnotations, and sourcePaths.

#### Tasks and Launch configs

You can provide more control over the build via `tasks.json` and `launch.json`. You can add configurations with type `omonkeyc` similar to the corresponding `monkeyc` ones that Garmin provides, but you can override any of the build options (so eg, you can create a `Build and run Debug` launch config, and a `Build and run Release` launch config, and switch between them from the `Run and Debug` menu).

---

### Various support features for Monkey C

- `Goto Definition`, and `Peek Definition`
- `Rename symbol`
- `Goto References` and `Peek References`
- `Outline Mode`, `Goto Symbol` (Cmd-Shift-O), and `Open symbol by name` (Cmd-T)
- Shows parser issues in the `Problems` tab as you type, rather than when you compile

---

### Monkey C code formatter:

#### Input

```
    dc.drawText(_width/2, 3,Graphics.FONT_TINY, "Ax = "+_accel[0], Graphics.TEXT_JUSTIFY_CENTER);
```

#### Output

```
    dc.drawText(
        _width / 2,
        3,
        Graphics.FONT_TINY,
        "Ax = " + _accel[0],
        Graphics.TEXT_JUSTIFY_CENTER
    );
```

## Requirements

This extension depends on the [VSCode Prettier extension](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode), and the [Garmin MonkeyC extension](https://marketplace.visualstudio.com/items?itemName=garmin.monkey-c). They will automatically be installed if necessary when you install this extension.

## Extension Settings

- `prettierMonkeyC.outputPath`: Where the optimized source should be generated. Defaults to `bin/optimized`.
- `prettierMonkeyC.ignoredExcludeAnnotations`: Semicolon separated list of excludeAnnotations to ignore, or `\*' to ignore all. This can reduce how many sets of optimized source code get produced.
- `prettierMonkeyC.ignoredSourcePaths`: A regex to allow more grouping of source paths. If eg `fenix3` is built from `source` and `source-fenix3`, while `fenix5` is built from `source` and `source-fenix5`, the default configuration would produce two sets of optimized source. One based on `source` and `source-fenix3`, the other based on `source` and `source-fenix5`. Setting this to `source-fenix[35]` would produce just one set of optimized source, based on `source`, `source-fenix3` and `source-fenix5`. Depending on the contents of the three directories, this may prevent some optimizations, but will speed up the build.

## Known Issues

- [A type checker bug](https://forums.garmin.com/developer/connect-iq/i/bug-reports/inconsistent-type-checker-errors) makes it hard to know exactly how to replace an enum with the corresponding number without causing type checker errors. As a result, type checking is off by default for optimized builds (but can be enabled explicitly in configured tasks or launch configs).
- Some of the constants in <sdk>/bin/api.mir are incorrect. In particular, all of the enums/constants that should be negative have the corresponding positive value. I've built a list of exceptions that need fixing which I believe is complete, but its hard to be sure.

## Release Notes

#### 1.0.0

- Initial release of the Formatter

#### 1.0.1 - 1.0.8

- Minor tweaks to the Formatter

#### 2.0.0

- Added the source-to-source optimizer

#### 2.0.1

- Fix an order dependency processing imports
- Better error reporting when something goes wrong internally

#### 2.0.2

- Upgrade to @markw65/monkeyc-optimizer:1.0.4
- Split the build into release and debug, so we can exclude code based on (:release) and (:debug)
- Optimize away `if (constant)`, `while (false)` and `constant ? E1 : E2`. Convert `do BODY while(false)` to `BODY`

#### 2.0.4

Upgrade to @markw65/prettier-plugin-monkeyc:1.0.12 to fix various parser issues:

- Allow space after `arg` in `catch ( arg ) {`
- Allow space after `,` in `for (i = 0 , j = 0; whatever; i++ , j++ ) {`
- Don't reuse ArrayLiteral for `new [ size ]` because it can
  confuse the estree printer
- Ignore "@" at the beginning of an identifier (is this right? It doesn't
  seem to do anything)
- Floating point literals need a digit after the point. Otherwise
  `42.toChar()` gets misparsed by consuming `42.` as a float literal,
  and then hitting a syntax error.
- Allow `static class Foo {}` (but ignore the static)
- Fixup reserved word lists
- Handle octal literals
- Parse `new [size]b`

Upgrade to @markw65/monkeyc-optimizer:1.0.4 to fix some optimizer bugs

#### 2.0.5

Upgrade to @markw65/monkeyc-optimizer:1.0.7 to fix some more optimizer bugs found via open source projects.

- Fix parsing of quoted strings in jungle files
- Better error messages from the test framework
- Lazier handling of variables in jungle files
- Fix handling of negative enums that get completely removed
- Fix a bug analyzing empty classes
- Fix a typo that could result in consts being incorrectly eliminated
- Fix an edge case handling local jungle variables
- More test options, and add filters for some of the remote projects
- Try to clean up broken jungles and manifests
- Fix handling of unnamed callees
- Drop unrecognized devices
- Add support for a 'pick-one' device to aid testing
- Add a flag to remote projects to prevent trying to build them (some projects are broken to start with)

#### 2.0.6

Upgrade to @markw65/monkeyc-optimizer:1.0.8 to fix more issues found via open source projects.

- Improvements

  - Update to @markw65/prettier-plugin-monkeyc:1.0.14
  - Parse and respect \<build\> instructions in resource files
  - Add minimal barrel support
  - Better checking for whether the optimized source is up to date
  - Rename locals which would be marked re-declaring

- Bug Fixes

  - Generate the default jungle dynamically, since sdk/bin/default.jungle is generated lazily, and may not exist in newly installed sdks, or may be out of date after device installations.
  - Fix a bug generating language settings in optimized jungle
  - Fix a bug introduced by pick-one: don't modify a shared array
  - Don't allow src paths to navigate out of the optimized directory
  - Fix some windows paths issues

- Tests
  - More parallelism while fetching remote projects for testing
  - Add option to build the original project, rather than the optimized one
  - Add support for overriding build options on a per project basis
  - Add an option so we only 'fix' the manifest when running remote projects
  - Check the manifest's application id, and throw in a valid one if necessary
  - Allow project specific overrides for the generated monkey.jungle files, and use it to fix some projects
  - Add patches for some broken projects

#### 2.0.7

- upgrade to @markw65/monkeyc-optimizer:1.0.9 for better barrel support, and minor bug fixes
- upgrade to @markw65/prettier-plugin-monkeyc:1.0.15 to fix a bug that dropped attributes on module declarations
- switch to using a CustomExecution for tasks, which keeps everything in-process

#### 2.0.8

- add full support for optimizing barrels

#### 2.0.9

- Bump to @markw65/monkeyc-optimizer@1.0.11
- Properly handle extension disposables
  - prevents potential issues when the extension is repeatedly enabled/disabled, or different workspaces are loaded/unloaded.
- Switch to typescript
  - The project was getting too complex to manage. typescript helps a little.
- Implement a definition provider
  - Supports `Goto Definition`, and `Peek Definition`
- Add a rename provider
  - Supports `Rename symbol`
- Add a reference provider
  - Supports `Goto References` and `Peek References`
- Report parser errors
  - Shows parser issues in the `Problems` tab as you type, rather than when you compile
- Add Document and Workspace Symbol Providers
  - Supports `Outline Mode`, `Goto Symbol` (Cmd-Shift-O), and `Open symbol by name` (Cmd-T)

#### 2.0.10

- Bump to @markw65/monkeyc-optimizer@1.0.12
- Better error handling/reporting when the sdk is missing
- Use the correct sdk paths on Linux

#### 2.0.11

- Bug fixes

  - Only create a project if a jungle file is found
  - Stop returning definitions from api.mir
  - Handle device selection properly in multi-folder workspaces
  - Ignore in memory edits of jungle/manifest files, because we always read them from disk
  - Fix type of task/launch option 'compilerWarnings'

- Code cleanup

  - Move the task provider and debug config provider out of extension.ts
  - Add vscode:prepublish script so we don't package/publish a stale build
  - strict type checking
  - npm upgrade

- Improvements
  - Better handling of errors in jungles, and better detection of changes in the project
  - Add a DocumentLinkProvider to turn Toybox references into links to the sdk documentation
  - Better handling of multi-project workspaces
  - Better error reporting
  - Reorganize options, and make document links optional
  - From @markw65/monkeyc-optimizer
    - Only generate language configs for languages supported by the device, to avoid unnecessary warnings
    - Drop comments when the ast node that contains them is deleted
    - Treat barrel projects with no devices as having all devices
      - enables analysis to work in such projects.

#### 2.0.12

- Bug fixes
  - Inject the name of the superclass into the classes namespace, so that lookups for the superclass name work
  - Fix `Generate Optimized Project` so it works again
  - Separate out type and value namespaces, and do the correct lookup based on context. Also inject all type names from `import`ed modules into the current namespace.
  - Fix the Definition and Reference providers so they recognize enum identifiers without initializers (previously, you could find such an identifier by clicking on a reference, and `Go to definition`, but clicking on the definition itself didn't recognize it as a definition).

#### 2.0.13

- Update to @markw65/monkeyc-optimizer@1.0.16
  - Fixes various minor bugs
  - Adds support for simple inlining
    - Currently limited to functions whose body consists of a single return statement.
    - Suitable functions marked `(:inline)` will be inlined when possible
    - Suitable functions marked `(:inline_<name>)` will be inlined when possible if `<name>` is found in the excludeAnnotations for the target device
    - Very simple functions will be inlined regardless of `(:inline*)` tags.
- Provide links for Toybox constants, variables, and types
- Add intellisense for typeCheckLevel values in tasks.json and launch.json
- Differentiate const vs var in Outline view

#### 2.0.14

- Update to @markw65/monkeyc-optimizer@1.0.16

  - Fixes a type lookup bug that cause some links to the api docs to go missing.
  - Adds support for inlining functions whose return value is unused.
  - Optimizes away side-effect free expression statements, such as `0;x;foo.bar;a+b`

- Bug Fixes
  - Links to the api docs for enum names (eg Graphics.FontDefinition) are no longer omitted.

#### 2.0.15

- Bug fixes
  - The inliner could incorrectly constant propagate a parameter past an assignment to that parameter, generating uncompilable code at the same time.

#### 2.0.16

- Update to @markw65/monkeyc-optimizer@1.0.19

  - Adds support for statement-level inlining in assignment and return contexts
  - Adds some minor optimizations, mostly to clean up code generated by the inliner

- Add `testBuild` to task.json options, to do a build with tests enabled
- Add `runTests` to launch.json options (matching the corresponding monkeyC option) to run any tests in the project.
- Provide diagnostics when `(:inline)` annotated functions fail to get inlined.

#### 2.0.17

- Update to @markw65/monkeyc-optimizer@1.0.19
  - Fixes some minor bugs
  - Ensures that functions that get inlined at all callsites are eliminated from the source.

#### 2.0.18

- Update to @markw65/monkeyc-optimizer@1.0.19
  - Fixes inlining in expression context when the argument to the callee is one of the caller's parameters
  - Fixes nested inlining
  - Fixes a crash caused by comments on attributes.

#### 2.0.19

- Update to @markw65/monkeyc-optimizer@1.0.22

  - Major update to the lookup system to match what the device actually does (rather than what the type checker incorrectly thinks it does)
  - Added diagnostics for missing symbols (updated as you type)
  - Reversed the sense of `inline_foo`, so now it inlines when foo is _not_ declared as an excludeAnnotation

- Added checkInvalidSymbols option. This can be set at the project level to control whether diagnostics are generated for missing symbols, and whether they're marked as ERROR, WARNING or INFO. It can also be set in custom tasks/launch configs to override the project default.

#### 2.0.20

- Update to @markw65/monkeyc-optimizer@1.0.25

  - Fixes bug reporting missing symbols for Method parameters

- Don't allow renaming of class methods (because we can't find all the references)

#### 2.0.21

- Update to @markw65/monkeyc-optimizer@1.0.26
  - Use `self.` rather than `ClassName.` to qualify names that would otherwise collide with locals, since that works with both public and private variables
  - Fix a bug that caused the inliner to fail to qualify certain names, even if there was a collision with an existing local variables
  - Fix some name lookup issues relating to whether the lookup is done as a type or a value.

#### 2.0.22

- Bug fixes
  - Update to `@markw65/prettier-plugin-monkeyc@1.0.29` to fix certain obscure comment related bugs in the formatter
  - Update to `@markw65/monkeyc-optimizer@1.0.27` to fix an issue where comments on a call that got inlined could be left dangling, and result in errors when the code was output.

#### 2.0.23

- Bug fixes
  - Update to `@markw65/monkeyc-optimizer@1.0.28` to fix a bug that prevented inlining certain functions.

#### 2.0.24

- Update to [@markw65/monkeyc-optimizer@1.0.29](https://github.com/markw65/monkeyc-optimizer#1029) for various new functionality.
- Add options to the settings, tasks.json and launch.json to control size based PRE.
- Add "Clean Optimized Build" command to remove all the generated files.
- Bug fixes
  - Bogus devices in manifest.xml (such as round_watch) could prevent the device chooser from working. Not a big deal, because the compiler won't build the project either.

#### 2.0.25

- Update to [@markw65/monkeyc-optimizer@1.0.30](https://github.com/markw65/monkeyc-optimizer#1030).
  - Fixes a couple of inliner issues
  - Small improvement to heuristics for PRE

#### 2.0.26

- Update to [@markw65/monkeyc-optimizer@1.0.32](https://github.com/markw65/monkeyc-optimizer#1031). Highlights include:
  - Adds an unused variable cleanup pass
  - Improves function side-effect analysis, which gets better results for inlining and size-based PRE.
  - Fixes a bug that caused size-based PRE to miss a lot of opportunities.
  - Adds "Clean Optimized Build" to the activation events, so that it works when the extension hasn't yet been activated.

#### 2.0.27

- Update to [@markw65/monkeyc-optimizer@1.0.33](https://github.com/markw65/monkeyc-optimizer#1033).
  - Fixes a bug where PRE could combine Float and Doubles with the same value, or Number and Longs with the same value.
  - Adds support for `(:keep)` to prevent removing a function that appears to be unused.

---
