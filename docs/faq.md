# loom — FAQ & troubleshooting

Common failure modes, with fixes. Run `loom doctor` first if you're not sure
where to start — it probes node version, stack compatibility, and the list of
agents on disk without writing anything.

```bash
npx github:jbarket/loom doctor
```

---

## `mcp__loom__*` tools don't appear in my harness

The MCP server isn't registered, isn't running, or the harness hasn't been
restarted since registration.

**Check in order:**

1. **Restart the harness.** MCP servers are registered at startup. If you added
   or edited `.mcp.json` (or the equivalent for your harness) without restarting,
   the new server won't be there.

2. **Verify the MCP entry exists.** For Claude Code, check
   `~/.claude/settings.json` or your project's `.mcp.json`. The entry should
   look something like:

   ```json
   {
     "mcpServers": {
       "loom": {
         "command": "npx",
         "args": ["github:jbarket/loom"],
         "env": {
           "LOOM_CONTEXT_DIR": "/home/you/.config/loom/art"
         }
       }
     }
   }
   ```

   If it's missing, re-run the setup skill inside the harness (`/loom-setup` in
   Claude Code) or wire it manually.

3. **Run `loom doctor`** to confirm the context dir and stack look sane:

   ```bash
   npx github:jbarket/loom doctor --context-dir ~/.config/loom/<name>
   ```

   Seeing `stack: compatible` and the right agent under `agents:` means the
   stack itself is fine; the problem is the harness config.

4. **Check for a startup error.** In Claude Code, MCP server errors surface in
   the MCP panel. If loom fails to start (missing `LOOM_CONTEXT_DIR`, for
   example) you'll see it there. The most common cause is `LOOM_CONTEXT_DIR`
   not set — ensure the `env` block in your MCP config includes it.

---

## `loom wake` fails

`loom wake` (and `mcp__loom__identity`) fail for a few distinct reasons. The
error message usually tells you which one.

### Context directory missing or empty

```
Error: ENOENT: no such file or directory …/IDENTITY.md
```

The directory exists but hasn't been bootstrapped, or `LOOM_CONTEXT_DIR` is
pointing somewhere wrong. Bootstrap first:

```bash
npx github:jbarket/loom bootstrap --context-dir ~/.config/loom/<name>
```

Or re-run the setup skill inside the harness.

### Stack version mismatch

```
Stack at ~/.config/loom/<name> is version 2; this loom build understands up to v1. Upgrade loom.
```

Your agent's `LOOM_STACK_VERSION` file is ahead of what the installed loom
understands. Update loom:

```bash
# If pinned to a tag, bump the tag. If using `github:jbarket/loom`, npx always
# fetches the latest — clear the npx cache if you're stuck on an old version:
npx clear-npx-cache
npx github:jbarket/loom wake --context-dir ~/.config/loom/<name>
```

### Corrupt or schema-mismatch `memories.db`

If the DB was written by a different schema version, sqlite-vec may refuse to
open it. You'll see a sqlite error on any tool that touches memory.

To recover: back up the file, then delete it. A fresh `memories.db` will be
created on next write. Memories are lost but identity files (`IDENTITY.md`,
`preferences.md`, `self-model.md`) survive intact.

```bash
cp ~/.config/loom/<name>/memories.db ~/.config/loom/<name>/memories.db.bak
rm ~/.config/loom/<name>/memories.db
```

---

## Fastembed download hangs or fails

On first use, loom downloads the BGE-small-en-v1.5 ONNX model (~33MB) to
`~/.cache/loom/fastembed/`. This happens transparently during the first
`remember` or `recall` call.

**If it hangs:**

- Check your network. The model is fetched from Hugging Face CDN. A slow or
  restricted connection will stall the download silently.
- Kill the hung process (`Ctrl-C`) and retry. The download is resumable on
  subsequent attempts.
- If you're behind a proxy, set `HTTPS_PROXY` / `NO_PROXY` before invoking
  loom.

**If it fails with a permission error:**

```bash
ls -la ~/.cache/loom/
# If owned by root or another user, fix it:
sudo chown -R $(whoami) ~/.cache/loom/
```

**To verify the model is cached:**

```bash
ls ~/.cache/loom/fastembed/
# Should contain a directory like fast-bge-small-en-v1.5/
```

Once cached, loom never re-downloads. If you need to force a re-download,
delete the cache directory:

```bash
rm -rf ~/.cache/loom/fastembed/
```

---

## "I changed my mind — how do I reset this agent?"

Delete its context directory. That's the entire agent state:

```bash
rm -rf ~/.config/loom/<name>
```

Then bootstrap fresh:

```bash
npx github:jbarket/loom bootstrap --context-dir ~/.config/loom/<name>
```

Or run the setup skill inside the harness again — it will detect the missing
stack and start over from the interview.

> **Note:** This is irreversible. If you want to preserve the agent's memories
> before resetting, back up the directory first:
> `cp -r ~/.config/loom/<name> ~/.config/loom/<name>.bak`

---

## "I want two agents"

Bootstrap a second one at a different context directory:

```bash
npx github:jbarket/loom bootstrap --context-dir ~/.config/loom/<second-name>
```

Then add a second MCP server entry to your harness config pointing at that
directory. Each agent runs as a separate MCP server process with its own
identity and memory store. Name the server keys differently so the tool
prefixes don't collide:

```json
{
  "mcpServers": {
    "art": {
      "command": "npx",
      "args": ["github:jbarket/loom"],
      "env": { "LOOM_CONTEXT_DIR": "/home/you/.config/loom/art" }
    },
    "sage": {
      "command": "npx",
      "args": ["github:jbarket/loom"],
      "env": { "LOOM_CONTEXT_DIR": "/home/you/.config/loom/sage" }
    }
  }
}
```

---

## "Can I move my agent to another machine?"

Yes. The entire agent is the context directory — copy it to the new machine:

```bash
rsync -av ~/.config/loom/<name>/ new-host:~/.config/loom/<name>/
```

Then install loom on the new machine and add the MCP server entry to that
harness's config. The agent's identity, memories, and procedures all travel
with the directory.

For a more durable setup, initialize a git repo inside the context directory
and push it to a remote. This gives you versioned backups, easy cross-machine
sync, and a recoverable history if `memories.db` gets corrupted. A
`.gitignore` that excludes `memories.db` (binary, frequently written) and
tracks only the markdown files is a reasonable split — memories are lossy by
nature, identity is precious.

```bash
cd ~/.config/loom/<name>
git init
echo "memories.db" >> .gitignore
git add IDENTITY.md preferences.md self-model.md pursuits.md procedures/ .gitignore
git commit -m "initial agent stack"
git remote add origin <your-remote>
git push -u origin main
```

---

## Memory queries return nothing

`recall` uses vector similarity — it's sensitive to how you phrase the query
and what the memory store contains.

**Things to check:**

1. **Is there anything in the store?**

   ```bash
   npx github:jbarket/loom memory list --context-dir ~/.config/loom/<name>
   ```

   If this returns nothing, you haven't written any memories yet. Call
   `remember` (or `mcp__loom__remember`) to store something, then retry.

2. **Is the query too narrow?** Vector search finds semantic neighbors, not
   keyword matches. Try broader or differently-worded queries:

   ```bash
   npx github:jbarket/loom recall "Jonathan" --context-dir ~/.config/loom/<name>
   # vs.
   npx github:jbarket/loom recall "user preferences coding style" --context-dir ~/.config/loom/<name>
   ```

3. **Embedding model mismatch.** If `LOOM_FASTEMBED_MODEL` was different when
   memories were written vs. when you're querying, the vector dimensions won't
   match and sqlite-vec will error or return empty results. The default model
   is `fast-bge-small-en-v1.5` (384 dimensions). If you changed it, change it
   back, or delete `memories.db` and re-add memories under the new model.

   ```bash
   # Check what model was used when memories were stored by inspecting DB schema:
   sqlite3 ~/.config/loom/<name>/memories.db ".schema memories"
   # Look for the vec_dim value
   ```

4. **Category filter too specific.** If you're filtering by category, try
   removing the filter:

   ```bash
   npx github:jbarket/loom recall "coffee" --category project --context-dir ~/.config/loom/<name>
   # Try without --category
   npx github:jbarket/loom recall "coffee" --context-dir ~/.config/loom/<name>
   ```

---

## Identity looks stale or generic

The `identity` tool assembles output from several files. If the output looks
like defaults ("You are a helpful assistant…") or is missing sections, one or
more source files may be absent or unedited.

**Checklist:**

1. **`IDENTITY.md` is the terminal creed** — did the bootstrap interview
   complete? Open `~/.config/loom/<name>/IDENTITY.md` and confirm it
   contains your agent's actual name and purpose. If it still has placeholder
   text, re-run bootstrap.

2. **`preferences.md` and `self-model.md` may be stubs.** Bootstrap writes
   minimal initial versions. Have the agent fill them in over time, or edit
   them directly.

3. **No harness manifest.** If `identity` reports "manifest missing" for your
   harness, scaffold one:

   ```bash
   npx github:jbarket/loom harness init claude-code --context-dir ~/.config/loom/<name>
   ```

   Then edit `~/.config/loom/<name>/harnesses/claude-code.md` to document
   tool prefixes and delegation patterns for that harness.

4. **Procedures not adopted.** Loom ships six procedural-identity seed
   templates. They aren't adopted automatically — run:

   ```bash
   npx github:jbarket/loom procedures adopt --all --context-dir ~/.config/loom/<name>
   ```

   Adopted procedures appear in the identity payload. Unedited seeds include
   a ⚠ ownership ritual; the agent should customize the Why and How-to-apply
   sections and delete the ritual marker when it takes ownership.

5. **Wrong `LOOM_CONTEXT_DIR`.** If the tools are loading the wrong context
   directory, they'll produce identity for the wrong agent (or a default
   stub). Confirm which directory is active:

   ```bash
   npx github:jbarket/loom doctor
   # Check "context dir:" in the output
   ```

---

## Getting more help

- `npx github:jbarket/loom --help` — list all subcommands
- `npx github:jbarket/loom <cmd> --help` — per-command usage
- `npx github:jbarket/loom doctor` — environment probe (safe, read-only)
- [GitHub Issues](https://github.com/jbarket/loom/issues) — bug reports and
  feature requests
- [`docs/loom-stack-v1.md`](loom-stack-v1.md) — engineering contract for the
  stack format
