# Security policy

## Reporting a vulnerability

Open a private security advisory at
https://github.com/jbarket/loom/security/advisories/new. Do not open
a public issue for security matters.

Expect an initial response within a week. For coordinated disclosure
timelines, include a proposed timeline in your report.

## Scope

- The loom MCP server and client adapters in this repo.
- The stack schema (`docs/loom-stack-v1.md`).

## Not in scope

- Vulnerabilities in `better-sqlite3`, `sqlite-vec`, or `fastembed`.
  Report those upstream; we'll track the downstream fix.
- Social-engineering attacks that require the user to run arbitrary
  code as the loom process.

## The "no secrets in the stack" invariant

loom refuses to store secrets in the stack. If you find an adapter
that silently accepts secrets, that is a security bug — report it.
