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
import { mkdirSync, existsSync, unlinkSync } from 'node:fs';
import {
  FlagEmbedding,
  EmbeddingModel,
} from 'fastembed';
import type { EmbeddingProvider } from './types.js';

export interface FastEmbedConfig {
  /** Model identifier, e.g. 'fast-bge-small-en-v1.5' */
  model: string;
  /** Directory to cache downloaded ONNX models */
  cacheDir?: string;
}

// ─── Cache probing ────────────────────────────────────────────────────────────

/**
 * Returns the path to the model directory inside the fastembed cache.
 * This directory only exists after a successful download + extraction.
 */
export function resolveModelDir(cacheDir: string, model: string): string {
  return join(cacheDir, model);
}

/** True if the model is fully cached and no download is required. */
export function isModelCached(cacheDir: string, model: string): boolean {
  return existsSync(resolveModelDir(cacheDir, model));
}

/**
 * Remove a partial tar.gz leftover from an interrupted download.
 * fastembed checks for the tar.gz file existence before downloading, so a
 * partial file would cause silent extraction failure on the next run.
 */
function cleanPartialTarGz(cacheDir: string, model: string): void {
  const tarGz = join(cacheDir, `${model}.tar.gz`);
  if (existsSync(tarGz)) {
    try { unlinkSync(tarGz); } catch { /* best-effort */ }
  }
}

/**
 * Map a raw error from FlagEmbedding.init() to a human-readable message
 * with actionable context (network, disk, permission, unknown).
 */
function classifyError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string }).code;
  if (code === 'ENOTFOUND' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED' || code === 'ECONNRESET') {
    return new Error(
      `Fastembed model download failed: network error (${code}). ` +
      `Check your connection. For offline installs, pre-seed the cache and set LOOM_FASTEMBED_CACHE_DIR.`,
    );
  }
  if (code === 'ENOSPC') {
    return new Error(`Fastembed model download failed: disk full. Free space and retry.`);
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return new Error(
      `Fastembed model download failed: permission denied. ` +
      `Check cache directory permissions or set LOOM_FASTEMBED_CACHE_DIR to a writable path.`,
    );
  }
  return new Error(`Fastembed model init failed: ${msg}`);
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
    return vectors[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const embedder = await this.ensureEmbedder();
    return collectBatches(embedder.embed(texts, 32));
  }

  async embedQuery(text: string): Promise<number[]> {
    const embedder = await this.ensureEmbedder();
    return embedder.queryEmbed(text);
  }

  /** Pre-warm the embedding model cache. Triggers download if not yet cached. */
  warmUp(): Promise<void> {
    return this.ensureEmbedder().then(() => undefined);
  }

  private ensureEmbedder(): Promise<FlagEmbedding> {
    if (this.embedder) return Promise.resolve(this.embedder);
    if (!this.initPromise) {
      const cacheDir =
        this.config.cacheDir ?? join(homedir(), '.cache', 'loom', 'fastembed');
      mkdirSync(cacheDir, { recursive: true });
      // Remove any partial tar.gz from a previously interrupted download before
      // attempting init — fastembed would otherwise try to extract a broken archive.
      cleanPartialTarGz(cacheDir, this.config.model);
      // Show progress bar only when stderr is a TTY (progress pkg checks this too,
      // but setting the flag avoids spawning the bar object in non-TTY contexts).
      const showDownloadProgress = process.stderr.isTTY ?? false;
      this.initPromise = FlagEmbedding.init({
        model: this.config.model as Exclude<EmbeddingModel, EmbeddingModel.CUSTOM>,
        cacheDir,
        showDownloadProgress,
      }).then((e) => {
        this.embedder = e;
        return e;
      }).catch((err) => {
        // Clear so a subsequent call can retry after fixing the underlying issue.
        this.initPromise = null;
        throw classifyError(err);
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
