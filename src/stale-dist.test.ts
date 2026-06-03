import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, statSync, utimesSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock process.exit so ensureFreshDist doesn't actually exit
vi.spyOn(process, 'exit').mockImplementation(() => {
  throw new Error('process.exit called');
});

describe('stale-dist guard', () => {
  let tempDir: string;
  const originalEnv = process.env.LOOM_SKIP_STALE_CHECK;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'loom-stale-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    if (originalEnv === undefined) {
      delete process.env.LOOM_SKIP_STALE_CHECK;
    } else {
      process.env.LOOM_SKIP_STALE_CHECK = originalEnv;
    }
  });

  it('ensures ensureFreshDist is exported and callable', async () => {
    const { ensureFreshDist } = await import('./index.js');
    expect(typeof ensureFreshDist).toBe('function');
  });

  it('ensures isCliInvocation is exported', async () => {
    const { isCliInvocation } = await import('./index.js');
    expect(typeof isCliInvocation).toBe('function');
    expect(isCliInvocation(['node', 'loom', 'wake'])).toBe(true);
    expect(isCliInvocation(['node', 'loom'])).toBe(false);
    expect(isCliInvocation(['node', 'loom', '--help'])).toBe(true);
  });

  it('newestFile finds the most recent .ts file in a directory tree', async () => {
    const srcDir = join(tempDir, 'src');
    mkdirSync(srcDir, { recursive: true });

    const aPath = join(srcDir, 'a.ts');
    const bPath = join(srcDir, 'b.ts');
    writeFileSync(aPath, 'const a = 1');
    writeFileSync(bPath, 'const b = 2');

    // Use Date objects for utimesSync — set a clear 10s gap
    const oldDate = new Date(Date.now() - 10000);
    const newDate = new Date(Date.now());
    utimesSync(aPath, oldDate, oldDate);
    utimesSync(bPath, newDate, newDate);

    const { newestFile } = await import('./index.js');
    const result = newestFile(srcDir, '.ts');
    expect(result).toContain('b.ts');
  });

  it('newestFile skips node_modules directories', async () => {
    const srcDir = join(tempDir, 'src');
    mkdirSync(join(srcDir, 'node_modules', 'dep'), { recursive: true });

    const srcPath = join(srcDir, 'index.ts');
    const depPath = join(srcDir, 'node_modules', 'dep', 'lib.ts');

    writeFileSync(srcPath, 'const src = 1');
    writeFileSync(depPath, 'const dep = 1');

    // Both have same new mtime, but dep is in node_modules and should be skipped
    const newDate = new Date(Date.now());
    utimesSync(srcPath, newDate, newDate);
    utimesSync(depPath, newDate, newDate);

    const { newestFile } = await import('./index.js');
    const result = newestFile(srcDir, '.ts');
    expect(result).toContain('index.ts');
    expect(result).not.toContain('lib.ts');
  });

  it('newestFile finds files in nested subdirectories', async () => {
    const srcDir = join(tempDir, 'src');
    mkdirSync(join(srcDir, 'deep', 'nested'), { recursive: true });

    const topPath = join(srcDir, 'top.ts');
    const deepPath = join(srcDir, 'deep', 'nested', 'deep.ts');

    writeFileSync(topPath, 'const top = 1');
    writeFileSync(deepPath, 'const deep = 1');

    const oldDate = new Date(Date.now() - 10000);
    const newDate = new Date(Date.now());
    utimesSync(topPath, oldDate, oldDate);
    utimesSync(deepPath, newDate, newDate);

    const { newestFile } = await import('./index.js');
    const result = newestFile(srcDir, '.ts');
    expect(result).toContain('deep.ts');
  });

  it('skips rebuild when LOOM_SKIP_STALE_CHECK is set', async () => {
    const srcDir = join(tempDir, 'src');
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, 'index.ts'), 'console.log("hello")');

    process.env.LOOM_SKIP_STALE_CHECK = '1';
    const { ensureFreshDist } = await import('./index.js');
    await expect(ensureFreshDist(tempDir)).resolves.toBeUndefined();
  });

  it('handles missing dist/ directory with skip flag enabled', async () => {
    const srcDir = join(tempDir, 'src');
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, 'index.ts'), 'console.log("hello")');

    process.env.LOOM_SKIP_STALE_CHECK = '1';
    const { ensureFreshDist } = await import('./index.js');
    await expect(ensureFreshDist(tempDir)).resolves.toBeUndefined();
  });

  it('handles empty src/ directory without crash', async () => {
    mkdirSync(join(tempDir, 'src'), { recursive: true });

    delete process.env.LOOM_SKIP_STALE_CHECK;
    const { ensureFreshDist } = await import('./index.js');
    await expect(ensureFreshDist(tempDir)).resolves.toBeUndefined();
  });

  it('does not rebuild when dist/ is fresher than src/', async () => {
    const srcDir = join(tempDir, 'src');
    const distDir = join(tempDir, 'dist');
    mkdirSync(srcDir, { recursive: true });
    mkdirSync(distDir, { recursive: true });

    const srcPath = join(srcDir, 'index.ts');
    const distPath = join(distDir, 'index.js');
    writeFileSync(srcPath, 'console.log("hello")');
    writeFileSync(distPath, 'console.log("hello")');

    // Make src distinctly older than dist
    const oldDate = new Date(Date.now() - 10000);
    const newDate = new Date(Date.now());
    utimesSync(srcPath, oldDate, oldDate);
    utimesSync(distPath, newDate, newDate);

    // Verify mtimes are actually as expected
    expect(statSync(distPath).mtimeMs).toBeGreaterThan(statSync(srcPath).mtimeMs);

    delete process.env.LOOM_SKIP_STALE_CHECK;
    const { ensureFreshDist } = await import('./index.js');
    // Should return without triggering rebuild
    await expect(ensureFreshDist(tempDir)).resolves.toBeUndefined();
  });

  it('detects and rebuilds stale dist/ when src/ is newer', async () => {
    const srcDir = join(tempDir, 'src');
    const distDir = join(tempDir, 'dist');
    mkdirSync(srcDir, { recursive: true });
    mkdirSync(distDir, { recursive: true });

    const srcPath = join(srcDir, 'index.ts');
    const distPath = join(distDir, 'index.js');
    writeFileSync(distPath, 'old build');
    writeFileSync(srcPath, 'new source');

    // Make dist distinctly older than src
    const oldDate = new Date(Date.now() - 10000);
    const newDate = new Date(Date.now());
    utimesSync(distPath, oldDate, oldDate);
    utimesSync(srcPath, newDate, newDate);

    // Verify the staleness detection directly via newestFile
    const { newestFile } = await import('./index.js');
    const newestSrc = newestFile(srcDir, '.ts');
    const newestDist = newestFile(distDir, '.js');
    expect(newestSrc).not.toBeNull();
    expect(newestDist).not.toBeNull();
    expect(statSync(newestSrc!).mtimeMs).toBeGreaterThan(statSync(newestDist!).mtimeMs);

    // ensureFreshDist should attempt a rebuild (will throw because tsc fails in temp dir)
    delete process.env.LOOM_SKIP_STALE_CHECK;
    const { ensureFreshDist } = await import('./index.js');
    await expect(ensureFreshDist(tempDir)).rejects.toThrow('process.exit called');
  });

  it('detects stale dist/ when matching against .d.ts files', async () => {
    const srcDir = join(tempDir, 'src');
    const distDir = join(tempDir, 'dist');
    mkdirSync(srcDir, { recursive: true });
    mkdirSync(distDir, { recursive: true });

    const srcPath = join(srcDir, 'server.ts');
    const dtsPath = join(distDir, 'server.d.ts');
    writeFileSync(dtsPath, 'declare function foo(): void');
    writeFileSync(srcPath, 'export function foo() {}');

    const oldDate = new Date(Date.now() - 10000);
    const newDate = new Date(Date.now());
    utimesSync(dtsPath, oldDate, oldDate);
    utimesSync(srcPath, newDate, newDate);

    const { newestFile } = await import('./index.js');
    const newestSrc = newestFile(srcDir, '.ts');
    const newestDistDts = newestFile(distDir, '.d.ts');
    expect(newestSrc).not.toBeNull();
    expect(newestDistDts).not.toBeNull();
    expect(statSync(newestSrc!).mtimeMs).toBeGreaterThan(statSync(newestDistDts!).mtimeMs);
  });
});
