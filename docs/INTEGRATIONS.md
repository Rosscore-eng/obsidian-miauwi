# Agent integrations

Miauwi's Codex and Claude integrations are optional desktop features. They use the user's installed, authenticated CLI. Requests occur only after the user enables a provider: through an explicit query, or through periodic consultation when the user has selected a nonzero interval. Periodic requests also require an active, focused application, changed context, available hourly quota, and no quiet or focus mode. Provider subscription terms, usage limits and possible charges apply. Miauwi does not collect API keys or copy authentication files.

## Tested versions and sources

Miauwi was developed and tested against Copilot 4.0.13, Codex CLI 0.163.0-alpha.10.2 and Claude Code 2.1.300. CLI flags change over time; these versions are an observation, not a requirement that Miauwi installs or updates them. An unsupported flag, failed authentication, unavailable provider, malformed output, or timeout is reported visibly. There is no prose fallback that bypasses reply validation.

Primary references:

- [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode): saved CLI authentication, JSONL events, read-only sandbox, ephemeral operation, and strict JSON schema output.
- [Codex developer command reference](https://learn.chatgpt.com/docs/developer-commands?surface=cli): CLI permissions, configuration and command options.
- [Codex configuration basics](https://learn.chatgpt.com/docs/config-file/config-basic): feature switches for command execution, hooks, apps and subagents.
- [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference): print mode, structured output, tools, restricted/safe modes and MCP configuration.
- [Claude Code programmatic operation](https://code.claude.com/docs/en/headless): JSON streaming and final structured results.
- [Copilot session manager source](https://github.com/logancyang/obsidian-copilot/blob/master/src/agentMode/session/AgentSessionManager.ts) and [session source](https://github.com/logancyang/obsidian-copilot/blob/master/src/agentMode/session/AgentSession.ts): implementation inspected alongside the installed plugin bundle. The linked master branch can change.

## Copilot compatibility boundary

Copilot's implementation exposes `agentSessionManager` with `getSessions`, `getSession`, `getActiveSession`, `getChatUIState`, and `subscribe`. A session exposes identity, label, status, message store, subscriptions, `sendPrompt`, and `cancel`. Status can be `starting`, `idle`, `running`, `awaiting_permission`, `error`, or `closed`. These are internal interfaces, not a documented third-party plugin API. A future integration must use capability checks and explicit compatibility errors.

No isolated `createHeadless` API was verified. `createSession` resolves a vault/project working directory and can materialize instructions and context. Sending to or changing the mode of an existing Copilot session could affect the user's active conversation and permissions. Miauwi therefore uses its own CLI requests, selected context, history, and session identifier. It does not attach to, resume, cancel, or scan private transcript files from existing Copilot sessions.

## CLI execution contract

Each request creates a new scratch directory under the operating system's temporary directory, outside the vault. Selected, authorized note snapshots and bounded history from Miauwi's own external-agent exchanges are passed through stdin. Recent local task/reminder dialogue is not substituted for that agent history, and conversations from other plugins are never imported. Changing the provider or allowed-folder list clears the external-agent history. The vault directory is never a provider working directory or an additional allowed directory. Provider session IDs are not used to imply conversation resumption; the caller supplies the bounded external-agent history explicitly.

Codex is invoked with:

```text
--ask-for-approval never exec --json --sandbox read-only
--skip-git-repo-check --ignore-user-config --ignore-rules --ephemeral
--disable shell_tool --disable hooks --disable apps --disable plugins
--disable remote_plugin --disable multi_agent --config web_search="disabled"
--cd <scratch> --output-schema <scratch/reply.schema.json> -
```

Claude is invoked with:

```text
--safe-mode --restricted --strict-mcp-config
--mcp-config {"mcpServers":{}} --tools "" --permission-prompts none
--no-session-persistence --print --output-format stream-json --verbose
--json-schema <reply JSON schema>
```

Claude's `--tools ""` removes built-in tools, and the strict empty MCP configuration removes configured external tools. Safe mode disables user customizations while retaining ordinary authentication. `--bare` is deliberately not used because its authentication behavior differs and can require an API key instead of subscription sign-in. Managed enterprise policy can still apply.

Codex executes with a read-only sandbox and no user configuration/rules loaded. Command execution, hooks, apps, plugin discovery, subagents and web search are explicitly disabled. The plugin does not grant write access, enable approval bypass, add vault paths, configure MCP mutation tools, or execute commands suggested by the model. This is not a claim that a scratch working directory alone is an operating-system isolation boundary: the CLI's enforced sandbox/tool restrictions are essential. Installations must support the requested restrictions; Miauwi never retries with weaker permissions.

Processes are started directly with argument arrays, `shell: false`, and hidden windows. Only the request's owned process tree may be cancelled. Output size, input size and runtime are bounded. Scratch artifacts are removed after the process exits. Errors are categorized without exposing raw stderr, tokens, private paths or authentication material.

## Reply and navigation boundary

The model can return only the documented `AgentReply` JSON shape. A reply is never interpreted as executable code, shell instructions, arbitrary tool calls or automatic vault changes. Suggested actions are limited to `open_note`, `mark_completed`, and `snooze`; the surrounding UI decides when to offer or execute them under the user's settings.

Navigation targets must be safe relative vault paths that exactly match notes included in that request. Folder allowlists match complete folder boundaries. Absolute paths, traversal, hidden configuration folders, URI fragments and unverified targets are rejected. No raw CLI output, Markdown fence, or free-text answer bypasses this validation.

Tests use deterministic fixtures and injected process runners. They do not authenticate, send prompts to models, or spend provider quota. A real CLI/account integration test must be an explicit user action.
