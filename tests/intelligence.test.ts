import { describe, expect, it } from 'vitest';
import { AgentService, isAllowedPath, validateReply, type AgentConfig, type AgentReply } from '../src/intelligence';
import { buildArguments, decodeAgentOutput } from '../src/intelligence/protocol';
import type { AgentRunRequest } from '../src/intelligence/types';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { discoverExecutables, runAgentProcess, runBoundedProcess } from '../src/intelligence/desktop';

const reply: AgentReply = { type: 'dialogue', message: 'Una pausa y seguimos.', emotion: 'happy', animation: 'look', priority: 'normal', suggestedActions: [] };
const config: AgentConfig = { provider: 'codex', executable: 'codex.exe', timeoutMs: 1000, allowedFolders: ['Study'], maxContextChars: 1000 };
const stream = (value: unknown) => JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(value) } }) + '\n' + JSON.stringify({ type: 'turn.completed' }) + '\n';

describe('agent context boundaries', () => {
  it('requires an allowed folder boundary and portable relative paths', () => {
    expect(isAllowedPath('Study/Calculus.md', ['Study'])).toBe(true);
    expect(isAllowedPath('Study 2/Calculus.md', ['Study'])).toBe(false);
    for (const path of ['../Study/a.md', 'Study/../Secrets.md', '/Study/a.md', 'C:/Study/a.md', 'Study\\a.md', 'Study//a.md', '.obsidian/a.md', 'Study/.obsidian/a.md', 'Study/%2e%2e/a.md', 'Study/a.md#heading']) {
      expect(isAllowedPath(path, [''])).toBe(false);
    }
    expect(isAllowedPath('Study/a.md', [])).toBe(false);
  });

  it('rejects invalid folders instead of granting wider access', () => {
    expect(isAllowedPath('Study/a.md', ['Study/../'])).toBe(false);
    expect(isAllowedPath('Study/a.md', ['C:/'])).toBe(false);
    expect(isAllowedPath('Study/a.md', ['Study/'])).toBe(true);
  });
});

describe('agent reply validation', () => {
  it('accepts a structured reply only when navigation targets an existing context note', () => {
    const value = { ...reply, type: 'task_reminder', notePath: 'Study/Calculus.md', suggestedActions: ['open_note', 'snooze'] };
    expect(validateReply(value, new Set(['Study/Calculus.md']))).toEqual(value);
  });

  it('rejects unknown actions, extra executable fields, missing targets and invented paths', () => {
    for (const invalid of [
      { ...reply, command: 'delete all' }, { ...reply, suggestedActions: ['run_command'] },
      { ...reply, suggestedActions: ['open_note'] }, { ...reply, emotion: 'angry' },
      { ...reply, notePath: '../Secrets.md' }, { ...reply, notePath: 'Study/Missing.md' },
      { ...reply, message: '' }, { ...reply, message: 'x'.repeat(1601) },
      '```json\n{}\n```', null,
    ]) expect(() => validateReply(invalid, new Set(['Study/Calculus.md']))).toThrow();
  });
});

describe('provider protocol', () => {
  it('runs Codex with read-only policy, scratch cwd and strict structured output', () => {
    const args = buildArguments('codex', 'C:/Temp/miauwi-1', 'C:/Temp/miauwi-1/reply.schema.json');
    expect(args).toEqual(['--ask-for-approval', 'never', 'exec', '--json', '--sandbox', 'read-only', '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules', '--ephemeral', '--disable', 'shell_tool', '--disable', 'hooks', '--disable', 'apps', '--disable', 'plugins', '--disable', 'remote_plugin', '--disable', 'multi_agent', '--config', 'web_search="disabled"', '--cd', 'C:/Temp/miauwi-1', '--output-schema', 'C:/Temp/miauwi-1/reply.schema.json', '-']);
  });

  it('removes Claude tools and customizations while preserving normal saved authentication', () => {
    const args = buildArguments('claude', 'C:/Temp/miauwi-1', 'unused');
    expect(args).toContain('--safe-mode');
    expect(args).toContain('--restricted');
    expect(args.slice(args.indexOf('--tools'), args.indexOf('--tools') + 2)).toEqual(['--tools', '']);
    expect(args.slice(args.indexOf('--mcp-config'), args.indexOf('--mcp-config') + 2)).toEqual(['--mcp-config', '{"mcpServers":{}}']);
    expect(args).toContain('--strict-mcp-config');
    expect(args).toContain('--json-schema');
    expect(args).not.toContain('--bare');
  });

  it('extracts structured terminal events without accepting prose or incomplete results', () => {
    expect(decodeAgentOutput('codex', stream(reply))).toEqual(reply);
    expect(decodeAgentOutput('claude', JSON.stringify({ type: 'result', subtype: 'success', is_error: false, structured_output: reply }) + '\n')).toEqual(reply);
    expect(() => decodeAgentOutput('codex', JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(reply) } }))).toThrow();
    expect(() => decodeAgentOutput('codex', stream('ordinary prose'))).toThrow();
    expect(() => decodeAgentOutput('claude', JSON.stringify({ type: 'result', subtype: 'success', result: '```json\n{}\n```' }))).toThrow();
    expect(() => decodeAgentOutput('codex', JSON.stringify({ type: 'turn.failed', error: { message: 'secret token' } }))).toThrow();
  });
});

describe('AgentService', () => {
  it('sends bounded selected context, rejects private targets and uses its own stable session id', async () => {
    const requests: AgentRunRequest[] = [];
    const service = new AgentService(config, async request => { requests.push(request); return stream(reply); });
    await service.ask('Explain', [{ path: 'Study/Calculus.md', content: 'A'.repeat(5000) }, { path: 'Secrets.md', content: 'PRIVATE' }], [{ role: 'system', content: 'INJECT' }, ...Array.from({ length: 50 }, () => ({ role: 'user', content: 'H'.repeat(5000) }))]);
    const id = service.sessionId;
    await service.ask('Again', [], []);
    expect(id).toBeTruthy();
    expect(service.sessionId).toBe(id);
    expect(requests[0].input).not.toContain('PRIVATE');
    expect(requests[0].input).not.toContain('INJECT');
    expect(requests[0].input).not.toContain('A'.repeat(1001));
    expect(requests[0].input.length).toBeLessThan(16000);
    expect(service.busy).toBe(false);
  });

  it('rejects overlapping turns and cancellation releases busy state', async () => {
    const service = new AgentService(config, request => new Promise((_, reject) => request.signal.addEventListener('abort', () => reject(new Error('cancelled')))));
    const first = service.ask('Hello', [], []);
    expect(service.busy).toBe(true);
    await expect(service.ask('Overlap', [], [])).rejects.toThrow(/busy/i);
    service.cancel();
    await expect(first).rejects.toThrow(/cancel/i);
    expect(service.busy).toBe(false);
  });

  it('times out even when a provider runner never responds', async () => {
    const service = new AgentService({ ...config, timeoutMs: 15 }, () => new Promise(() => {}));
    await expect(service.ask('Hello', [], [])).rejects.toThrow(/timed out/i);
    expect(service.busy).toBe(false);
  });

  it('refuses disabled integrations, empty executables, aborted calls and disposed services', async () => {
    const runner = async () => stream(reply);
    await expect(new AgentService({ ...config, provider: 'none' }, runner).ask('Hello', [], [])).rejects.toThrow(/disabled/i);
    await expect(new AgentService({ ...config, executable: ' ' }, runner).ask('Hello', [], [])).rejects.toThrow(/executable/i);
    const controller = new AbortController(); controller.abort();
    const service = new AgentService(config, runner);
    await expect(service.ask('Hello', [], [], controller.signal)).rejects.toThrow(/cancel/i);
    service.dispose();
    await expect(service.ask('Hello', [], [])).rejects.toThrow(/disposed/i);
  });

  it('sanitizes auth failures and rejects replies navigating outside selected notes', async () => {
    const auth = new AgentService(config, async () => { throw new Error('401 invalid API key sk-secret-auth-value'); });
    await expect(auth.ask('Hello', [], [])).rejects.toThrow(/sign in/i);
    await expect(auth.ask('Hello', [], [])).rejects.not.toThrow(/sk-secret/);
    const service = new AgentService(config, async () => stream({ ...reply, notePath: 'Study/Invented.md', suggestedActions: ['open_note'] }));
    await expect(service.ask('Hello', [{ path: 'Study/Real.md', content: 'Real' }], [])).rejects.toThrow(/invalid.*reply/i);
    expect(service.busy).toBe(false);
  });

  it('cancels in-flight work when settings change and applies the new provider', async () => {
    const providers: string[] = [];
    const service = new AgentService(config, async request => {
      providers.push(request.provider);
      if (request.provider === 'codex') return new Promise<string>(() => {});
      return JSON.stringify({ type: 'result', subtype: 'success', structured_output: reply });
    });
    const pending = service.ask('Hello', [], []);
    await Promise.resolve();
    service.update({ ...config, provider: 'claude', executable: 'claude.exe' });
    await expect(pending).rejects.toThrow(/cancel/i);
    expect(await service.ask('Again', [], [])).toEqual(reply);
    expect(providers).toEqual(['codex', 'claude']);
  });

  it('honors external cancellation and never accepts duplicate action proposals', async () => {
    const controller = new AbortController();
    const service = new AgentService(config, async () => new Promise<string>(() => {}));
    const pending = service.ask('Hello', [], [], controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow(/cancel/i);
    expect(service.busy).toBe(false);
    expect(() => validateReply({ ...reply, suggestedActions: ['snooze', 'snooze'] }, new Set())).toThrow(/invalid.*reply/i);
  });
});

describe('desktop process boundary (local Node fixtures, no model requests)', () => {
  it('passes stdin directly and reports a complete bounded stdout stream', async () => {
    const controller = new AbortController();
    const output = await runBoundedProcess(process.execPath, ['-e', "process.stdin.setEncoding('utf8');let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>process.stdout.write(JSON.stringify({echo:s})))"], 'a literal $(no shell) & text', controller.signal, process.cwd());
    expect(JSON.parse(output)).toEqual({ echo: 'a literal $(no shell) & text' });
  });

  it('terminates excessive output and cancels an owned long-running process', async () => {
    await expect(runBoundedProcess(process.execPath, ['-e', "process.stdout.write('x'.repeat(1200000));setInterval(()=>{},1000)"], '', new AbortController().signal, process.cwd())).rejects.toThrow(/output.*limit/i);
    const controller = new AbortController();
    const pending = runBoundedProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], '', controller.signal, process.cwd());
    setTimeout(() => controller.abort(), 50);
    await expect(pending).rejects.toThrow(/cancel/i);
  });

  it('keeps scratch context outside the vault and removes it after completion', async () => {
    let scratch = '';
    const result = await runAgentProcess({ provider: 'codex', executable: 'codex.exe', input: 'selected context', signal: new AbortController().signal }, async (_executable, args, input, _signal, cwd) => {
      scratch = cwd;
      expect(relative(resolve(tmpdir()), resolve(cwd))).not.toMatch(/^\.\./);
      expect(input).toBe('selected context');
      const schema = JSON.parse(await readFile(args[args.indexOf('--output-schema') + 1], 'utf8'));
      expect(schema.additionalProperties).toBe(false);
      return stream(reply);
    });
    expect(result).toBe(stream(reply));
    expect(existsSync(scratch)).toBe(false);
  });

  it('cleans scratch context on failure without exposing authentication material', async () => {
    let scratch = '';
    await expect(runAgentProcess({ provider: 'claude', executable: 'claude.exe', input: 'context', signal: new AbortController().signal }, async (_executable, _args, _input, _signal, cwd) => {
      scratch = cwd;
      throw new Error('401 api_key=secret-value');
    })).rejects.toThrow(/sign in/i);
    expect(existsSync(scratch)).toBe(false);
    await expect(runBoundedProcess(process.execPath, ['-e', "process.stderr.write('401 api_key=secret-value');process.exit(1)"], '', new AbortController().signal, process.cwd())).rejects.not.toThrow(/secret-value/);
  });

  it('discovers executable files without accepting a directory or running the CLI', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'miauwi-discovery-test-'));
    const previousPath = process.env.PATH;
    const suffix = process.platform === 'win32' ? '.exe' : '';
    try {
      await writeFile(join(folder, 'codex' + suffix), 'not an actual executable; discovery must not run it', { mode: 0o700 });
      await mkdir(join(folder, 'claude' + suffix));
      process.env.PATH = folder;
      const found = await discoverExecutables();
      expect(found.codex).toBe(join(folder, 'codex' + suffix));
      expect(found.claude).not.toBe(join(folder, 'claude' + suffix));
    } finally {
      process.env.PATH = previousPath;
      if (relative(resolve(tmpdir()), resolve(folder)).startsWith('..')) throw new Error('Unsafe fixture cleanup');
      await rm(folder, { recursive: true, force: true });
    }
  });
});
