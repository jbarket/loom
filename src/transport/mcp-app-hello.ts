/**
 * MCP-App render probe (env-gated: LOOM_MCP_APP_HELLO).
 *
 * A "hello world" for the MCP Apps extension (io.modelcontextprotocol/ui),
 * built the RIGHT way — on the official @modelcontextprotocol/ext-apps SDK, not
 * a hand-rolled handshake:
 *   - server side: registerAppResource / registerAppTool set the ui:// resource,
 *     the text/html;profile=mcp-app mimeType, and BOTH the nested ui.resourceUri
 *     and the flat "ui/resourceUri" _meta keys the host expects.
 *   - widget side: the App class (bundled into dist/widgets/hello.html by
 *     scripts/build-widgets.mjs) performs the full ui/initialize -> initialized
 *     handshake, autoResize, tool-result delivery, and callServerTool.
 *
 * Not specced, not in the permanent tool surface — a throwaway validation +
 * the reference for loom's real widgets.
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

const UI_URI = 'ui://loom/hello';

/** Register the hello ui:// resource + the loom_hello tool. Call only when probing. */
export function registerHelloApp(server: McpServer, version: string): void {
  // The widget bundle is produced by `npm run build` (scripts/build-widgets.mjs).
  const html = readFileSync(join(resolveRepoRoot(), 'dist', 'widgets', 'hello.html'), 'utf-8');

  registerAppResource(
    server,
    'loom-hello-ui',
    UI_URI,
    { description: 'MCP-App render probe (hello world)' },
    async (uri: URL) => ({
      contents: [{ uri: uri.href, mimeType: RESOURCE_MIME_TYPE, text: html }],
    }),
  );

  registerAppTool(
    server,
    'loom_hello',
    {
      description:
        'MCP-App render probe — returns an interactive hello widget. Invoke to test ui:// rendering.',
      inputSchema: {},
      _meta: { ui: { resourceUri: UI_URI, visibility: ['model', 'app'] } },
    },
    async () => ({
      content: [{ type: 'text' as const, text: 'loom MCP-App hello — see the rendered widget.' }],
      structuredContent: { message: 'loom MCP-App is live (ext-apps SDK)', version, at: new Date().toISOString() },
    }),
  );
}
