import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock the fastembed package entirely — tests must never download the
// real ONNX model. The provider only touches FlagEmbedding.init and the
// instance methods embed()/queryEmbed().
vi.mock('fastembed', () => ({
  FlagEmbedding: { init: vi.fn() },
  EmbeddingModel: {},
}));

import { FlagEmbedding } from 'fastembed';
import { FastEmbedProvider } from './fastembed.js';

const initMock = vi.mocked(FlagEmbedding.init);

async function* batchGen(batches: number[][][]) {
  for (const b of batches) yield b;
}

/** Minimal stand-in for a FlagEmbedding instance. */
function makeFakeEmbedder(opts?: {
  batches?: number[][][];
  queryVector?: number[];
}) {
  return {
    embed: vi.fn((texts: string[]) =>
      batchGen(opts?.batches ?? [texts.map(() => [0.1, 0.2, 0.3])]),
    ),
    queryEmbed: vi.fn(async () => opts?.queryVector ?? [0.1, 0.2, 0.3]),
  } as unknown as FlagEmbedding;
}

describe('FastEmbedProvider', () => {
  let cacheDir: string;

  const makeProvider = () =>
    new FastEmbedProvider({ model: 'fast-bge-small-en-v1.5', cacheDir });

  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), 'loom-fastembed-'));
    initMock.mockReset();
  });

  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
  });

  it('throws on an unknown model name', () => {
    expect(
      () => new FastEmbedProvider({ model: 'fast-nonsense', cacheDir }),
    ).toThrow(/unknown fastembed model/i);
  });

  it('retries init after a failed first attempt', async () => {
    initMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(makeFakeEmbedder());

    const provider = makeProvider();

    await expect(provider.embed('hello')).rejects.toThrow(/network down/);
    // Pre-fix the rejected promise stayed cached and every later call
    // failed forever. The retry must call init again and succeed.
    await expect(provider.embed('hello')).resolves.toEqual([0.1, 0.2, 0.3]);
    expect(initMock).toHaveBeenCalledTimes(2);
  });

  it('initializes only once across calls after success', async () => {
    initMock.mockResolvedValue(makeFakeEmbedder());
    const provider = makeProvider();

    await provider.embed('one');
    await provider.embedQuery('two');
    await provider.embedBatch(['three']);

    expect(initMock).toHaveBeenCalledTimes(1);
  });

  it('throws a descriptive error when embed yields no vector', async () => {
    initMock.mockResolvedValue(makeFakeEmbedder({ batches: [] }));
    const provider = makeProvider();

    await expect(provider.embed('hello')).rejects.toThrow(
      /embed\(\) produced no vector.*fast-bge-small-en-v1\.5/,
    );
  });

  it('throws a descriptive error when embedQuery yields an empty vector', async () => {
    initMock.mockResolvedValue(makeFakeEmbedder({ queryVector: [] }));
    const provider = makeProvider();

    await expect(provider.embedQuery('hello')).rejects.toThrow(
      /embedQuery\(\) produced no vector/,
    );
  });

  it('throws when embedBatch returns fewer vectors than inputs', async () => {
    initMock.mockResolvedValue(
      makeFakeEmbedder({ batches: [[[0.1, 0.2, 0.3]]] }),
    );
    const provider = makeProvider();

    await expect(provider.embedBatch(['a', 'b'])).rejects.toThrow(
      /1 vectors for 2 inputs/,
    );
  });

  it('returns [] for an empty embedBatch without touching init', async () => {
    const provider = makeProvider();
    await expect(provider.embedBatch([])).resolves.toEqual([]);
    expect(initMock).not.toHaveBeenCalled();
  });
});
