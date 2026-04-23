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
import {
  FlagEmbedding,
  EmbeddingModel,
} from 'fastembed';
import type { EmbeddingProvider } from './types.js';
import { debugLog } from '../logging.js';
import { LoomError, LOOM_E_EMBED_DOWNLOAD, LOOM_E_EMBED_INIT } from '../errors.js';

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
    const t0 = Date.now();
    const embedder = await this.ensureEmbedder();
    const vectors = await collectBatches(embedder.embed([text], 1));
    debugLog('fastembed', 'embed (passage)', { ms: Date.now() - t0, chars: text.length });
    return vectors[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const t0 = Date.now();
    const embedder = await this.ensureEmbedder();
    const result = await collectBatches(embedder.embed(texts, 32));
    debugLog('fastembed', 'embedBatch', { ms: Date.now() - t0, count: texts.length });
    return result;
  }

  async embedQuery(text: string): Promise<number[]> {
    const t0 = Date.now();
    const embedder = await this.ensureEmbedder();
    const result = await embedder.queryEmbed(text);
    debugLog('fastembed', 'embedQuery', { ms: Date.now() - t0, chars: text.length });
    return result;
  }

  private ensureEmbedder(): Promise<FlagEmbedding> {
    if (this.embedder) return Promise.resolve(this.embedder);
    if (!this.initPromise) {
      const cacheDir =
        this.config.cacheDir ?? join(homedir(), '.cache', 'loom', 'fastembed');
      mkdirSync(cacheDir, { recursive: true });
      debugLog('fastembed', 'initializing model', { model: this.config.model, cacheDir });
      const t0 = Date.now();
      this.initPromise = FlagEmbedding.init({
        model: this.config.model as Exclude<EmbeddingModel, EmbeddingModel.CUSTOM>,
        cacheDir,
        showDownloadProgress: false,
      }).then((e) => {
        this.embedder = e;
        debugLog('fastembed', 'model ready', { model: this.config.model, ms: Date.now() - t0 });
        return e;
      }).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        const isDownload = /download|network|fetch|ENOTFOUND|ETIMEDOUT/i.test(msg);
        throw new LoomError(
          isDownload ? LOOM_E_EMBED_DOWNLOAD : LOOM_E_EMBED_INIT,
          `Failed to initialize fastembed model "${this.config.model}": ${msg}`,
        );
      });
    }
    return this.initPromise;
  }
}

async function collectBatches(
  gen: AsyncGenerator<number[][], void, unknown>,
): Promise<number[][]> {
  const out: number[][] = [];
  for await (const batch of gen) out.push(...batch);
  return out;
}
