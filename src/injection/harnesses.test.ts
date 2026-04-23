import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { HARNESSES, HARNESS_KEYS, resolveHarnessPath, type HarnessKey } from './harnesses.js';

describe('HARNESSES preset table', () => {
  it('exposes exactly four keys: claude-code, codex, gemini-cli, opencode', () => {
    expect([...HARNESS_KEYS].sort()).toEqual(['claude-code', 'codex', 'gemini-cli', 'opencode']);
    expect(Object.keys(HARNESSES).sort()).toEqual(['claude-code', 'codex', 'gemini-cli', 'opencode']);
  });

  it('every preset has display, defaultPath, toolPrefix', () => {
    for (const key of HARNESS_KEYS) {
      const p = HARNESSES[key];
      expect(p.key).toBe(key);
      expect(typeof p.display).toBe('string');
      expect(p.display.length).toBeGreaterThan(0);
      expect(typeof p.defaultPath).toBe('string');
      expect(p.defaultPath.startsWith(homedir())).toBe(true);
      expect(typeof p.toolPrefix).toBe('string');
    }
  });

  it('claude-code, codex, gemini-cli use mcp__loom__ tool prefix', () => {
    expect(HARNESSES['claude-code'].toolPrefix).toBe('mcp__loom__');
    expect(HARNESSES['codex'].toolPrefix).toBe('mcp__loom__');
    expect(HARNESSES['gemini-cli'].toolPrefix).toBe('mcp__loom__');
  });

  it('opencode uses loom_ tool prefix', () => {
    expect(HARNESSES['opencode'].toolPrefix).toBe('loom_');
  });

  it('default paths match the documented conventions', () => {
    expect(HARNESSES['claude-code'].defaultPath).toBe(join(homedir(), '.claude', 'CLAUDE.md'));
    expect(HARNESSES['codex'].defaultPath).toBe(join(homedir(), '.codex', 'AGENTS.md'));
    expect(HARNESSES['gemini-cli'].defaultPath).toBe(join(homedir(), '.gemini', 'GEMINI.md'));
    expect(HARNESSES['opencode'].defaultPath).toBe(join(homedir(), '.config', 'opencode', 'AGENTS.md'));
  });

  it('HarnessKey type narrows to the four string literals', () => {
    const k: HarnessKey = 'claude-code';
    expect(HARNESSES[k]).toBeDefined();
    const k2: HarnessKey = 'opencode';
    expect(HARNESSES[k2]).toBeDefined();
  });
});

describe('resolveHarnessPath', () => {
  it('returns the frozen defaultPath when home is undefined', () => {
    expect(resolveHarnessPath(HARNESSES['claude-code'])).toBe(HARNESSES['claude-code'].defaultPath);
  });

  it('returns a HOME-relative path when an override is provided', () => {
    const p = resolveHarnessPath(HARNESSES['codex'], '/tmp/fake-home');
    expect(p).toBe('/tmp/fake-home/.codex/AGENTS.md');
  });

  it('covers all four harnesses with override', () => {
    expect(resolveHarnessPath(HARNESSES['claude-code'], '/h')).toBe('/h/.claude/CLAUDE.md');
    expect(resolveHarnessPath(HARNESSES['codex'], '/h')).toBe('/h/.codex/AGENTS.md');
    expect(resolveHarnessPath(HARNESSES['gemini-cli'], '/h')).toBe('/h/.gemini/GEMINI.md');
    expect(resolveHarnessPath(HARNESSES['opencode'], '/h')).toBe('/h/.config/opencode/AGENTS.md');
  });
});
