import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { HARNESSES, HARNESS_KEYS, type HarnessKey } from './harnesses.js';

describe('HARNESSES preset table', () => {
  it('exposes exactly three keys: claude-code, codex, gemini-cli', () => {
    expect([...HARNESS_KEYS].sort()).toEqual(['claude-code', 'codex', 'gemini-cli']);
    expect(Object.keys(HARNESSES).sort()).toEqual(['claude-code', 'codex', 'gemini-cli']);
  });

  it('every preset has display, defaultPath, toolPrefix', () => {
    for (const key of HARNESS_KEYS) {
      const p = HARNESSES[key];
      expect(p.key).toBe(key);
      expect(typeof p.display).toBe('string');
      expect(p.display.length).toBeGreaterThan(0);
      expect(typeof p.defaultPath).toBe('string');
      expect(p.defaultPath.startsWith(homedir())).toBe(true);
      expect(p.toolPrefix).toBe('mcp__loom__');
    }
  });

  it('default paths match the documented conventions', () => {
    expect(HARNESSES['claude-code'].defaultPath).toBe(join(homedir(), '.claude', 'CLAUDE.md'));
    expect(HARNESSES['codex'].defaultPath).toBe(join(homedir(), '.codex', 'AGENTS.md'));
    expect(HARNESSES['gemini-cli'].defaultPath).toBe(join(homedir(), '.gemini', 'GEMINI.md'));
  });

  it('HarnessKey type narrows to the three string literals', () => {
    const k: HarnessKey = 'claude-code';
    expect(HARNESSES[k]).toBeDefined();
  });
});
