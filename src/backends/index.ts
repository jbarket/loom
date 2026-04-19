/**
 * Memory backend factory.
 *
 * loom v0.3.1 ships a single opinionated stack: SqliteVecBackend
 * (sqlite + sqlite-vec virtual table) backed by FastEmbedProvider
 * (BGE-small-en-v1.5 ONNX, CPU-only). Zero external services. One DB
 * file per agent under the context dir.
 *
 * If you ever need a different stack — different embedding model,
 * remote vector DB, etc — implement the MemoryBackend / EmbeddingProvider
 * interfaces in types.ts and swap the concrete classes here. There is
 * deliberately no env-driven backend selector anymore: opinionated.
 */
import {
  resolveSqliteDbPath,
  resolveFastEmbedModel,
  resolveFastEmbedCacheDir,
} from '../config.js';
import { SqliteVecBackend } from './sqlite-vec.js';
import { FastEmbedProvider } from './fastembed.js';
import type { MemoryBackend, EmbeddingProvider } from './types.js';

export function createEmbeddingProvider(): EmbeddingProvider {
  return new FastEmbedProvider({
    model: resolveFastEmbedModel(),
    cacheDir: resolveFastEmbedCacheDir(),
  });
}

export function createBackend(contextDir: string): MemoryBackend {
  return new SqliteVecBackend(
    { dbPath: resolveSqliteDbPath(contextDir) },
    createEmbeddingProvider(),
  );
}
