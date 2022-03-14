# prettier-extension-monkeyc README

This extension adds support for the `@markw65/prettier-plugin-monkeyc` prettier plugin to the [VSCode Prettier extension](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode).

Note that if you're happy using npm, or want to use prettier from the command line, you should just install the [VSCode Prettier extension](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode), and follow the instructions at [@markw65/prettier-plugin-monkeyc](https://www.npmjs.com/package/@markw65/prettier-plugin-monkeyc). This extension just simplifies that process if all you want is a bundled prettier extension inside vscode that handles MonkeyC.

## Features

Formats Monkey C code:
### Input

```
    dc.drawText(_width/2, 3,Graphics.FONT_TINY, "Ax = "+_accel[0], Graphics.TEXT_JUSTIFY_CENTER);
```

### Output

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

There are currently no settings specific to this extension. Most standard prettier config options will apply, however.

## Known Issues

## Release Notes

### 1.0.0

Initial release.

-----------------------------------------------------------------------------------------------------------
