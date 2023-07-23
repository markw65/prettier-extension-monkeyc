# prettier-extension-monkeyc README

This extension adds a source-to-source optimizer for Monkey C, and also a Monkey C formatter, via
the [@markw65/prettier-plugin-monkeyc](https://www.npmjs.com/package/@markw65/prettier-plugin-monkeyc) prettier plugin and the [VSCode Prettier extension](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode).

## Features

- [Source to Source Optimizer](#source-to-source-optimizer)
- [Post build optimizer](#post-build-optimizer)
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

[More details...](https://github.com/markw65/monkeyc-optimizer/wiki#source-to-source-optimizer)

### Post build optimizer

The post build optimizer performs various bytecode optimizations on the built .prg/.iq file. This allows for optimizations that aren't possible at the source code level, and can result in significant size reductions.

[More details...](https://github.com/markw65/monkeyc-optimizer/wiki#post-build-optimizer)

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
- Shows some type checker issues in the `Problems` tab as you type.
- Provides context sensitive completions
- Provides function and symbol info on hover

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

- [A type checker bug](https://forums.garmin.com/developer/connect-iq/i/bug-reports/inconsistent-type-checker-errors) makes it hard to know exactly how to replace an enum with the corresponding number without causing type checker errors. As a result, type checking is off by default for optimized builds (but can be enabled explicitly in the extension's settings, or overriden in configured tasks or launch configs).
- (fixed in sdk-4.1.6) ~~Some of the constants in <sdk>/bin/api.mir are incorrect. In particular, all of the enums/constants that should be negative have the corresponding positive value. I've built a list of exceptions that need fixing which I believe is complete, but its hard to be sure.~~

## Release Notes

See [Change Log](CHANGELOG.md)
