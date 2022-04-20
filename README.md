# prettier-extension-monkeyc README

This extension adds a source-to-source optimizer for Monkey C, and also a Monkey C formatter, via
the [@markw65/prettier-plugin-monkeyc](https://www.npmjs.com/package/@markw65/prettier-plugin-monkeyc) prettier plugin and the [VSCode Prettier extension](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode).

## Features

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
- The optimizer will only re-generate the optimized source if the original source code has changed since the last time it was built. If you change options, but not the source code, you'll need to delete bin/optimized to ensure things are rebuilt.

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

---
