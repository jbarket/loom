/**
 * FastEmbed provider — runs ONNX embedding models in-process.
 *
 * No external service required. First call downloads the model to
 * cacheDir (~30MB for BGE-small-en-v1.5). Subsequent calls use the
 * cached model. CPU-only by default; portable to any Node machine.
 *
 * BGE-family models distinguish query vs passage embeddings. Remember()
 * paths call embed() (passage). Recall() calls embedQuery() (query).
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { FlagEmbedding } from './embedding-runtime.js';
import type { EmbeddingModelName } from './embedding-runtime.js';
import type { EmbeddingProvider } from './types.js';

export interface FastEmbedConfig {
  /** Model identifier, e.g. 'fast-bge-small-en-v1.5' */
  model: string;
  /** Directory to cache downloaded ONNX models */
  cacheDir?: string;
}

/** Known model → dimension mapping. */
const MODEL_DIMENSIONS: Record<string, number> = {
  'fast-all-MiniLM-L6-v2': 384,
  'fast-bge-base-en': 768,
  'fast-bge-base-en-v1.5': 768,
  'fast-bge-small-en': 384,
  'fast-bge-small-en-v1.5': 384,
  'fast-bge-small-zh-v1.5': 512,
  'fast-multilingual-e5-large': 1024,
};

export class FastEmbedProvider implements EmbeddingProvider {
  readonly dimensions: number;
  private embedder: FlagEmbedding | null = null;
  private initPromise: Promise<FlagEmbedding> | null = null;

  constructor(private readonly config: FastEmbedConfig) {
    const dims = MODEL_DIMENSIONS[config.model];
    if (dims === undefined) {
      throw new Error(
        `Unknown fastembed model: "${config.model}". Known: ${Object.keys(MODEL_DIMENSIONS).join(', ')}`,
      );
    }
    this.dimensions = dims;
  }

  async embed(text: string): Promise<number[]> {
    const embedder = await this.ensureEmbedder();
    const vectors = await collectBatches(embedder.embed([text], 1));
    const vector = vectors[0];
    if (!vector || vector.length === 0) {
      throw new Error(
        `fastembed: embed() produced no vector for a ${text.length}-char input (model ${this.config.model})`,
      );
    }
    return vector;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const embedder = await this.ensureEmbedder();
    const vectors = await collectBatches(embedder.embed(texts, 32));
    if (vectors.length !== texts.length) {
      throw new Error(
        `fastembed: embedBatch() produced ${vectors.length} vectors for ${texts.length} inputs (model ${this.config.model})`,
      );
    }
    return vectors;
  }

  async embedQuery(text: string): Promise<number[]> {
    const embedder = await this.ensureEmbedder();
    const vector = await embedder.queryEmbed(text);
    if (!vector || vector.length === 0) {
      throw new Error(
        `fastembed: embedQuery() produced no vector for a ${text.length}-char input (model ${this.config.model})`,
      );
    }
    return Array.from(vector);
  }

  private ensureEmbedder(): Promise<FlagEmbedding> {
    if (this.embedder) return Promise.resolve(this.embedder);
    if (!this.initPromise) {
      const cacheDir =
        this.config.cacheDir ?? join(homedir(), '.cache', 'loom', 'fastembed');
      mkdirSync(cacheDir, { recursive: true });
      this.initPromise = FlagEmbedding.init({
        model: this.config.model as EmbeddingModelName,
        cacheDir,
      }).then(
        (e) => {
          this.embedder = e;
          return e;
        },
        (err: unknown) => {
          // Transient failure (e.g. network hiccup during first model
          // download) must not poison the singleton: clear the cached
          // promise so the next call retries init from scratch.
          this.initPromise = null;
          throw err;
        },
      );
    }
    return this.initPromise;
  }
}

async function collectBatches(
  gen: AsyncGenerator<Float32Array[]>,
): Promise<number[][]> {
  const out: number[][] = [];
  for await (const batch of gen) {
    for (const vector of batch) out.push(Array.from(vector));
  }
  return out;
}
