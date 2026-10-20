/** Desktop-only boundary. Imported lazily so common/plugin logic never loads Node on mobile. */
import { spawn } from 'node:child_process';
import { access, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { AgentError, sanitizeAgentError, type AgentRunRequest } from './types';
import { buildArguments, MAX_OUTPUT_BYTES, REPLY_SCHEMA } from './protocol';

type ProcessLauncher = (executable: string, args: string[], input: string, signal: AbortSignal, cwd: string) => Promise<string>;

/** Kill only the process group/tree created by this request. Never match by process name. */
async function stopOwnedProcess(pid: number, fallback: () => void): Promise<void> {
  if (process.platform === 'win32') {
    const executable = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe');
    await new Promise<void>(resolveStop => {
      let done = false;
      const finish = () => { if (!done) { done = true; clearTimeout(timer); fallback(); resolveStop(); } };
      const killer = spawn(executable, ['/PID', String(pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' });
      const timer = setTimeout(() => { killer.kill(); finish(); }, 2000);
      killer.once('error', finish);
      killer.once('close', finish);
    });
  } else {
    try { process.kill(-pid, 'SIGKILL'); } catch { fallback(); }
  }
}

/** Bounded direct process execution shared by both provider adapters. */
export const runBoundedProcess: ProcessLauncher = async (executable, args, input, signal, cwd) => {
  if (signal.aborted) throw new AgentError('cancelled');
  if (Buffer.byteLength(input, 'utf8') > 300000) throw new AgentError('failed');
  return new Promise<string>((resolveRun, rejectRun) => {
    const child = spawn(executable, args, {
      cwd, shell: false, windowsHide: true, detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stdoutBytes = 0;
    let stderr = '';
    let settled = false;
    let failure: AgentError | undefined;
    let stopTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: AgentError) => {
      if (settled) return;
      settled = true;
      if (stopTimer) clearTimeout(stopTimer);
      signal.removeEventListener('abort', abort);
      if (error) rejectRun(error); else resolveRun(stdout);
    };
    const stop = (error: AgentError) => {
      if (settled || failure) return;
      failure = error;
      stopTimer = setTimeout(() => { child.kill('SIGKILL'); finish(error); }, 3000);
      if (child.pid) void stopOwnedProcess(child.pid, () => child.kill('SIGKILL')).catch(() => child.kill('SIGKILL'));
      else child.kill('SIGKILL');
    };
    const abort = () => stop(signal.reason instanceof AgentError ? signal.reason : new AgentError('cancelled'));
    signal.addEventListener('abort', abort, { once: true });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdoutBytes += Buffer.byteLength(chunk, 'utf8');
      if (stdoutBytes > MAX_OUTPUT_BYTES) stop(new AgentError('output_limit'));
      else if (!failure) stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => { if (stderr.length < 8192) stderr += chunk.slice(0, 8192 - stderr.length); });
    // EPIPE is expected if a failed CLI exits before consuming the entire prompt.
    child.stdin.on('error', () => {});
    child.once('error', error => finish(failure ?? sanitizeAgentError(error)));
    child.once('close', code => finish(failure ?? (code === 0 ? undefined : sanitizeAgentError(new Error(stderr)))));
    if (signal.aborted) abort();
    if (!failure) child.stdin.end(input, 'utf8');
  });
};

export async function runAgentProcess(request: AgentRunRequest, launch: ProcessLauncher = runBoundedProcess): Promise<string> {
  if (request.signal.aborted) throw new AgentError('cancelled');
  const temporaryRoot = resolve(tmpdir());
  const scratch = await mkdtemp(join(temporaryRoot, 'miauwi-'));
  try {
    const schemaPath = join(scratch, 'reply.schema.json');
    if (request.provider === 'codex') await writeFile(schemaPath, JSON.stringify(REPLY_SCHEMA), { encoding: 'utf8', mode: 0o600 });
    if (request.signal.aborted) throw new AgentError('cancelled');
    return await launch(request.executable, buildArguments(request.provider, scratch, schemaPath), request.input, request.signal, scratch);
  } catch (error) {
    throw sanitizeAgentError(error);
  } finally {
    // Recursive cleanup is confined to the exact freshly created temp child.
    const target = resolve(scratch);
    if (dirname(target) !== temporaryRoot || !basename(target).startsWith('miauwi-')) throw new AgentError('failed');
    await rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => { throw new AgentError('failed'); });
  }
}

/** Find executable files without reading CLI configuration, credentials or transcripts. */
export async function discoverExecutables(): Promise<{ codex?: string; claude?: string }> {
  const windows = process.platform === 'win32';
  const folders = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  folders.push(join(homedir(), '.local', 'bin'));
  if (windows && process.env.LOCALAPPDATA) {
    const bundled = join(process.env.LOCALAPPDATA, 'OpenAI', 'Codex', 'bin');
    const entries = await readdir(bundled, { withFileTypes: true }).catch(() => []);
    for (const entry of entries.filter(entry => entry.isDirectory()).slice(-20).reverse()) folders.push(join(bundled, entry.name));
  }
  const result: { codex?: string; claude?: string } = {};
  for (const provider of ['codex', 'claude'] as const) {
    for (const folder of [...new Set(folders)]) {
      const candidate = join(folder.replace(/^"|"$/g, ''), provider + (windows ? '.exe' : ''));
      try {
        await access(candidate, windows ? constants.F_OK : constants.X_OK);
        if (!(await stat(candidate)).isFile()) continue;
        result[provider] = candidate;
        break;
      } catch { /* Try the next PATH entry; missing CLIs are expected. */ }
    }
  }
  return result;
}
