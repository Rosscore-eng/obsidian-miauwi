export type AgentProvider = 'none' | 'codex' | 'claude';
export interface AgentReply {
  type: 'dialogue' | 'task_reminder' | 'finding';
  message: string;
  emotion: 'neutral' | 'happy' | 'concerned' | 'curious';
  animation: 'idle' | 'jump' | 'celebrate' | 'look' | 'sleep';
  priority: 'low' | 'normal' | 'high';
  notePath?: string;
  suggestedActions: ('open_note' | 'mark_completed' | 'snooze')[];
}
export interface ContextNote { path: string; content: string }
export interface AgentConfig {
  provider: AgentProvider;
  executable: string;
  timeoutMs: number;
  allowedFolders: string[];
  maxContextChars: number;
}
export interface AgentRunRequest {
  provider: Exclude<AgentProvider, 'none'>;
  executable: string;
  input: string;
  signal: AbortSignal;
}
export type AgentRunner = (request: AgentRunRequest) => Promise<string>;

export type AgentErrorCode = 'cancelled' | 'timeout' | 'invalid_reply' | 'output_limit' | 'auth' | 'unsupported' | 'not_found' | 'failed';
const messages: Record<AgentErrorCode, string> = {
  cancelled: 'Agent request cancelled.',
  timeout: 'Agent request timed out. Try a shorter request.',
  invalid_reply: 'Agent returned an invalid structured reply. No action was applied.',
  output_limit: 'Agent output exceeded the safety limit.',
  auth: 'Authentication failed. Sign in to the selected CLI, then try again.',
  unsupported: 'The installed CLI does not support the required safe options. Update it before trying again.',
  not_found: 'Agent executable was not found. Check its path in Miauwi settings.',
  failed: 'Agent request failed. Check the selected CLI installation and authentication.',
};
export class AgentError extends Error {
  constructor(readonly code: AgentErrorCode) { super(messages[code]); this.name = 'AgentError'; }
}
export function sanitizeAgentError(error: unknown): AgentError {
  if (error instanceof AgentError) return error;
  const message = error instanceof Error ? error.message : '';
  if (/401|403|unauth|authentication|invalid.{0,20}api.?key|not logged|sign.?in|login required/i.test(message)) return new AgentError('auth');
  if (/unknown (argument|option)|unexpected argument|unrecognized (option|argument)|unsupported.*option/i.test(message)) return new AgentError('unsupported');
  if (/ENOENT|not found|cannot find|EACCES|EPERM/i.test(message)) return new AgentError('not_found');
  return new AgentError('failed');
}
