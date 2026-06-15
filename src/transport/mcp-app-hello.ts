/**
 * MCP-App render probes (env-gated: LOOM_MCP_APP_HELLO), built the RIGHT way on
 * the official @modelcontextprotocol/ext-apps SDK:
 *   - server side: registerAppResource / registerAppTool set the ui:// resource,
 *     the text/html;profile=mcp-app mimeType, and BOTH _meta keys the host needs.
 *   - widget side: the App class (bundled into dist/widgets/<name>.html by
 *     scripts/build-widgets.mjs) does the full handshake, autoResize, etc.
 *
 * Two probes:
 *   - loom_hello: a vanilla App-SDK "hello world" (renders + callServerTool).
 *   - loom_display_modes: a Preact widget exercising inline/fullscreen/pip.
 *
 * Not specced, not in the permanent tool surface — throwaway validation + the
 * reference for loom's real widgets.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from '@modelcontextprotocol/ext-apps/server';
import { resolveRepoRoot } from '../config.js';

interface ProbeApp {
  tool: string;
  uri: string;
  htmlFile: string; // under dist/widgets/
  description: string;
  structured: () => Record<string, unknown>;
}

function registerApp(server: McpServer, app: ProbeApp): void {
  const html = readFileSync(join(resolveRepoRoot(), 'dist', 'widgets', app.htmlFile), 'utf-8');
  registerAppResource(
    server,
    `${app.tool}-ui`,
    app.uri,
    { description: app.description },
    async (uri: URL) => ({
      contents: [{ uri: uri.href, mimeType: RESOURCE_MIME_TYPE, text: html }],
    }),
  );
  registerAppTool(
    server,
    app.tool,
    {
      description: app.description,
      inputSchema: {},
      _meta: { ui: { resourceUri: app.uri, visibility: ['model', 'app'] } },
    },
    async () => ({
      content: [{ type: 'text' as const, text: `${app.tool} — see the rendered widget.` }],
      structuredContent: app.structured(),
    }),
  );
}

/** Register the env-gated MCP-App probes. Call only when probing. */
export function registerHelloApp(server: McpServer, version: string): void {
  registerApp(server, {
    tool: 'loom_hello',
    uri: 'ui://loom/hello',
    htmlFile: 'hello.html',
    description: 'MCP-App render probe — an interactive hello widget (vanilla + App SDK).',
    structured: () => ({ message: 'loom MCP-App is live (ext-apps SDK)', version, at: new Date().toISOString() }),
  });
  registerApp(server, {
    tool: 'loom_display_modes',
    uri: 'ui://loom/display-modes',
    htmlFile: 'display-modes.html',
    description: 'MCP-App display-mode trial (Preact) — exercises inline / fullscreen / pip.',
    structured: () => ({ message: 'pick a display mode in the widget', version }),
  });
}
