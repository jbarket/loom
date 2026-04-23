# Loom Observability

## `--verbose` flag

Pass `--verbose` to any CLI command to print per-section stats and warnings to stderr.

```
loom wake --verbose
```

Example output:
```
[loom:verbose] context-dir: /home/art/.config/loom/art
[loom:verbose] ─────────────────────────────────────────
[loom:verbose] creed                    3,241 bytes  4ms
[loom:verbose] preferences              8,012 bytes  1ms
[loom:verbose] self-model               4,321 bytes  1ms
[loom:verbose] procedures               9,870 bytes  3ms
[loom:verbose] harness:claude-code      missing
[loom:verbose] model:claude-sonnet      missing
[loom:verbose] ─────────────────────────────────────────
[loom:verbose] total  25,444 bytes  12ms
[loom:verbose] warnings: 2
[loom:verbose]   [LOOM_E_MISSING_MANIFEST] Harness manifest for "claude-code" not found. Run `harness_init("claude-code")` to scaffold one.
[loom:verbose]   [LOOM_E_EMBED_NOT_CACHED] FastEmbed model "fast-bge-small-en-v1.5" not yet downloaded. First recall/remember will trigger a ~30 MB download.
```

## `LOOM_LOG=debug`

Set `LOOM_LOG=debug` to enable structured debug tracing for all operations. Lines are written to stderr.

```
LOOM_LOG=debug loom wake
LOOM_LOG=debug loom recall "loom architecture"
```

Example output:
```
[loom:debug] 2026-04-22T19:00:00.000Z [identity] loading section: creed
[loom:debug] 2026-04-22T19:00:00.001Z [identity] section done: creed {"ms":1}
[loom:debug] 2026-04-22T19:00:00.010Z [fastembed] initializing model {"model":"fast-bge-small-en-v1.5","cacheDir":"..."}
[loom:debug] 2026-04-22T19:00:02.500Z [fastembed] model ready {"model":"fast-bge-small-en-v1.5","ms":2490}
[loom:debug] 2026-04-22T19:00:02.510Z [fastembed] embedQuery {"ms":8,"chars":19}
[loom:debug] 2026-04-22T19:00:02.520Z [sqlite-vec] recall done {"results":10,"ms":15}
```

Debug mode enables tracing across all phases: identity loading, backend init, embedding calls, and vector search.

## Warnings in `identity()` response

The `identity()` MCP tool and `loom wake` both surface diagnostics in a `# ⚠ Diagnostics` section appended to the identity output when warnings are present. The agent can read these warnings and act on them (e.g. call `harness_init` if a manifest is missing).

```markdown
# ⚠ Diagnostics

- **LOOM_E_MISSING_MANIFEST** — Harness manifest for "claude-code" not found. Run `harness_init("claude-code")` to scaffold one.
- **LOOM_E_EMBED_NOT_CACHED** — FastEmbed model "fast-bge-small-en-v1.5" not yet downloaded. First recall/remember will trigger a ~30 MB download.
```

## Error codes

All structured errors begin with `LOOM_E_`. They appear in thrown error messages (`[LOOM_E_STACK_VERSION] Stack at ...`), the `# ⚠ Diagnostics` identity section, and debug log `data` fields.

| Code | Where thrown | Meaning | Action |
|------|-------------|---------|--------|
| `LOOM_E_STACK_VERSION` | `config.ts` | Stack on disk is a newer version than this loom binary understands | `npm install -g loomai@latest` to upgrade loom |
| `LOOM_E_EMBED_DOWNLOAD` | `fastembed.ts` | FastEmbed model download failed (network or disk error) | Check internet connection; verify `LOOM_FASTEMBED_CACHE_DIR` is writable |
| `LOOM_E_EMBED_INIT` | `fastembed.ts` | FastEmbed model failed to initialize (bad ONNX, wrong model id) | Verify `LOOM_FASTEMBED_MODEL` is a known model; delete cache and retry |
| `LOOM_E_MEMORIES_CORRUPT` | `sqlite-vec.ts` | `memories.db` could not be opened or schema init failed | Check file permissions; if corrupt, move the file aside and re-run |
| `LOOM_E_MISSING_MANIFEST` | `identity.ts` | Harness or model manifest file not found in context dir | Run `harness_init` or `loom harness init <name>` to scaffold one |
| `LOOM_E_CONTEXT_DIR` | reserved | Context directory is missing or inaccessible | Create the directory or fix `LOOM_CONTEXT_DIR` |
| `LOOM_E_EMBED_NOT_CACHED` | `identity.ts` (warning only) | FastEmbed ONNX model not yet in cache | Not an error — first recall/remember will download it automatically |

## Environment variables

| Variable | Default | Effect |
|----------|---------|--------|
| `LOOM_LOG` | _(unset)_ | Set to `debug` to enable debug tracing |
| `LOOM_FASTEMBED_MODEL` | `fast-bge-small-en-v1.5` | Embedding model identifier |
| `LOOM_FASTEMBED_CACHE_DIR` | `~/.cache/loom/fastembed` | ONNX model cache directory |
| `LOOM_SQLITE_DB_PATH` | `<contextDir>/memories.db` | Override the memories database path |
| `LOOM_CONTEXT_DIR` | `~/.config/loom/default` | Agent context directory |
