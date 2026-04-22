import { describe, it, expect } from 'vitest';
import { runCliCaptured } from './test-helpers.js';

describe('runCli top-level dispatch', () => {
  it('prints top-level help and exits 0 on --help', async () => {
    const { stdout, stderr, code } = await runCliCaptured(['--help']);
    expect(code).toBe(0);
    expect(stderr + stdout).toMatch(/Usage: loom <command>/);
    expect(stderr + stdout).toMatch(/wake/);
  });

  it('prints the loom version and exits 0 on --version', async () => {
    const { stdout, code } = await runCliCaptured(['--version']);
    expect(code).toBe(0);
    expect(stdout).toMatch(/loom v\d+\.\d+\.\d+/);
  });

  it('returns exit code 2 for an unknown subcommand', async () => {
    const { stderr, code } = await runCliCaptured(['nope']);
    expect(code).toBe(2);
    expect(stderr).toMatch(/Unknown subcommand/);
  });

  it('routes `install` to install.run', async () => {
    const { stdout, code } = await runCliCaptured(['install', '--help']);
    expect(code).toBe(0);
    expect(stdout).toMatch(/loom install/);
  });

  it('routes `doctor` to doctor.run', async () => {
    const { stdout, code } = await runCliCaptured(['doctor', '--help']);
    expect(code).toBe(0);
    expect(stdout).toMatch(/loom doctor/);
  });
});

import { isCliInvocation } from '../index.js';

describe('isCliInvocation (argv[2] routing)', () => {
  it('returns false for no extra args (MCP path)', () => {
    expect(isCliInvocation(['node', 'index.js'])).toBe(false);
  });
  it('returns false for --context-dir path (MCP path)', () => {
    expect(isCliInvocation(['node', 'index.js', '--context-dir', '/foo'])).toBe(false);
  });
  it('returns true for known subcommand', () => {
    expect(isCliInvocation(['node', 'index.js', 'wake'])).toBe(true);
  });
  it('returns true for --help', () => {
    expect(isCliInvocation(['node', 'index.js', '--help'])).toBe(true);
  });
  it('returns false for unknown positional (falls through to MCP)', () => {
    expect(isCliInvocation(['node', 'index.js', 'floop'])).toBe(false);
  });
});
