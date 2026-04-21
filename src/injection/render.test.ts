import { describe, it, expect } from 'vitest';
import { HARNESSES } from './harnesses.js';
import { renderBlock } from './render.js';

describe('renderBlock', () => {
  const contextDir = '/home/agent/.config/loom/art';

  it('emits both start and end markers', () => {
    const block = renderBlock(HARNESSES['claude-code'], contextDir);
    expect(block).toMatch(/<!-- loom:start v1 harness=claude-code -->/);
    expect(block).toMatch(/<!-- loom:end -->/);
  });

  it('start marker carries harness key, end marker is bare', () => {
    for (const harness of Object.values(HARNESSES)) {
      const block = renderBlock(harness, contextDir);
      expect(block).toContain(`<!-- loom:start v1 harness=${harness.key} -->`);
      expect(block).toContain('<!-- loom:end -->');
    }
  });

  it('interpolates the tool prefix into the MCP section', () => {
    const block = renderBlock(HARNESSES['claude-code'], contextDir);
    expect(block).toContain('`mcp__loom__identity`');
    expect(block).toContain('`mcp__loom__recall`');
    expect(block).toContain('`mcp__loom__remember`');
  });

  it('interpolates the literal context dir', () => {
    const block = renderBlock(HARNESSES['gemini-cli'], contextDir);
    expect(block).toContain(`Context dir: ${contextDir}`);
  });

  it('ends with exactly one trailing newline', () => {
    const block = renderBlock(HARNESSES['codex'], contextDir);
    expect(block.endsWith('\n')).toBe(true);
    expect(block.endsWith('\n\n')).toBe(false);
  });

  it('output is byte-identical across repeat calls (deterministic)', () => {
    const a = renderBlock(HARNESSES['claude-code'], contextDir);
    const b = renderBlock(HARNESSES['claude-code'], contextDir);
    expect(a).toBe(b);
  });

  it('contains the "prefer MCP, fall back to CLI" phrasing', () => {
    const block = renderBlock(HARNESSES['claude-code'], contextDir);
    expect(block).toContain('prefer the MCP tool if available');
    expect(block).toContain('Shell fallback');
    expect(block).toContain('loom wake');
  });
});
