import * as http from "http";
import * as https from "https";
import * as stream from "stream";
import { AddressInfo } from "net";
import { Transform, TransformCallback } from "stream";
import { createBrotliDecompress, createGunzip } from "node:zlib"; // Native decoders

export let ALLOCATED_PROXY_PORT = 0;

export function decodeProxyPath(path: string) {
  const match = path.match(/^\/(https?)\//);
  if (!match) return null;
  return `${match[1]}://${path.substring(match[0].length)}`;
}

export function encodeProxyPath(url: string) {
  return url.replace(/^(https?):\/\//, "$1/");
}

export function createProxyServer() {
  const proxyServer = http.createServer((req, res) => {
    if (!ALLOCATED_PROXY_PORT) {
      res.writeHead(400).end("Proxy server did not initalize");
      return;
    }

    const urlObj = new URL(
      req.url || "",
      `http://127.0.0.1:${ALLOCATED_PROXY_PORT}`
    );

    if (urlObj.pathname.startsWith("/ui/")) {
      const initialTarget = decodeProxyPath(
        decodeURIComponent(urlObj.pathname.substring(3))
      );
      if (!initialTarget) {
        res.writeHead(400).end("Invalid ui proxy path");
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(getProxyUiControllerHtml(initialTarget));
      return;
    }
    const targetUrlString = decodeProxyPath(urlObj.pathname);

    if (!targetUrlString) {
      res.writeHead(400).end("Invalid proxy path");
      return;
    }

    try {
      const targetUrl = new URL(targetUrlString);
      const client = targetUrl.protocol === "https:" ? https : http;

      const proxyReq = client.request(
        {
          hostname: targetUrl.hostname,
          port: targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80),
          path: targetUrl.pathname + targetUrl.search + targetUrl.hash,
          method: req.method,
          headers: {
            ...req.headers,
            host: targetUrl.host,
            "accept-encoding": "gzip, br",
          },
        },
        (proxyRes) => {
          // Strip frames and security blockers that trigger blank panels
          if (proxyRes.headers["x-frame-options"]) {
            delete proxyRes.headers["x-frame-options"];
          }
          if (proxyRes.headers["content-security-policy"]) {
            delete proxyRes.headers["content-security-policy"];
          }

          const contentType = proxyRes.headers["content-type"] || "";
          let pipe: stream.Readable = proxyRes;
          if (contentType.includes("text/html")) {
            const contentEncoding = proxyRes.headers["content-encoding"];
            if (contentEncoding) {
              delete proxyRes.headers["content-encoding"];
            }
            res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);

            const scriptBlock = interceptorScript;
            const injectorPipe = new HTMLProxyInjector(scriptBlock);

            switch (contentEncoding) {
              case "br":
                pipe = pipe.pipe(createBrotliDecompress());
                break;
              case "gzip":
                pipe = pipe.pipe(createGunzip());
                break;
            }

            pipe = pipe.pipe(injectorPipe);
          } else {
            // Forward raw binary streams like assets, icons, scripts, images cleanly
            res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
          }
          pipe.pipe(res);
        }
      );

      proxyReq.on("error", (err) => {
        res.writeHead(500).end(`Proxy Error: ${err.message}`);
      });
      req.pipe(proxyReq);
    } catch {
      res.writeHead(400).end("Malformed target URL");
    }
  });

  // Request a dynamically-free port from the OS kernel
  proxyServer.listen(0, "127.0.0.1", () => {
    const address = proxyServer?.address() as AddressInfo;
    if (address) {
      ALLOCATED_PROXY_PORT = address.port;
      console.log(`Proxy running on safe port: ${ALLOCATED_PROXY_PORT}`);
    }
  });

  proxyServer.on("close", () => {
    ALLOCATED_PROXY_PORT = 0;
  });

  return proxyServer;
}

function getProxyUiControllerHtml(initialUrl: string): string {
  const pathRoute = encodeProxyPath(initialUrl);
  const initialProxiedUrl = `http://127.0.0.1:${ALLOCATED_PROXY_PORT}/${pathRoute}`;

  return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="utf-8">
            <style>
                body, html {
                    margin:0; padding:0; height:100%; display:flex; flex-direction:column; overflow:hidden;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-foreground);
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    visibility: hidden;
                    opacity: 0;
                    transition: opacity 0.15s ease-in-out;
                }
                html.vscode-theme-ready, html.vscode-theme-ready body {
                    visibility: visible;
                    opacity: 1;
                }
                .toolbar {
                    display:flex; padding:6px; gap:8px; height: 30px; align-items:center;
                    background-color: var(--vscode-tab-activeBackground);
                    border-bottom:1px solid var(--vscode-editorGroup-border);
                }
                .btn {
                    border:none; padding:0 6px; cursor:pointer; border-radius:4px;
                    height: 24px; font-weight:bold; white-space: nowrap;
                    font-size:inherit; font-family:inherit;
                    background: transparent;
                    color: var(--vscode-icon-foreground, var(--vscode-foreground));                }
                .btn:hover {
                    background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
                    color: var(--vscode-toolbar-activeForeground, var(--vscode-icon-foreground));
                }
                .address-bar {
                    flex-grow:1; padding:4px 8px; border-radius:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
                    font-size:inherit; font-family:inherit;
                    border:1px solid var(--vscode-input-border);
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-disabledForeground);
                }
                .frame-container { flex-grow:1; position:relative; }
                iframe { width:100%; height:100%; border:none; background:white; position:absolute; top:0; left:0; }
            </style>
        </head>
        <body>
            <div class="toolbar">
                <button class="btn" id="back-btn">◀</button>
                <button class="btn" id="fwd-btn">▶</button>
                <div class="address-bar" id="addr-bar">${initialUrl}</div>
            </div>

            <div class="frame-container" style="flex-grow: 1; position: relative; overflow: hidden;" onscroll="this.scrollTop = 0; this.scrollLeft = 0;">
                <iframe id="browser-frame" src="${initialProxiedUrl}"></iframe>
            </div>

            <script>
                const iframe = document.getElementById('browser-frame');
                const addrBar = document.getElementById('addr-bar');

                document.getElementById('back-btn').addEventListener('click', () => {
                    if (iframe && iframe.contentWindow) { iframe.contentWindow.history.back(); }
                });

                document.getElementById('fwd-btn').addEventListener('click', () => {
                    if (iframe && iframe.contentWindow) { iframe.contentWindow.history.forward(); }
                });

                function handleUrlChange() {
                    console.log("got url change");
                    try {
                        if (!iframe || !iframe.contentWindow) return;

                        const currentProxiedUrl = iframe.contentWindow.location.href;
                        console.log("Proxy url: ", currentProxiedUrl);
                        const proxyPrefix = window.location.origin + '/';

                        if (currentProxiedUrl.startsWith(proxyPrefix)) {
                            const rawPath = currentProxiedUrl.substring(proxyPrefix.length);
                            const match = rawPath.match(/^(https?)\\/(.*)/);
                            if (match) {
                                const realUrl = match[1] + '://' + match[2];

                                // 1. Update the local toolbar address bar
                                addrBar.textContent = realUrl;

                                console.log("Reporting " + realUrl + " to wrapper");
                                // 2. Report upward to the top-level VS Code state manager
                                window.parent.postMessage({
                                    command: 'updateBrowserState',
                                    url: realUrl
                                }, '*');
                            }
                        }
                    } catch (e) {
                        console.debug("Cross-origin or state tracking interruption:", e);
                    }
                }

                iframe.addEventListener('load', () => {
                    handleUrlChange();

                    const iframeWin = iframe.contentWindow;
                    if (iframeWin) {
                        // Catches standard back/forward navigation or manual browser-level jumps
                        iframeWin.addEventListener('popstate', handleUrlChange);

                        // Catches inside-page anchor jumps (e.g., index.html#heading1)
                        iframeWin.addEventListener('hashchange', handleUrlChange);

                        const originalPushState = iframeWin.history.pushState;
                        iframeWin.history.pushState = function(...args) {
                            const result = originalPushState.apply(this, args);
                            handleUrlChange();
                            return result;
                        };

                        const originalReplaceState = iframeWin.history.replaceState;
                        iframeWin.history.replaceState = function(...args) {
                            const result = originalReplaceState.apply(this, args);
                            handleUrlChange();
                            return result;
                        };
                    }
                });
                iframe.contentWindow.addEventListener('popstate', () => {
                    setTimeout(() => {
                        try {
                            if (!iframe || !iframe.contentWindow) return;

                            const hash = iframe.contentWindow.location.hash;
                            if (hash) {
                                const element = iframe.contentWindow.document.getElementById(hash.substring(1));
                                if (element) {
                                    element.scrollIntoView({ behavior: 'auto', block: 'start' });
                                }
                            }
                        } catch (err) {
                            console.debug("Manual scroll restoration skipped:", err);
                        }
                    }, 50);
                });
                window.addEventListener('message', event => {
                    const message = event.data;
                    if (!message) return;
                    if (event.data && event.data.type === 'vscode-css-payload') {
                        // Find or create a global style override tag
                        let styleTag = document.getElementById('vscode-theme-overrides');
                        if (!styleTag) {
                            styleTag = document.createElement('style');
                            styleTag.id = 'vscode-theme-overrides';
                            document.head.appendChild(styleTag);
                        }

                        // Inject the raw CSS variable text directly
                        styleTag.textContent = event.data.cssString;
                        document.documentElement.classList.add('vscode-theme-ready');
                    }
                    console.log("Inner got message: ", message.command);
                    if (message.command === 'innerNavigate') {

                        const targetUri = new URL(message.url);
                        const cleanProtocol = targetUri.protocol.replace(':', '');
                        const pathRoute = cleanProtocol + "/" + targetUri.host + targetUri.pathname + targetUri.search + targetUri.hash;
                        const proxiedUrl = "http://127.0.0.1:" + window.location.port + "/" + pathRoute;

                        console.log("Setting iframe.src = ", proxiedUrl);
                        iframe.src = proxiedUrl;
                        addrBar.textContent = message.url;
                        return;
                    }
                    if (message.command === 'Bubble') {
                        window.parent.postMessage(event.data, '*');
                    }
                });
            </script>
        </body>
        </html>
    `;
}

export class HTMLProxyInjector extends Transform {
  private scriptBlock: string;
  private injected = false;
  private tailBuffer = "";

  constructor(scriptToInject: string) {
    super();
    this.scriptBlock = scriptToInject;
  }

  override async _transform(
    chunk: Uint8Array | string,
    encoding: string,
    callback: TransformCallback
  ): Promise<void> {
    try {
      // 1. If we already injected the script, quickly pass data through
      if (this.injected) {
        this.push(chunk);
        return callback();
      }

      // Convert chunk safely to text string
      const chunkText =
        chunk instanceof Uint8Array
          ? new TextDecoder().decode(chunk)
          : Buffer.from(chunk, (encoding as BufferEncoding) || "utf8").toString(
              "utf8"
            );

      // Combine historical unparsed tail data with the newly arrived text
      const currentText = this.tailBuffer + chunkText;

      // 2. Protect Tag Boundaries:
      // If a chunk splits right inside a tag string (e.g., "<he"),
      // slice that partial chunk off and save it for the next evaluation loop.
      const lastOpen = currentText.lastIndexOf("<");
      const lastClose = currentText.lastIndexOf(">");

      let processableText = currentText;
      let leftoverText = "";

      if (lastOpen > lastClose) {
        processableText = currentText.slice(0, lastOpen);
        leftoverText = currentText.slice(lastOpen);
      }

      // 3. Evaluate Priorities Case-Insensitively
      const headMatch = processableText.match(/<head[^>]*>/i);
      const bodyMatch = processableText.match(/<body[^>]*>/i);

      // Choose head first, fallback to body if head is absent in this chunk window
      const match = headMatch || bodyMatch;

      if (match) {
        const insertIndex = (match.index ?? 0) + match[0].length;

        // Piece together the output text
        const modifiedText =
          processableText.slice(0, insertIndex) +
          this.scriptBlock +
          processableText.slice(insertIndex);

        this.push(Buffer.from(modifiedText, "utf8"));
        this.injected = true;

        // Immediately push out the leftover trailing text untouched
        if (leftoverText.length > 0) {
          this.push(Buffer.from(leftoverText, "utf8"));
        }
        this.tailBuffer = "";
      } else {
        // No structural insertion point found yet. Send safe text, store the leftover tail.
        this.push(Buffer.from(processableText, "utf8"));
        this.tailBuffer = leftoverText;
      }

      callback();
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      callback(err);
    }
  }

  override async _flush(callback: TransformCallback): Promise<void> {
    try {
      // If the stream ended and we still haven't found <head> or <body>,
      // append the script block to whatever trailing layout text remains.
      if (!this.injected) {
        const finalText = this.tailBuffer + this.scriptBlock;
        this.push(Buffer.from(finalText, "utf8"));
        this.injected = true;
      } else if (this.tailBuffer.length > 0) {
        this.push(Buffer.from(this.tailBuffer, "utf8"));
      }
      callback();
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      callback(err);
    }
  }
}

const interceptorScript = `
    <script>
    window.addEventListener('click', function(e) {
        const anchor = e.target.closest('a');
        if (!anchor || !anchor.href) return;

        const baseElement = document.querySelector('base[target]');
        const baseTarget = baseElement?.getAttribute('target');

        // 3. Determine the actual runtime target window for this click
        // If the anchor has an explicit target, it uses that. Otherwise, it falls back to <base target>.
        const activeTarget = anchor.getAttribute('target') || baseTarget;

        // 4. Intercept if it targets the top frame
        if (activeTarget === '_top' || activeTarget === "_parent") {
            e.preventDefault();

            console.log("Bubbling url: ", anchor.href + " " + activeTarget);
            window.parent.postMessage({
                command: 'Bubble',
                target: activeTarget,
                url: anchor.href
            }, '*');
            return;
        }

        const href = anchor.getAttribute("href");
        if (/^https?:/.test(href)) {
            e.preventDefault();
            console.log("Bubbling external: ", href);
            window.parent.postMessage({
                command: 'Bubble',
                url: href
            }, '*');
        }
    }, true);
    window.addEventListener('keydown', (event) => {
        // 1. Skip standard typing keys if an input/textarea is currently focused
        const activeEl = document.activeElement;
        const isTyping = activeEl && (
            activeEl.tagName === 'INPUT' ||
            activeEl.tagName === 'TEXTAREA' ||
            activeEl.isContentEditable
        );

        // If they are typing normally, don't pass ordinary letters/numbers to VS Code
        if (isTyping && !event.ctrlKey && !event.metaKey && !event.altKey) {
            return;
        }

        // 2. Clone the event properties
        const eventData = {
            key: event.key,
            code: event.code,
            keyCode: event.keyCode,
            which: event.which,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            altKey: event.altKey,
            shiftKey: event.shiftKey,
        };

        // 3. Post a message to your webview's structural outer container
        // VS Code's inner wrapper listens to this to process global hotkeys
        window.parent.postMessage({
            command: "Bubble",
            key: eventData
        }, '*');
    });

    window.addEventListener('message', (event) => {
        if (event.data && event.data.command === 'Bubble') {
            if (event.data.target === "_parent") {
                console.log("Handling _parent url: ", event.data.url);
                window.location = event.data.url;
                return;
            }
            window.parent.postMessage(event.data, '*');
        }
    });
</script>`;
