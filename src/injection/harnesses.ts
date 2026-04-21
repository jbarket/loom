/**
 * Harness preset table for `loom inject`. Each entry names a target
 * harness, its canonical default path, and the MCP tool prefix to emit
 * in the injected instruction block. Tool prefix is `mcp__loom__`
 * (double underscore) for all three — the single-underscore variant is
 * a Hermes/OpenClaw/NemoClaw quirk, not in scope for filesystem
 * injection.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';

export type HarnessKey = 'claude-code' | 'codex' | 'gemini-cli';

export interface HarnessPreset {
  readonly key: HarnessKey;
  readonly display: string;
  readonly defaultPath: string;
  readonly toolPrefix: string;
}

export const HARNESS_KEYS: readonly HarnessKey[] = [
  'claude-code',
  'codex',
  'gemini-cli',
];

export const HARNESSES: Readonly<Record<HarnessKey, HarnessPreset>> = {
  'claude-code': {
    key: 'claude-code',
    display: 'Claude Code',
    defaultPath: join(homedir(), '.claude', 'CLAUDE.md'),
    toolPrefix: 'mcp__loom__',
  },
  'codex': {
    key: 'codex',
    display: 'Codex',
    defaultPath: join(homedir(), '.codex', 'AGENTS.md'),
    toolPrefix: 'mcp__loom__',
  },
  'gemini-cli': {
    key: 'gemini-cli',
    display: 'Gemini CLI',
    defaultPath: join(homedir(), '.gemini', 'GEMINI.md'),
    toolPrefix: 'mcp__loom__',
  },
};

export function isHarnessKey(s: string): s is HarnessKey {
  return (HARNESS_KEYS as readonly string[]).includes(s);
}
