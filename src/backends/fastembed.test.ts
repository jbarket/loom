import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { isModelCached, resolveModelDir, FastEmbedProvider } from './fastembed.js';

describe('isModelCached / resolveModelDir', () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'loom-fastembed-test-'));
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it('resolveModelDir returns path inside cacheDir', () => {
    const result = resolveModelDir(cacheDir, 'fast-bge-small-en-v1.5');
    expect(result).toBe(join(cacheDir, 'fast-bge-small-en-v1.5'));
  });

  it('isModelCached returns false when model dir is absent', () => {
    expect(isModelCached(cacheDir, 'fast-bge-small-en-v1.5')).toBe(false);
  });

  it('isModelCached returns true when model dir exists', async () => {
    const modelDir = join(cacheDir, 'fast-bge-small-en-v1.5');
    await mkdir(modelDir, { recursive: true });
    // Put a sentinel file to confirm it's non-trivially detected
    await writeFile(join(modelDir, 'model.onnx'), 'fake');
    expect(isModelCached(cacheDir, 'fast-bge-small-en-v1.5')).toBe(true);
  });
});

describe('FastEmbedProvider', () => {
  it('rejects unknown model names in constructor', () => {
    expect(() => new FastEmbedProvider({ model: 'not-a-real-model' })).toThrow(/Unknown fastembed model/);
  });

  it('exposes dimensions for known models', () => {
    const p = new FastEmbedProvider({ model: 'fast-bge-small-en-v1.5' });
    expect(p.dimensions).toBe(384);
  });

  it('warmUp() resolves without error (mocked fastembed)', async () => {
    const p = new FastEmbedProvider({ model: 'fast-bge-small-en-v1.5' });
    await expect(p.warmUp()).resolves.toBeUndefined();
  });

  it('embed() returns a vector of the right dimension', async () => {
    const p = new FastEmbedProvider({ model: 'fast-bge-small-en-v1.5' });
    const vec = await p.embed('hello world');
    expect(vec).toHaveLength(384);
    expect(typeof vec[0]).toBe('number');
  });
});
