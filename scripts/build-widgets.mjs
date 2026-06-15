/**
 * Build loom's MCP-App widgets: esbuild-bundle each widget source (TS + the
 * @modelcontextprotocol/ext-apps SDK) into a single inline-script HTML file under
 * dist/widgets/. Runs after tsc in `npm run build`. The widget HTML is served
 * verbatim by the ui:// resource (the SDK bundle rides in the resource, NOT
 * through model context — so its size is fine).
 */
import esbuild from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** A loud, self-contained card shell. `__WIDGET_JS__` is replaced with the bundle. */
function shell(title) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  html, body { margin: 0; padding: 0; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; font-size: 14px;
         line-height: 1.5; background: #0f172a; color: #e2e8f0; padding: 16px; box-sizing: border-box; }
  .card { border: 2px solid #38bdf8; border-radius: 12px; padding: 16px 18px; background: #111c33; max-width: 620px; }
  h1 { font-size: 17px; margin: 0 0 4px; color: #7dd3fc; }
  .ok { display: inline-block; background: #16a34a; color: #fff; font-weight: 700; padding: 2px 10px; border-radius: 999px; font-size: 12px; margin-bottom: 10px; }
  .sub { color: #94a3b8; margin: 0 0 12px; }
  button { font: inherit; padding: 7px 13px; border-radius: 8px; cursor: pointer; border: 1px solid #38bdf8; background: #1e3a5f; color: #e2e8f0; }
  button:hover { background: #25496f; }
  #status { margin: 12px 0 6px; font-weight: 600; color: #fbbf24; }
  #out { font-family: ui-monospace, monospace; font-size: 12px; white-space: pre-wrap; word-break: break-word;
         max-height: 240px; overflow: auto; padding: 10px; border-radius: 8px; background: #0b1220; color: #94a3b8; border: 1px solid #1e293b; margin: 0; }
</style>
</head>
<body>
  <div class="card">
    <span class="ok">✅ RENDERED</span>
    <h1>🧵 ${title}</h1>
    <p class="sub">Built on the official @modelcontextprotocol/ext-apps App SDK.</p>
    <button id="ping">ping loom (callServerTool)</button>
    <p id="status">connecting…</p>
    <pre id="out"></pre>
  </div>
<script>__WIDGET_JS__</script>
</body>
</html>`;
}

async function buildWidget(name, srcRel, title) {
  const result = await esbuild.build({
    entryPoints: [join(root, srcRel)],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    write: false,
  });
  const js = result.outputFiles[0].text;
  // split/join, NOT replace — the minified bundle contains `$` which String.replace mangles.
  const html = shell(title).split('__WIDGET_JS__').join(js);
  const outDir = join(root, 'dist', 'widgets');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${name}.html`), html);
  console.log(`built widget ${name}: ${html.length} bytes`);
}

await buildWidget('hello', 'widgets/hello.widget.ts', 'loom — MCP App hello');
