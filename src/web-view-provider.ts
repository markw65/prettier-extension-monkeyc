import * as vscode from "vscode";
import {
  ALLOCATED_PROXY_PORT,
  createProxyServer,
  encodeProxyPath,
} from "./web-view-proxy";

export class DynamicBrowserProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _pendingUrl?: string;

  public get isVisible(): boolean {
    return this._view ? this._view.visible : false;
  }

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.onDidDispose(() => {
      this._view = undefined;
    });

    webviewView.webview.onDidReceiveMessage((message) => {
      if (
        message != null &&
        typeof message === "object" &&
        message.command === "updateBrowserState" &&
        typeof message.url === "string"
      ) {
        this._pendingUrl = message.url;
      }
    });

    if (this._pendingUrl) {
      this.setUrl(this._pendingUrl);
    }
  }

  public setUrl(url: string) {
    if (!this._view) {
      this._pendingUrl = url;
      return;
    }
    this._view.show(true); // Bring this specific view container into focus
    configureWebview(this._view.webview, url);
  }

  public changeUrl(url: string) {
    if (!this._view) {
      this._pendingUrl = url;
      return;
    }
    this._view?.show(true); // Bring this specific view container into focus
    this._view?.webview.postMessage({ command: "outerNavigate", url });
  }

  // New method to blank out the view when another layout position is targeted
  public async clear(
    panel?:
      | "toggleSidebarVisibility"
      | "closeAuxiliaryBar"
      | "closePanel"
      | undefined
  ) {
    if (this._view) {
      try {
        this._view.webview.html = "";
        if (panel && this._view.visible) {
          //await vscode.commands.executeCommand(`workbench.action.${panel}`);
        }
      } catch (e) {
        console.log(e);
      }
    }
    this._pendingUrl = undefined;
  }
}

export async function registerBrowserProviders() {
  const leftProvider = new DynamicBrowserProvider();
  const rightProvider = new DynamicBrowserProvider();
  const bottomProvider = new DynamicBrowserProvider();

  let editorPanel: vscode.WebviewPanel | undefined;

  const proxyServer = createProxyServer();

  function initPanel(webviewPanel: vscode.WebviewPanel, url: string) {
    webviewPanel.webview.options = {
      enableScripts: true,
    };

    configureWebview(webviewPanel.webview, url);

    editorPanel = webviewPanel;
    webviewPanel.onDidDispose(() => {
      editorPanel = undefined;
    });
  }

  vscode.commands.executeCommand(
    "setContext",
    "prettiermonkeyc.browserLocation",
    ""
  );
  class BrowserTabSerializer implements vscode.WebviewPanelSerializer {
    // This handles restoring the panel when VS Code restarts
    async deserializeWebviewPanel(
      webviewPanel: vscode.WebviewPanel,
      state: unknown
    ) {
      const savedUrl =
        (state != null &&
          typeof state === "object" &&
          "url" in state &&
          typeof state.url === "string" &&
          state.url) ||
        "https://developer.garmin.com/connect-iq/api-docs/Toybox/Application.html";

      initPanel(webviewPanel, savedUrl);
    }
  }

  async function openWebView(
    url: string,
    target: "left" | "right" | "bottom" | "tab" | "split"
  ) {
    if (target !== "left") {
      await leftProvider.clear("toggleSidebarVisibility");
    }
    if (target !== "right") {
      await rightProvider.clear("closeAuxiliaryBar");
    }
    if (target !== "bottom") {
      await bottomProvider.clear("closePanel");
    }

    if (editorPanel && target !== "tab" && target !== "split") {
      editorPanel.dispose();
      editorPanel = undefined;
    }

    // 2. Activate the newly chosen view location
    if (target === "tab" || target === "split") {
      const viewColoumn =
        target === "tab" ? vscode.ViewColumn.Active : getTargetColumn();
      if (editorPanel) {
        editorPanel.reveal(viewColoumn);
        editorPanel?.webview.postMessage({ command: "outerNavigate", url });
      } else {
        editorPanel = vscode.window.createWebviewPanel(
          "monkeyCBrowser",
          "MonkeyC API",
          viewColoumn,
          { enableScripts: true, retainContextWhenHidden: true }
        );
        initPanel(editorPanel, url);
      }
      return;
    }
    if (target === "left") {
      leftProvider.changeUrl(url);
    } else if (target === "right") {
      rightProvider.changeUrl(url);
    } else if (target === "bottom") {
      bottomProvider.changeUrl(url);
    } else {
      return;
    }

    await vscode.commands.executeCommand(
      "setContext",
      "prettiermonkeyc.browserLocation",
      target
    );

    return vscode.commands.executeCommand(
      `workbench.view.extension.prettiermonkeyc-${target}-container`
    );
  }

  return [
    openWebView,
    vscode.window.registerWebviewViewProvider(
      "prettiermonkeyc.browser.left",
      leftProvider
    ),
    vscode.window.registerWebviewViewProvider(
      "prettiermonkeyc.browser.right",
      rightProvider
    ),
    vscode.window.registerWebviewViewProvider(
      "prettiermonkeyc.browser.bottom",
      bottomProvider
    ),
    vscode.window.registerWebviewPanelSerializer(
      "monkeyCBrowser",
      new BrowserTabSerializer()
    ),
    {
      dispose: () => proxyServer.close(),
    },
  ] as const;
}

function configureWebview(webview: vscode.Webview, url: string) {
  const pathRoute = encodeProxyPath(url);
  const proxiedUrl = `http://127.0.0.1:${ALLOCATED_PROXY_PORT}/ui/${encodeURIComponent(pathRoute)}`;

  webview.onDidReceiveMessage(async (message: unknown) => {
    if (
      message == null ||
      typeof message !== "object" ||
      !("command" in message) ||
      typeof message.command !== "string"
    ) {
      return;
    }
    switch (message.command) {
      case "openExternalBrowser": {
        if (!("url" in message) || typeof message.url !== "string") {
          return;
        }
        const targetUrl = message.url;

        try {
          //const uri = vscode.Uri.parse(targetUrl);
          await vscode.commands.executeCommand("simpleBrowser.show", targetUrl);
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to open URL: ${targetUrl}`);
        }
        return;
      }
    }
  });
  webview.html = `
    <html style="margin:0;padding:0;height:100%;overflow:hidden;">
        <body style="margin:0;padding:0;height:100%;overflow:hidden;">
            <div style="margin:0;padding:0;height:100%;position: relative; overflow: hidden;" onscroll="this.scrollTop = 0; this.scrollLeft = 0;">
                <iframe
                    id="ui-controller-frame"
                    src="${proxiedUrl}"
                    style="width:100%;height:100%;border:none;background:transparent;position:absolute;top:0;left:0;"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-top-navigation-by-user-activation"
                ></iframe>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                vscode.setState({ url: "${url}" });
                const uiFrame = document.getElementById("ui-controller-frame");

                function parseToRGB(colorStr) {
                    const div = document.createElement('div');
                    div.style.color = colorStr;
                    document.body.appendChild(div);
                    const computed = window.getComputedStyle(div).color;
                    document.body.removeChild(div);
                    const matches = computed.match(/\\d+/g);
                    return matches ? matches.slice(0, 3).map(Number) : null;
                }

                function getLuminance([r, g, b]) {
                    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
                }
                function sendStyleSheetText() {
                    if (!uiFrame || !uiFrame.contentWindow) return;

                    console.log("getting styles");
                    const computedStyles = window.getComputedStyle(document.documentElement);
                    const vsBg = parseToRGB(computedStyles.getPropertyValue('--vscode-editor-background').trim());
                    const vsFg = parseToRGB(computedStyles.getPropertyValue('--vscode-foreground').trim());

                    console.log("Got colors", vsBg, vsFg);

                    // 1. Get equivalent gray points for the target theme (0 to 1 scale)
                    const bgLum = getLuminance(vsBg);
                    const fgLum = getLuminance(vsFg);

                    let dynamicFilter = 'none';

                    console.log("fg=", fgLum, " bg=", bgLum);
                    if (fgLum > bgLum) {
                        // ----------------------------------------------------
                        // DARK MODE PRECISE MATHEMATICAL MAPPING
                        // ----------------------------------------------------

                        const brightnessValue = fgLum + bgLum;
                        const invertValue = fgLum / brightnessValue;

                        dynamicFilter = \`
                            invert(\${invertValue.toFixed(4)})
                            brightness(\${brightnessValue.toFixed(4)})
                            hue-rotate(180deg)
                        \`.replace(/\\s+/g, ' ').trim();
                    } else {
                        // ----------------------------------------------------
                        // LIGHT MODE PRECISE MATHEMATICAL MAPPING
                        // ----------------------------------------------------
                        // For light mode, we squeeze the contrast and brightness windows
                        // to map the website's pure white (#FFF) and black (#000) directly
                        // into the boundaries of your active VS Code layout colors.
                        const brightnessValue = fgLum + bgLum;
                        const contrastValue = (bgLum - fgLum) / brightnessValue;

                        dynamicFilter = \`
                            contrast(\${contrastValue.toFixed(4)})
                            brightness(\${brightnessValue.toFixed(4)})
                        \`.replace(/\\s+/g, ' ').trim();
                    }

                    console.log("filter: ", dynamicFilter);
                    let cssText = ":root {\\n";
                    for (let i = 0; i < computedStyles.length; i++) {
                        const prop = computedStyles[i];
                        if (prop.startsWith('--vscode-')) {
                            cssText += \`  \${prop}: \${computedStyles.getPropertyValue(prop)};\\n\`;
                        }
                    }
                    cssText += \`}\\n
                        .frame-container {
                            filter: \${dynamicFilter} !important;
                        }
                    \`;
                    uiFrame.contentWindow.postMessage({
                        type: 'vscode-css-payload',
                        cssString: cssText
                    }, '*');
                }
                uiFrame.addEventListener('load', sendStyleSheetText);
                new MutationObserver(() => sendStyleSheetText()).observe(document.body, { attributes: true, attributeFilter: ['class'] });
                const messageHandler = (event) => {
                    const message = event.data;

                    if (message?.key != null) {
                        console.log("Got bubbled key: ", JSON.stringify(message.key));
                        const event = new KeyboardEvent('keydown', {
                            ...message.key, bubbles:true, cancelable: true
                        });
                        window.dispatchEvent(event);
                        return;
                    }
                    if (typeof message?.url !== "string") {
                        return;
                    }

                    if (message.command === 'outerNavigate') {
                        uiFrame.contentWindow.postMessage({
                            command: 'innerNavigate',
                            url: message.url
                        }, '*');
                    }
                    if (message.command === 'updateBrowserState') {
                        vscode.setState({ url: message.url });
                        vscode.postMessage(message);
                    }
                    if (message.command === 'Bubble' && /^https?:/.test(message.url)) {
                        vscode.postMessage({command:'openExternalBrowser',url:message.url});
                    }
                };
                window.addEventListener('message', messageHandler);
            </script>
        </body>
    </html>`;
}

function getTargetColumn() {
  const tabGroups = vscode.window.tabGroups;
  const allGroups = tabGroups.all;
  const activeGroup = tabGroups.activeTabGroup;

  const activeGroupIndex = allGroups.findIndex((g) => g === activeGroup);

  if (activeGroupIndex <= 0 || activeGroupIndex < allGroups.length - 1) {
    // we're not in the rightmost column, or there's only one column.
    return vscode.ViewColumn.Beside;
  }

  return allGroups[activeGroupIndex - 1].viewColumn;
}
