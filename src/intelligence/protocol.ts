import { AgentError, sanitizeAgentError, type AgentProvider } from './types';

export const MAX_OUTPUT_BYTES = 1024 * 1024;
export const REPLY_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    type: { type: 'string', enum: ['dialogue', 'task_reminder', 'finding'] },
    message: { type: 'string' },
    emotion: { type: 'string', enum: ['neutral', 'happy', 'concerned', 'curious'] },
    animation: { type: 'string', enum: ['idle', 'jump', 'celebrate', 'look', 'sleep'] },
    priority: { type: 'string', enum: ['low', 'normal', 'high'] },
    notePath: { type: ['string', 'null'] },
    suggestedActions: { type: 'array', items: { type: 'string', enum: ['open_note', 'mark_completed', 'snooze'] } },
  },
  required: ['type', 'message', 'emotion', 'animation', 'priority', 'notePath', 'suggestedActions'],
} as const;

export function buildArguments(provider: Exclude<AgentProvider, 'none'>, scratch: string, schemaPath: string): string[] {
  if (provider === 'codex') return [
    '--ask-for-approval', 'never', 'exec', '--json', '--sandbox', 'read-only',
    '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules', '--ephemeral',
    '--disable', 'shell_tool', '--disable', 'hooks', '--disable', 'apps',
    '--disable', 'plugins', '--disable', 'remote_plugin', '--disable', 'multi_agent',
    '--config', 'web_search="disabled"',
    '--cd', scratch, '--output-schema', schemaPath, '-',
  ];
  return [
    '--safe-mode', '--restricted', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--tools', '', '--permission-prompts', 'none', '--no-session-persistence',
    '--print', '--output-format', 'stream-json', '--verbose', '--json-schema', JSON.stringify(REPLY_SCHEMA),
  ];
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Only complete terminal provider results qualify; partial text is never a fallback. */
export function decodeAgentOutput(provider: Exclude<AgentProvider, 'none'>, stdout: string): unknown {
  if (stdout.length > MAX_OUTPUT_BYTES) throw new AgentError('output_limit');
  let final: unknown;
  let completed = false;
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event: unknown;
    try { event = JSON.parse(line); } catch { throw new AgentError('invalid_reply'); }
    if (!record(event) || typeof event.type !== 'string') throw new AgentError('invalid_reply');
    if (provider === 'codex') {
      if (event.type === 'turn.failed' || event.type === 'error') {
        const detail = record(event.error) ? event.error.message : event.message;
        throw sanitizeAgentError(new Error(typeof detail === 'string' ? detail : ''));
      }
      if (event.type === 'item.completed' && record(event.item) && event.item.type === 'agent_message') final = event.item.text;
      if (event.type === 'turn.completed') completed = true;
    } else if (event.type === 'result') {
      if (event.is_error === true || (typeof event.subtype === 'string' && event.subtype !== 'success')) {
        throw sanitizeAgentError(new Error(typeof event.result === 'string' ? event.result : JSON.stringify(event.errors ?? '')));
      }
      completed = true;
      final = event.structured_output ?? event.result;
    }
  }
  if (!completed || final === undefined) throw new AgentError('invalid_reply');
  if (typeof final === 'string') {
    try { final = JSON.parse(final); } catch { throw new AgentError('invalid_reply'); }
  }
  if (!record(final)) throw new AgentError('invalid_reply');
  return final;
}
