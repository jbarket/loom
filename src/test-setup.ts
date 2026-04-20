/**
 * Vitest global setup.
 *
 * Stubs the `fastembed` npm package with a deterministic in-process
 * encoder so the test suite doesn't download the BGE ONNX model on
 * CI. Real fastembed behavior is integration-tested separately; tests
 * here only need stable vectors for sqlite-vec storage/recall plumbing.
 */
import { vi } from 'vitest';

const DIMENSIONS = 384;

function encode(text: string): number[] {
  const vec = new Array<number>(DIMENSIONS).fill(0);
  const lower = text.toLowerCase();
  for (let i = 0; i < lower.length; i++) {
    vec[lower.charCodeAt(i) % DIMENSIONS] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

class FakeFlagEmbedding {
  static init(_opts: unknown): Promise<FakeFlagEmbedding> {
    return Promise.resolve(new FakeFlagEmbedding());
  }

  async *embed(texts: string[], _batchSize?: number): AsyncGenerator<number[][]> {
    yield texts.map(encode);
  }

  async *passageEmbed(texts: string[], _batchSize?: number): AsyncGenerator<number[][]> {
    yield texts.map(encode);
  }

  async queryEmbed(query: string): Promise<number[]> {
    return encode(query);
  }
}

vi.mock('fastembed', () => ({
  FlagEmbedding: FakeFlagEmbedding,
  EmbeddingModel: {
    AllMiniLML6V2: 'fast-all-MiniLM-L6-v2',
    BGEBaseEN: 'fast-bge-base-en',
    BGEBaseENV15: 'fast-bge-base-en-v1.5',
    BGESmallEN: 'fast-bge-small-en',
    BGESmallENV15: 'fast-bge-small-en-v1.5',
    BGESmallZH: 'fast-bge-small-zh-v1.5',
    MLE5Large: 'fast-multilingual-e5-large',
    CUSTOM: 'custom',
  },
}));
