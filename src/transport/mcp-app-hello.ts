/**
 * MCP-App render probe (env-gated: LOOM_MCP_APP_HELLO).
 *
 * A "hello world" for the MCP Apps extension (io.modelcontextprotocol/ui,
 * spec 2026-01-26). Validates the unproven assumption that a ui:// resource
 * renders in Claude Desktop over the mesh daemon + mcp-remote, before we build
 * felag's board or loom's real widgets on it.
 *
 * Wiring (per the spec):
 *   - a ui:// resource, mimeType text/html;profile=mcp-app, served via resources/read
 *   - a tool whose _meta.ui.resourceUri points at that resource; invoking the
 *     tool makes the host render the widget and push the tool result to it via a
 *     `ui/notifications/tool-result` message.
 *   - the widget talks back with plain postMessage JSON-RPC (tools/call) — no
 *     client SDK needed in the iframe.
 *
 * The widget is deliberately INSTRUMENTED: it logs every message it receives
 * from the host, so this probe also reveals the real message framing for the
 * widgets we build next. Not specced, not in the permanent tool surface — a
 * throwaway validation, removed once the real widgets land.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const UI_URI = 'ui://loom/hello';
const RESOURCE_MIME = 'text/html;profile=mcp-app';

const HELLO_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  /* Explicit, self-contained colors — nothing relies on inherited/host context. */
  html, body { margin: 0; padding: 0; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; font-size: 14px;
         line-height: 1.5; background: #0f172a; color: #e2e8f0; padding: 16px; min-height: 180px;
         box-sizing: border-box; }
  .card { border: 2px solid #38bdf8; border-radius: 12px; padding: 16px 18px; background: #111c33;
          max-width: 600px; }
  h1 { font-size: 17px; margin: 0 0 4px; color: #7dd3fc; }
  .ok { display: inline-block; background: #16a34a; color: #fff; font-weight: 700;
        padding: 2px 10px; border-radius: 999px; font-size: 12px; margin-bottom: 10px; }
  .sub { color: #94a3b8; margin: 0 0 12px; }
  button { font: inherit; padding: 7px 13px; border-radius: 8px; cursor: pointer;
           border: 1px solid #38bdf8; background: #1e3a5f; color: #e2e8f0; }
  button:hover { background: #25496f; }
  #status { margin: 12px 0 6px; font-weight: 600; color: #fbbf24; }
  #log { font-family: ui-monospace, monospace; font-size: 12px; line-height: 1.45;
         white-space: pre-wrap; word-break: break-word; max-height: 240px; overflow: auto;
         padding: 10px; border-radius: 8px; background: #0b1220; color: #94a3b8; border: 1px solid #1e293b; }
</style>
</head>
<body>
  <div class="card">
    <span class="ok">✅ RENDERED</span>
    <h1>🧵 loom — MCP App hello</h1>
    <p class="sub">If you can read this card, ui:// rendering works in this host.</p>
    <button id="ping">ping loom (callServerTool)</button>
    <p id="status">rendered. waiting for messages from the host…</p>
    <div id="log"></div>
  </div>
<script>
  var logEl = document.getElementById('log');
  var statusEl = document.getElementById('status');
  var n = 0;
  function log(label, obj) {
    n++;
    logEl.textContent = '[' + n + '] ' + label + ': ' + (typeof obj === 'string' ? obj : JSON.stringify(obj)) + '\\n' + logEl.textContent;
  }
  function send(msg) { log('send', msg); window.parent.postMessage(msg, '*'); }

  // Reveal everything the host sends us — this is how we learn the real framing.
  window.addEventListener('message', function (e) {
    var m = e.data;
    log('recv', m);
    // Step 2/3 of the REQUIRED handshake: on the ui/initialize result, send the
    // initialized notification. Without this the host times out and shows
    // "There was a problem displaying content."
    if (m && m.id === 1 && m.result) {
      send({ jsonrpc: '2.0', method: 'ui/notifications/initialized', params: {} });
      statusEl.textContent = '✓ handshake complete (ui/initialize → initialized)';
    }
    if (m && m.method === 'ui/notifications/tool-result') {
      statusEl.textContent = '✓ received the tool result from the host';
    }
    if (m && m.id === 42 && (m.result || m.error)) {
      statusEl.textContent = '✓ callServerTool round-tripped (got a response)';
    }
  });

  // Step 1 of the handshake — REQUIRED, sent on load before the host will talk to us.
  send({ jsonrpc: '2.0', id: 1, method: 'ui/initialize',
         params: { capabilities: {}, clientInfo: { name: 'loom-hello', version: '1.0.0' }, protocolVersion: '2026-01-26' } });

  // UI -> host: plain postMessage JSON-RPC. Calls loom_hello back on the server.
  document.getElementById('ping').addEventListener('click', function () {
    statusEl.textContent = 'pinging loom via tools/call…';
    send({ jsonrpc: '2.0', id: 42, method: 'tools/call', params: { name: 'loom_hello', arguments: {} } });
  });
</script>
</body>
</html>`;

/** Register the hello ui:// resource + the loom_hello tool. Call only when probing. */
export function registerHelloApp(server: McpServer, version: string): void {
  server.registerResource(
    'loom-hello-ui',
    UI_URI,
    { mimeType: RESOURCE_MIME, description: 'MCP-App render probe (hello world)' },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: RESOURCE_MIME, text: HELLO_HTML }],
    }),
  );

  server.registerTool(
    'loom_hello',
    {
      description: 'MCP-App render probe — returns an interactive hello widget. Invoke to test ui:// rendering.',
      inputSchema: {},
      _meta: { ui: { resourceUri: UI_URI, visibility: ['model', 'app'] } },
    },
    async () => ({
      content: [{ type: 'text' as const, text: 'loom MCP-App hello — see the rendered widget.' }],
      structuredContent: { message: 'loom MCP-App is live', version, at: new Date().toISOString() },
    }),
  );
}
