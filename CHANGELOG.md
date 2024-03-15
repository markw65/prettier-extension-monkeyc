# Change Log

All notable changes to the "prettier-extension-monkeyc" extension will be documented in this file.

#### 2.0.79

- Update to [@markw65/monkeyc-optimizer@1.1.49](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1149)
  - Fix a bug in cleanupUnusedVars that could cause the wrong variable to be removed
  - Allow variables mixed with literals in jungle files
  - Allow Char as operands to relational operators
  - Include Null in dictionary return type

#### 2.0.78

- Update to [@markw65/monkeyc-optimizer@1.1.46](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1146)

  - Needed for the new `extraExcludes` option

- Adds support for [extraExcludes](https://github.com/markw65/monkeyc-optimizer/wiki/The-extraExcludes-Option).
- Adds more Toybox documentation inline on hover.

#### 2.0.76

- Update to [@markw65/monkeyc-optimizer@1.1.44](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1144)
  - Proper fix for type mismatch errors relating to Rez.Strings under sdk-7.x, with tests. Previous fix introduced diagnostics with sdk-6.x at TypeCheckLevel=Strict

#### 2.0.76

- Update to [@markw65/monkeyc-optimizer@1.1.43](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1143)
  - Fix bogus type mismatch errors relating to Rez.Strings.\* under sdk-7.x
  - Fix a stack overflow caused by the post build array init optimization
  - Fix a bug allowing overridden methods to be inlined

#### 2.0.75

- Update to [@markw65/monkeyc-optimizer@1.1.41](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1141)
  - Add proper support for tuple types (Sdk-7.x)
  - Fix a bug with the signature of the initialize method of resource-generated menus

#### 2.0.74

- Update to [@markw65/monkeyc-optimizer@1.1.40](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1140) and [@markw65/prettier-plugin-monkeyc@1.0.54](https://github.com/markw65/prettier-plugin-monkeyc/blob/main/CHANGELOG.md#1054).
  - Adds minimal support for tuples, as implemented in sdk-7.x-beta
  - Fixes a problem with the post build optimizer caused by a change to the shlv and shrv bytecodes.

#### 2.0.73

- Update to [@markw65/monkeyc-optimizer@1.1.38](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1138).
  - Fix a bug that caused diagnostics to be duplicated, and sometimes to have garbled messages
  - Make the type of `{ :foo => null }` be `{ :foo => Object? }` so that subsequent assignments aren't flagged as errors.

#### 2.0.72 (not released)

- Update to [@markw65/monkeyc-optimizer@1.1.37](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1137).

  - Diagnostics for operators with incorrect types
  - Proper tracking of object literal types (`{ :foo => String, 42 => Array<Number> }` for example).
  - `Graphics.ColorValue`s are converted to hex numbers.
  - Various parsing speedups.

- Update to [@markw65/prettier-plugin-monkeyc@1.0.53](https://github.com/markw65/prettier-plugin-monkeyc/blob/main/CHANGELOG.md#1053).

#### 2.0.71

- Update to [@markw65/monkeyc-optimizer@1.1.36](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1136).
  - Fixes an issue that didn't allow `import` or `using` inside a class declaration.

#### 2.0.70

- Update to [@markw65/monkeyc-optimizer@1.1.35](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1135).

  - Minor improvements to the type checker
  - Significant speed up in the .xml parser

- Settings
  - Adds disableAnalysis to completely disable the background analysis (useful on slow machines where it can make the editor sluggish). Doing so effectively turns off all the language support features the extension provides, while still allowing you to build/run optimized versions of your code.
  - Adds disableHover, disableCompletion and disableSignature to turn off the hover, completion and signature providers respectively.

#### 2.0.69

- Update to [@markw65/monkeyc-optimizer@1.1.34](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1134).
  - minor improvements to the post build optimizer
  - minor improvements to the type checker

#### 2.0.68

- Update to [@markw65/monkeyc-optimizer@1.1.33](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1133).
  - Fixes an edge case bug in the post-optimize array init optimization, and makes the array init optimization work in a few cases where it used to give up.

#### 2.0.67

- Update to [@markw65/monkeyc-optimizer@1.1.32](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1132).

  - Minor bug fixes, and tweaks for sdk-6.2.x

- Update to README.md and package.json to describe more of the extension's features
- Move release notes from README.md to CHANGELOG.md

#### 2.0.66

- Update to [@markw65/monkeyc-optimizer@1.1.31](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1131).
  - Fixes issues with sdk-6.2.0

#### 2.0.65

- Update to [@markw65/monkeyc-optimizer@1.1.30](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1130).
  - Fixes an issue where exporting a project that uses barrels could fail.
  - Fixes a type analysis bug that could result in the type checker incorrectly thinking two types were disjoint.

#### 2.0.64

- Update to [@markw65/monkeyc-optimizer@1.1.29](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1129).
  - Fixes a bug that could incorrectly optimize away an `if` because the declared type of the operand was Object (this is wrong because some Toybox methods are declared as returning an object, but sometimes return null).
  - Gives better results for `hover` and `completions`

#### 2.0.63

- Update to [@markw65/monkeyc-optimizer@1.1.28](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1128).
  - Fixes a bug introduced in 2.0.61 causing the extension to stop working with sdks prior to 4.2.1
  - Fixes a bug in the post build optimizer which could cause a method to be invoked with the wrong `self`
  - Fixes a bug in type propagation which could cause incorrect type inferences as a result of a comparison when the inferred type of one of the operands was `Lang.Object`.

#### 2.0.62

- Update to [@markw65/monkeyc-optimizer@1.1.27](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1127).
  - Fixes an incorrect type checker error

#### 2.0.61

- Update to [@markw65/monkeyc-optimizer@1.1.26](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1126).
  - Fixes a bug in the post build optimizer that could cause pre variables to be inserted too late in the presence of try-catch blocks
  - Fixes an issue where some references from resource files were not available in `Goto references` or `Goto definition`
  - Adds support for `project.optimization` and `project.typecheck` in `.jungle` files
  - Adds support for the new `optimizationLevel` setting in the MonkeyC extension
  - Adds support for `Monkey Styles` (ie personalities and .mss files)

#### 2.0.60

- Update to [@markw65/monkeyc-optimizer@1.1.25](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1125).
  - Fixes a bug in the post build optimizer that could cause code to be removed incorrectly

#### 2.0.59

- Update to [@markw65/monkeyc-optimizer@1.1.24](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1124).
  - Adds some new post build optimizations

#### 2.0.58

- Update to [@markw65/monkeyc-optimizer@1.1.22](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1122).

  - Fixes [#8](https://github.com/markw65/prettier-extension-monkeyc/issues/8)
  - Adds some new post build optimizations

- Update to [@markw65/monkeyc-optimizer@1.1.23](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1123).
  - Fixes an issue building the extension with 1.1.22

#### 2.0.57

- Update to [@markw65/monkeyc-optimizer@1.1.21](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1121).
  - Various improvements to both the source to source and post build optimizers

#### 2.0.56

- Update to [@markw65/monkeyc-optimizer@1.1.20](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1120).
  - Fixes a rare bug in the source to source optimizer
  - Small improvement to dce in the post build optimizer

#### 2.0.55

- Update to [@markw65/monkeyc-optimizer@1.1.19](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1119).
  - Fixes #7

#### 2.0.54

- Update to [@markw65/monkeyc-optimizer@1.1.18](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1118).
  - Faster `export`
  - Properly update `-settings.json` and `-fit_contributions.json` files when running the post build optimizer

#### 2.0.53

- Update to [@markw65/monkeyc-optimizer@1.1.16](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1116).

  - Improvements to the post build optimizer

- When `useLocalOptimizer` is set, use the locally installed `@markw65/monkeyc-optimizer` for both the source-to-source optimizer, and the post-build optimizer, to ensure repeatable builds.

#### 2.0.52

- Update to [@markw65/monkeyc-optimizer@1.1.15](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1115).
  - Improvements to the post build optimizer
  - Adds support for the new `Iterate Optimizer` setting.

#### 2.0.51

- Update to [@markw65/monkeyc-optimizer@1.1.14](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1114).
  - Adds a post build optimizer which optimizes the bytecode
  - Adds the device to the size info line in the build output

#### 2.0.50

- Update to [@markw65/monkeyc-optimizer@1.1.13](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1113).
  - Adds support for the [Minimize Modules](https://github.com/markw65/monkeyc-optimizer/wiki/Optimizing-module-imports#minimize-modules) pass.

#### 2.0.49

- Update to [@markw65/monkeyc-optimizer@1.1.12](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1112).
  - Fixes some bugs, and makes some improvements to `Single Use Copy Prop`

#### 2.0.48

- Update to [@markw65/monkeyc-optimizer@1.1.11](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1111).

  - various bug fixes, and adds the new Single Use Copy Prop pass

- Adds options for [Minimize Locals](https://github.com/markw65/monkeyc-optimizer/wiki/Local-variable-elimination#minimize-locals) and [Single Use Copy Prop](https://github.com/markw65/monkeyc-optimizer/wiki/Local-variable-elimination#single-use-copy-propagation)

#### 2.0.47

- Update to [@markw65/monkeyc-optimizer@1.1.10](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1110).

  - Fixes various minor bugs

- Adds a `HoverProvider` to provide info about calls and variables when you point the mouse at them.

#### 2.0.46

- Update to [@markw65/monkeyc-optimizer@1.1.9](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#119).
  - Fixes a crash
  - Adds a minimizeLocals pass to reduce stack usage, and sometimes reduce code size.

#### 2.0.45

- Update to [@markw65/monkeyc-optimizer@1.1.8](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#118).

  - Fixes a type checker warning where the type checker incorrectly deduced that a variable could be null
  - Adds various features to support the new `SignatureHelpProvider` and `CompletionItemProvider`

- Adds a `SignatureHelpProvider` to provide popup prompts when filling out the parameters of a call
- Adds a `CompletionItemProvider` to provide context sensitive completion prompts.

#### 2.0.44

- Update to [@markw65/monkeyc-optimizer@1.1.7](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#117).
  - Fix an inlining bug that could make a local from the inlined function appear to be in the enclosing scope. If there was a same named variable in the enclosing scope, the type checker would see both definitions, and think the type was unknown (since the local doesn't have a declared type), resulting in an `Any` type for the variable, which could result in some bogus warnings, and might possibly block some optimizations.

#### 2.0.43

- Update to [@markw65/monkeyc-optimizer@1.1.6](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#116).
  - various bug fixes to prevent bogus warnings.

#### 2.0.42

- Update to [@markw65/monkeyc-optimizer@1.1.4](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#114).
- Use type map from analysis to provide better symbol resolution for Goto Ref/Def etc.

#### 2.0.41

- Update to [@markw65/monkeyc-optimizer@1.1.3](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#113).
- Include new inline origins info in diagnostics, so that you can see exactly where an error message came from.
- Include new uri info in diagnostics (when provided).

#### 2.0.40

- Update to [@markw65/monkeyc-optimizer@1.1.2](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#112).
  - Mostly fixes for edge cases where the new optimizer did worse than the old.

#### 2.0.39

- Update to [@markw65/monkeyc-optimizer@1.1.0](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#110).
  - The optimizer has been mostly rewritten based on a type analysis and propagation pass
  - There are new settings to control the optimizer:
    - `trustDeclaredTypes` - default `true`. Whether to use monkeyc type annotations when deciding what can be optimized.
    - `propagateTypes` - default `true`. Gives the optimizer more type information, enabling more optimizations. Only disable this if it causes any issues with your code (and then please report the issues!).
    - `checkTypes` - sets the severity of any diagnostics reported by the type checker. Currently there are very few type-related diagnostics.

#### 2.0.38

- Update to [@markw65/monkeyc-optimizer@1.0.45](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1045).

#### 2.0.37

- Update to [@markw65/monkeyc-optimizer@1.0.44](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1044). Amongst other things:
  - More comprehensive constant folding [#6](https://github.com/markw65/prettier-extension-monkeyc/issues/6)
  - More comprehensive parsing of code embedded in resource files
  - Fixes a couple of minor parser issues

#### 2.0.36

- Update to [@markw65/monkeyc-optimizer@1.0.43](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1043). Amongst other things:

  - Fixes a couple of windows issues, introduced in 2.0.35
  - Fixes some issues jumping between refs and defs
  - Propagates `:typecheck(false)` when inlining

- Adds new setting `prettierMonkeyC.useLocalOptimizer` which can be used to prevent a locally installed copy of @markw65/monkeyc-optimizer from being used (this could be useful if you wanted an export task that uses a pinned version of the optimizer, for reproducibility, while all other build tasks used the latest version of the optimizer)
- Adds new setting `prettierMonkeyC.typeCheckLevel` which can be used to set the level to use for optimized code independently of `monkeyC.typeCheckLevel`

#### 2.0.35

- Update to [@markw65/monkeyc-optimizer@1.0.42](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1042). Amongst other things:
  - Much faster code analysis, resulting in snappier updates when editing .mc files
  - Better resource file support, so that Refs and Defs work seamlessly across `monkeyc`, `resource` and `manifest` files

#### 2.0.34

- Update to [@markw65/monkeyc-optimizer@1.0.41](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1041). Amongst other things:

  - Fixes a bug that could cause `and` and `or` to be incorrectly optimized
  - Fixes a bug that could prevent `has` from being optimized to false
  - Updates symbol lookup to match the current sdk (by default, but you can explicitly force compiler1 or compiler2)
  - Updates symbol lookup to match the behavior of static functions when invoked statically. Note that static functions can be invoked non-statically(!) and when you do the lookup behavior at runtime matches that of a non-static function. This means that the optimizer could start to report missing symbols in static functions that would actually work at runtime - but in that case, the function shouldn't have been declared static in the first place. This matches the behavior of the typechecker in the just released 4.1.7. Setting the `enforceStatic` option to `NO` will revert to the old behavior.

- Diagnostics relating to resource files are updated as you type, rather then when you save the resource file
- Added options controlling compiler1 vs compiler2 behavior, and related diagnostics
- Updates project analysis when the sdk version changes

#### 2.0.33

- Update to [@markw65/monkeyc-optimizer@1.0.39](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1039). Amongst other things:
  - Better optimization of `x has :y` when `x` definitely doesn't have `y`
  - Better analysis of projects using barrels (no change to the actual build), so that `Goto definition` etc will take you to a definition in a barrel.
  - Finds all symbols defined in resource files, so that `Goto definition` will take you to the resource definition (or list all of them if there's more than one). Currently `Goto References` won't find references in resource files, but will find all .mc file references to the resources. Also at present you can't click on the definition to find the .mc file references. I'm planning to fix this in a future release.
- Update all other npm dependencies
- Fix various issues watching files for changes:
  - If a file was changed, and then very quickly reverted, the revert wasn't always analyzed, potentially resulting in incorrect reports of syntax errors etc until the next change triggered a new analysis run.
  - Now that barrels are included in the analysis, they need to be watched for changes too.

#### 2.0.32

- Update to [@markw65/monkeyc-optimizer@1.0.38](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1038).
  - Improves inlining heuristics, to allow inlining the condition of an if-statement, and to allow the inline function to be embedded in a more complex expression. See [The @markw65/monkeyc-optimizer wiki](https://github.com/markw65/monkeyc-optimizer/wiki/Inlining) for more details of inlining.

#### 2.0.31

- Update to [@markw65/monkeyc-optimizer@1.0.37](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1037).
  - Embeds extensionVersion and optimizerVersion in the generated build-info.json
- Look for a project local @markw65/monkeyc-optimizer, and use it for builds if found.
- Add binary size info (code and data size) to build output.

#### 2.0.30

- Update to [@markw65/prettier-plugin-monkeyc@1.0.35](https://github.com/markw65/prettier-plugin-monkeyc#1035) and [@markw65/monkeyc-optimizer@1.0.36](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1036).
  - Fixes [prettier-plugin-monkeyc#1](https://github.com/markw65/prettier-plugin-monkeyc/issues/1)
  - Fixes [monkeyc-optimizer#1](https://github.com/markw65/monkeyc-optimizer/issues/1)

#### 2.0.29

- Update to [@markw65/monkeyc-optimizer@1.0.35](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1035).
  - Fixes a bug that prevented the optimizer from working in some cases.

#### 2.0.28

- Update to [@markw65/monkeyc-optimizer@1.0.34](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1034).

  - Optimized files use prettier options when formatting

- Update to [@markw65/prettier-plugin-monkeyc@1.0.34](https://github.com/markw65/prettier-plugin-monkeyc#1034).

#### 2.0.27

- Update to [@markw65/monkeyc-optimizer@1.0.33](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1033).
  - Fixes a bug where PRE could combine Float and Doubles with the same value, or Number and Longs with the same value.
  - Adds support for `(:keep)` to prevent removing a function that appears to be unused.

#### 2.0.26

- Update to [@markw65/monkeyc-optimizer@1.0.32](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1031). Highlights include:
  - Adds an unused variable cleanup pass
  - Improves function side-effect analysis, which gets better results for inlining and size-based PRE.
  - Fixes a bug that caused size-based PRE to miss a lot of opportunities.
  - Adds "Clean Optimized Build" to the activation events, so that it works when the extension hasn't yet been activated.

#### 2.0.25

- Update to [@markw65/monkeyc-optimizer@1.0.30](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1030).
  - Fixes a couple of inliner issues
  - Small improvement to heuristics for PRE

#### 2.0.24

- Update to [@markw65/monkeyc-optimizer@1.0.29](https://github.com/markw65/monkeyc-optimizer/blob/main/CHANGELOG.md#1029) for various new functionality.
- Add options to the settings, tasks.json and launch.json to control size based PRE.
- Add "Clean Optimized Build" command to remove all the generated files.
- Bug fixes
  - Bogus devices in manifest.xml (such as round_watch) could prevent the device chooser from working. Not a big deal, because the compiler won't build the project either.

#### 2.0.23

- Bug fixes
  - Update to `@markw65/monkeyc-optimizer@1.0.28` to fix a bug that prevented inlining certain functions.

#### 2.0.22

- Bug fixes
  - Update to `@markw65/prettier-plugin-monkeyc@1.0.29` to fix certain obscure comment related bugs in the formatter
  - Update to `@markw65/monkeyc-optimizer@1.0.27` to fix an issue where comments on a call that got inlined could be left dangling, and result in errors when the code was output.

#### 2.0.21

- Update to `@markw65/monkeyc-optimizer@1.0.26`
  - Use `self.` rather than `ClassName.` to qualify names that would otherwise collide with locals, since that works with both public and private variables
  - Fix a bug that caused the inliner to fail to qualify certain names, even if there was a collision with an existing local variables
  - Fix some name lookup issues relating to whether the lookup is done as a type or a value.

#### 2.0.20

- Update to `@markw65/monkeyc-optimizer@1.0.25`

  - Fixes bug reporting missing symbols for Method parameters

- Don't allow renaming of class methods (because we can't find all the references)

#### 2.0.19

- Update to `@markw65/monkeyc-optimizer@1.0.22`

  - Major update to the lookup system to match what the device actually does (rather than what the type checker incorrectly thinks it does)
  - Added diagnostics for missing symbols (updated as you type)
  - Reversed the sense of `inline_foo`, so now it inlines when foo is _not_ declared as an excludeAnnotation

- Added checkInvalidSymbols option. This can be set at the project level to control whether diagnostics are generated for missing symbols, and whether they're marked as ERROR, WARNING or INFO. It can also be set in custom tasks/launch configs to override the project default.

#### 2.0.18

- Update to `@markw65/monkeyc-optimizer@1.0.19`
  - Fixes inlining in expression context when the argument to the callee is one of the caller's parameters
  - Fixes nested inlining
  - Fixes a crash caused by comments on attributes.

#### 2.0.17

- Update to `@markw65/monkeyc-optimizer@1.0.19`
  - Fixes some minor bugs
  - Ensures that functions that get inlined at all callsites are eliminated from the source.

#### 2.0.16

- Update to `@markw65/monkeyc-optimizer@1.0.19`

  - Adds support for statement-level inlining in assignment and return contexts
  - Adds some minor optimizations, mostly to clean up code generated by the inliner

- Add `testBuild` to task.json options, to do a build with tests enabled
- Add `runTests` to launch.json options (matching the corresponding monkeyC option) to run any tests in the project.
- Provide diagnostics when `(:inline)` annotated functions fail to get inlined.

#### 2.0.15

- Bug fixes
  - The inliner could incorrectly constant propagate a parameter past an assignment to that parameter, generating uncompilable code at the same time.

#### 2.0.14

- Update to `@markw65/monkeyc-optimizer@1.0.16`

  - Fixes a type lookup bug that cause some links to the api docs to go missing.
  - Adds support for inlining functions whose return value is unused.
  - Optimizes away side-effect free expression statements, such as `0;x;foo.bar;a+b`

- Bug Fixes
  - Links to the api docs for enum names (eg Graphics.FontDefinition) are no longer omitted.

#### 2.0.13

- Update to `@markw65/monkeyc-optimizer@1.0.16`
  - Fixes various minor bugs
  - Adds support for simple inlining
    - Currently limited to functions whose body consists of a single return statement.
    - Suitable functions marked `(:inline)` will be inlined when possible
    - Suitable functions marked `(:inline_<name>)` will be inlined when possible if `<name>` is found in the excludeAnnotations for the target device
    - Very simple functions will be inlined regardless of `(:inline*)` tags.
- Provide links for Toybox constants, variables, and types
- Add intellisense for typeCheckLevel values in tasks.json and launch.json
- Differentiate const vs var in Outline view

#### 2.0.12

- Bug fixes
  - Inject the name of the superclass into the classes namespace, so that lookups for the superclass name work
  - Fix `Generate Optimized Project` so it works again
  - Separate out type and value namespaces, and do the correct lookup based on context. Also inject all type names from `import`ed modules into the current namespace.
  - Fix the Definition and Reference providers so they recognize enum identifiers without initializers (previously, you could find such an identifier by clicking on a reference, and `Go to definition`, but clicking on the definition itself didn't recognize it as a definition).

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
  - From `@markw65/monkeyc-optimizer`
    - Only generate language configs for languages supported by the device, to avoid unnecessary warnings
    - Drop comments when the ast node that contains them is deleted
    - Treat barrel projects with no devices as having all devices
      - enables analysis to work in such projects.

#### 2.0.10

- Bump to `@markw65/monkeyc-optimizer@1.0.12`
- Better error handling/reporting when the sdk is missing
- Use the correct sdk paths on Linux

#### 2.0.9

- Bump to `@markw65/monkeyc-optimizer@1.0.11`
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

#### 2.0.8

- add full support for optimizing barrels

#### 2.0.7

- upgrade to `@markw65/monkeyc-optimizer:1.0.9` for better barrel support, and minor bug fixes
- upgrade to `@markw65/prettier-plugin-monkeyc:1.0.15` to fix a bug that dropped attributes on module declarations
- switch to using a CustomExecution for tasks, which keeps everything in-process

#### 2.0.6

Upgrade to `@markw65/monkeyc-optimizer:1.0.8` to fix more issues found via open source projects.

- Improvements

  - Update to `@markw65/prettier-plugin-monkeyc:1.0.14`
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

#### 2.0.5

Upgrade to `@markw65/monkeyc-optimizer:1.0.7` to fix some more optimizer bugs found via open source projects.

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

#### 2.0.4

Upgrade to `@markw65/prettier-plugin-monkeyc:1.0.12` to fix various parser issues:

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

Upgrade to `@markw65/monkeyc-optimizer:1.0.4` to fix some optimizer bugs

#### 2.0.2

- Upgrade to `@markw65/monkeyc-optimizer:1.0.4`
- Split the build into release and debug, so we can exclude code based on (:release) and (:debug)
- Optimize away `if (constant)`, `while (false)` and `constant ? E1 : E2`. Convert `do BODY while(false)` to `BODY`

#### 2.0.1

- Fix an order dependency processing imports
- Better error reporting when something goes wrong internally

#### 2.0.0

- Added the source-to-source optimizer

#### 1.0.1 - 1.0.8

- Minor tweaks to the Formatter

#### 1.0.0

- Initial release of the Formatter
