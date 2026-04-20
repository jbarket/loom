/**
 * Test helpers — run `runCli` in-process with captured streams.
 */
import type { IOStreams } from './io.js';
import { Readable } from 'node:stream';
import { runCli } from './index.js';

export interface CaptureResult {
  stdout: string;
  stderr: string;
  code: number;
}

export async function runCliCaptured(
  argv: string[],
  opts?: { stdin?: string; env?: Record<string, string> },
): Promise<CaptureResult> {
  let stdout = '';
  let stderr = '';
  const stdin = Readable.from([opts?.stdin ?? '']);
  const io: IOStreams = {
    stdout: (s) => { stdout += s; },
    stderr: (s) => { stderr += s; },
    stdin,
    stdinIsTTY: opts?.stdin === undefined,
    env: opts?.env ?? {},
  };
  const code = await runCli(argv, io);
  return { stdout, stderr, code };
}
