# FAQ & Troubleshooting

Common failure modes and their fixes.

---

## `mcp__loom__*` tools don't appear in my harness

**Symptoms:** The agent can't call `mcp__loom__identity` or any other loom tool. The session start instruction says to call the tool but nothing happens.

**Diagnose:**

1. Run `loom doctor` to check whether the MCP server is registered and reachable:
   ```
   npx github:jbarket/loom doctor
   ```
2. Check that your harness's MCP config actually points at loom. Each harness stores its config in a different place:
   - **Claude Code** — `~/.claude.json` or `.mcp.json` in your project root
   - **Codex** — `~/.codex/config.toml`
   - **Gemini CLI** — `~/.gemini/settings.json`
   - **OpenCode** — `~/.config/opencode/config.json`
3. Verify the entry looks roughly like:
   ```json
   {
     "mcpServers": {
       "loom": {
         "command": "npx",
         "args": ["github:jbarket/loom", "serve"],
         "env": { "LOOM_CONTEXT_DIR": "/path/to/your/agent" }
       }
     }
   }
   ```
4. **Restart the harness** after editing the MCP config. Most harnesses only read config at startup.

---

## `loom wake` fails

**Symptoms:** Running `loom wake` or `npx github:jbarket/loom wake` produces an error.

**Possible causes:**

- **Context dir doesn't exist** — if you haven't run `loom bootstrap` yet, the directory is empty or missing. Fix: `npx github:jbarket/loom bootstrap --context-dir ~/.config/loom/<name>`.
- **Corrupt `memories.db`** — if the SQLite file is truncated or locked, wake will fail on the memory query. Fix: delete `memories.db` and let it be recreated on next run (memory is lost; identity files are safe).
  ```bash
  rm ~/.config/loom/<name>/memories.db
  ```
- **Stack-version mismatch** — if you updated loom and the context dir has an older `LOOM_STACK_VERSION` stamp, wake may refuse. Fix: run `loom doctor` — it will report the mismatch and the action needed.

---

## Fastembed download hangs or fails

**Symptoms:** The first run after install stalls for minutes, or prints an error about a model download.

**What's happening:** loom uses `fastembed` with the BGE-small-en-v1.5 model (~33 MB ONNX). The first time any memory operation runs, it downloads the model to `~/.cache/loom/fastembed/`.

**Fixes:**

- Check your internet connection. The download comes from HuggingFace.
- If you're behind a proxy, set `HTTPS_PROXY` / `ALL_PROXY` before running.
- If the download succeeded partially and the file is corrupt, clear the cache and retry:
  ```bash
  rm -rf ~/.cache/loom/fastembed/
  ```
- The model is only downloaded once. Subsequent runs are instant.

---

## "I changed my mind — how do I reset this agent?"

Delete the context directory:

```bash
rm -rf ~/.config/loom/<name>/
```

Then run through setup again from the start (`loom bootstrap` or re-run the setup skill). This is the nuclear option — it deletes all memory, identity files, and procedures. There is no undo.

If you just want to clear memories while keeping identity files:
```bash
rm ~/.config/loom/<name>/memories.db
```

---

## "I want two agents"

Bootstrap a second agent in a separate context directory:

```bash
npx github:jbarket/loom bootstrap --context-dir ~/.config/loom/<second-name>
```

Then wire the second agent's MCP config to use `LOOM_CONTEXT_DIR=~/.config/loom/<second-name>`. Each context dir is completely independent — they don't share memory, identity, or procedures.

If you're running two agents in the same harness session simultaneously, each agent needs a distinct `LOOM_CONTEXT_DIR` in its MCP server entry (give the entries distinct names too, e.g. `loom-art` and `loom-research`).

---

## "Can I move my agent to another machine?"

Yes — the entire context directory (`~/.config/loom/<name>/`) is self-contained. Copy it with `rsync` or `scp`. `memories.db` is a standard SQLite file.

For a more durable home, keep the context directory in a git repository and push it. The identity files (`IDENTITY.md`, `preferences.md`, `self-model.md`, `procedures/*.md`) are plain markdown and diff cleanly. The `memories.db` binary doesn't diff well, but it can be tracked if you use `git-lfs` or a `.gitattributes` entry. Git-backed agent directories are the planned approach for cross-machine roaming in a future release.

---

## Memory queries return nothing

**Symptoms:** `loom recall "something I told it"` returns empty results even though you're sure you saved the memory.

**Diagnose:**

1. **Confirm the memory exists:**
   ```bash
   npx github:jbarket/loom memory list --context-dir ~/.config/loom/<name>
   ```
   If it's not in the list, it was never saved (or was saved with a different `--context-dir`).

2. **Embedding model mismatch** — if `memories.db` was written with a different model than the current `LOOM_FASTEMBED_MODEL`, the embeddings are incompatible. Fix: clear `memories.db` and re-save.

3. **Empty store** — no memories have been written yet. The store is created lazily on first write.

4. **Query too narrow** — vector similarity is semantic, not exact-string. Try a broader or differently-phrased query.

5. **Category filter** — if you're passing `--category`, make sure the saved memory uses the same category.

---

## Identity looks stale or generic

**Symptoms:** The agent loads with a placeholder identity ("You are an AI assistant…") instead of the custom one you set up.

**Possible causes:**

- **Missing manifests** — the harness dotfile (e.g. `~/.claude/CLAUDE.md`) doesn't have the loom injection block. Fix: run `loom inject --harness <key> --context-dir ~/.config/loom/<name>` and restart the harness.
- **Wrong context dir** — the MCP server or shell command is pointing at a different (or default) context dir. Check `LOOM_CONTEXT_DIR` in your MCP config.
- **Procedures not adopted** — if the loom setup skill completed but procedures weren't adopted, `identity` will report them as missing and the payload will be thin. Fix:
  ```bash
  npx github:jbarket/loom procedures adopt --all --context-dir ~/.config/loom/<name>
  ```
- **`IDENTITY.md` still contains the bootstrap placeholder** — the `bootstrap` command writes a template that the agent is meant to fill in during the interview. If the interview was skipped or stalled, the file still has placeholder text. Fix: re-run `loom bootstrap --force --context-dir ~/.config/loom/<name>` and answer the interview fully.

---

## Still stuck?

Run `loom doctor` — it checks the context directory, MCP registration, stack version compatibility, and memory store health, and prints a report. Include its output when filing a bug.

```bash
npx github:jbarket/loom doctor --context-dir ~/.config/loom/<name>
```
