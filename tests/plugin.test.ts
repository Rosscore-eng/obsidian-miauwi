// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginManifest } from 'obsidian';
import type { Settings } from '../src/core';
import type { AgentReply } from '../src/intelligence';

vi.mock('obsidian', async () => import('./helpers/obsidian'));
const pets = vi.hoisted(() => ({ instances: [] as { visible: boolean; sleeping: boolean; destroyed: boolean; messages: string[] }[] }));
vi.mock('../src/pet', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/pet')>();
  return { ...actual, PetController: class {
    state = { visible: false, sleeping: false, destroyed: false, messages: [] as string[] };
    constructor() { pets.instances.push(this.state); }
    show() { this.state.visible = true; }
    hide() { this.state.visible = false; }
    sleep() { this.state.sleeping = true; }
    wake() { this.state.sleeping = false; }
    destroy() { this.state.destroyed = true; }
    say(text: string) { this.state.messages.push(text); }
    update() {} focus() {} reactToNote() {} celebrate() {}
  } };
});

import MiauwiPlugin from '../src/main';
import { AgentService } from '../src/intelligence';
import { clickButton, createHost, flushUi, installDomHelpers, latestModal, Modal, Notice, Plugin as HostPlugin } from './helpers/obsidian';

const manifest: PluginManifest = { id: 'miauwi', name: 'Miauwi', version: '1.0.0', minAppVersion: '1.5.0', description: 'Test plugin', author: 'Test', isDesktopOnly: false };
const agentReply: AgentReply = { type: 'dialogue', message: 'Una idea útil para estudiar.', emotion: 'curious', animation: 'look', priority: 'normal', suggestedActions: [] };
let plugins: MiauwiPlugin[] = [];

async function start(files: Record<string, string> = {}, settings: Partial<Settings> = {}, extraData: Record<string, unknown> = {}) {
  const host = createHost({ ...extraData, settings: { timeZone: 'America/Lima', quietStart: '00:00', quietEnd: '00:00', dueAlerts: false, ...settings } }, files);
  const plugin = new MiauwiPlugin(host.app, manifest);
  plugins.push(plugin);
  await plugin.onload();
  host.workspace.layoutReady();
  await flushUi();
  return { ...host, plugin };
}

function dialogTitle(modal = latestModal()): string { return modal.contentEl.querySelector('h2')?.textContent ?? ''; }
async function choose(text: string): Promise<void> {
  const modal = latestModal();
  const row = [...modal.contentEl.querySelectorAll<HTMLElement>('.setting-item')].find(row => row.querySelector('.setting-item-name')?.textContent === text);
  if (!row) throw new Error(`Missing choice: ${text}`);
  row.querySelector<HTMLButtonElement>('button')!.click();
  await flushUi();
}
function fillField(label: string, value: string): void {
  const row = [...latestModal().contentEl.querySelectorAll<HTMLElement>('.setting-item')].find(row => row.querySelector('.setting-item-name')?.textContent === label);
  const input = row?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
  if (!input) throw new Error(`Missing input: ${label}`);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function linkTaskReminder(host: Awaited<ReturnType<typeof start>>, taskTitle: string): Promise<void> {
  await host.plugin.action('tasks');
  await choose(`☐ ${taskTitle}`);
  await choose('Crear recordatorio vinculado');
  fillField('Cuándo', 'mañana a las 19:00');
  await clickButton(latestModal(), 'Continuar');
  expect(dialogTitle()).toBe('Confirmar recordatorio');
  expect(host.plugin.reminders.list()).toHaveLength(0);
  await clickButton(latestModal(), 'Confirmar');
}

beforeEach(() => {
  installDomHelpers(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-20T17:00:00Z'));
  Modal.instances = []; Notice.messages = []; pets.instances = [];
});
afterEach(async () => {
  for (const plugin of plugins) plugin.unload();
  plugins = [];
  for (const modal of Modal.instances) if (modal.isOpen) modal.close();
  await flushUi();
  document.body.replaceChildren(); vi.restoreAllMocks(); vi.useRealTimers();
});

describe('plugin lifecycle and local chat wiring', () => {
  it('shows the pet after layout and releases registered host events and timers on unload', async () => {
    const host = await start();
    expect(pets.instances).toHaveLength(1);
    expect(pets.instances[0].visible).toBe(true);
    expect(host.workspace.count('file-open')).toBe(1);
    expect(host.vault.count('modify')).toBe(1);
    host.plugin.unload(); plugins = [];
    expect(pets.instances[0].destroyed).toBe(true);
    expect(host.workspace.count('file-open')).toBe(0);
    expect(host.vault.count('modify')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('renames visible command labels and chat while preserving stable command ids', async () => {
    const { plugin } = await start();
    const commands = (plugin as unknown as HostPlugin).registeredCommands;
    const ids = commands.map(command => command.id);
    expect(ids).toContain('miauwi:chat');
    await plugin.updateSettings({ name: 'Luna' });
    expect(commands.map(command => command.id)).toEqual(ids);
    expect(commands.every(command => command.name.includes('Luna:'))).toBe(true);
    await plugin.openChat();
    expect(document.querySelector('.miauwi-chat h2')?.textContent).toBe('Luna');
    expect(document.querySelector('textarea')?.getAttribute('aria-label')).toBe('Mensaje para Luna');
  });

  it('routes real chat form submission and other local requests without consulting an agent', async () => {
    const ask = vi.spyOn(AgentService.prototype, 'ask').mockResolvedValue(agentReply);
    const { plugin } = await start({}, { name: 'Luna', agentProvider: 'codex', codexExecutable: 'C:/codex.exe' });
    await plugin.openChat();
    const textarea = document.querySelector<HTMLTextAreaElement>('.miauwi-chat textarea')!;
    textarea.value = 'Luna, duerme';
    document.querySelector<HTMLFormElement>('.miauwi-chat form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushUi();
    expect(pets.instances[0].sleeping).toBe(true);
    await plugin.handleChat('Luna, despierta');
    await plugin.handleChat('no me interrumpas durante 45 minutos');
    expect(pets.instances[0].sleeping).toBe(false);
    expect(plugin.data.memory.quietUntil).toBe(Date.now() + 45 * 60000);
    expect(ask).not.toHaveBeenCalled();
  });
});

describe('reminder confirmation and persistence', () => {
  it.each([
    ['Recuérdame estudiar Física', 'mañana a las 19:00'],
    ['Recuérdame mañana estudiar Física', 'a las 19:00'],
  ])('keeps an incomplete local reminder pending until the answer supplies its schedule: %s', async (request, answer) => {
    const ask = vi.spyOn(AgentService.prototype, 'ask').mockResolvedValue(agentReply);
    const host = await start({}, { agentProvider: 'codex', codexExecutable: 'C:/codex.exe' });
    await host.plugin.handleChat(request);
    expect(host.plugin.data.history.at(-1)?.content).toMatch(/hora exacta/i);
    expect(host.plugin.reminders.list()).toHaveLength(0);
    expect(Modal.instances.some(modal => modal.isOpen)).toBe(false);
    await host.plugin.handleChat(answer);
    expect(dialogTitle()).toBe('Confirmar recordatorio');
    expect(host.plugin.reminders.list()).toHaveLength(0);
    await clickButton(latestModal(), 'Confirmar');
    expect(host.plugin.reminders.list()).toMatchObject([{ title: 'estudiar Física', dueAt: '2026-10-22T00:00:00.000Z', timeZone: 'America/Lima', status: 'active', origin: 'chat' }]);
    expect((host.saved.at(-1) as { reminders: unknown[] }).reminders).toHaveLength(1);
    expect(ask).not.toHaveBeenCalled();
  });

  it('does not create a reminder before confirmation and cancellation leaves reminders empty', async () => {
    const host = await start();
    await host.plugin.handleChat('Recuérdame mañana a las 7 p. m. estudiar Física');
    expect(dialogTitle()).toBe('Confirmar recordatorio');
    expect(host.plugin.reminders.list()).toHaveLength(0);
    expect(host.saved.every(value => (value as { reminders: unknown[] }).reminders.length === 0)).toBe(true);
    await clickButton(latestModal(), 'Cancelar');
    expect(host.plugin.reminders.list()).toHaveLength(0);
    await host.plugin.handleChat('Recuérdame mañana a las 7 p. m. estudiar Física');
    await clickButton(latestModal(), 'Confirmar');
    expect(host.plugin.reminders.list()).toHaveLength(1);
    expect(host.plugin.data.reminders).toHaveLength(1);
    expect((host.saved.at(-1) as { reminders: unknown[] }).reminders).toHaveLength(1);
  });

  it('keeps a failed reminder save out of persisted and live reminder state', async () => {
    const host = await start();
    await host.plugin.handleChat('Recuérdame mañana a las 7 p. m. estudiar Física');
    vi.spyOn(host.plugin, 'saveData').mockRejectedValueOnce(new Error('Disk unavailable'));
    await clickButton(latestModal(), 'Confirmar');
    expect(latestModal().contentEl.querySelector('.miauwi-error')?.textContent).toContain('Disk unavailable');
    expect(host.plugin.reminders.list()).toHaveLength(0);
    expect(host.plugin.data.reminders).toHaveLength(0);
    expect(host.saved.every(value => (value as { reminders: unknown[] }).reminders.length === 0)).toBe(true);
  });

  it('does not leak a rejected reminder draft into a settings save queued behind it', async () => {
    const host = await start();
    await host.plugin.handleChat('Recuérdame mañana a las 7 p. m. estudiar Física');
    let rejectDraft!: (error: Error) => void;
    let draftStarted = false;
    const blockedDraft = new Promise<void>((_resolve, reject) => { rejectDraft = reject; });
    vi.spyOn(host.plugin, 'saveData').mockImplementationOnce(() => { draftStarted = true; return blockedDraft; });
    [...latestModal().contentEl.querySelectorAll('button')].find(button => button.textContent === 'Confirmar')!.click();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(draftStarted).toBe(true);
    const queuedSettings = host.plugin.updateSettings({ name: 'Luna' });
    rejectDraft(new Error('Draft rejected'));
    await queuedSettings;
    await flushUi();
    const persisted = host.saved.at(-1) as { settings: { name: string }; reminders: unknown[] };
    expect(persisted.settings.name).toBe('Luna');
    expect(persisted.reminders).toHaveLength(0);
    expect(host.plugin.data.reminders).toHaveLength(0);
    expect(host.plugin.reminders.list()).toHaveLength(0);
  });
});

describe('task selection and exact-line confirmation', () => {
  const original = '# Física\r\n\r\n- [ ] Leer capítulo ^chapter\r\n- [ ] Resolver ejercicios 📅 2026-10-22\r\n\r\nTexto que debe conservarse.\r\n';

  it('requires selecting the exact task and confirming before an atomic single-line edit', async () => {
    const host = await start({ 'Study/Tasks.md': original });
    host.setActive('Study/Tasks.md');
    await host.plugin.handleChat('marca como hecha');
    expect(dialogTitle()).toContain('varias coincidencias');
    expect(host.vault.mutations).toHaveLength(0);
    await choose('Leer capítulo');
    expect(dialogTitle()).toBe('Completar: Leer capítulo');
    expect(host.vault.contents.get('Study/Tasks.md')).toBe(original);
    await clickButton(latestModal(), 'Confirmar');
    expect(host.vault.contents.get('Study/Tasks.md')).toBe('# Física\r\n\r\n- [x] Leer capítulo ✅ 2026-10-20 ^chapter\r\n- [ ] Resolver ejercicios 📅 2026-10-22\r\n\r\nTexto que debe conservarse.\r\n');
    expect(host.vault.mutations).toHaveLength(1);
  });

  it('rejects a stale selected task while preserving concurrent note changes', async () => {
    const host = await start({ 'Study/Tasks.md': original });
    host.setActive('Study/Tasks.md');
    await host.plugin.handleChat('marca como hecha');
    await choose('Leer capítulo');
    const concurrentlyEdited = original.replace('Leer capítulo', 'Leer capítulo nuevo');
    host.vault.contents.set('Study/Tasks.md', concurrentlyEdited);
    await clickButton(latestModal(), 'Confirmar');
    expect(latestModal().contentEl.querySelector('.miauwi-error')?.textContent).toMatch(/tarea cambió/i);
    expect(host.vault.contents.get('Study/Tasks.md')).toBe(concurrentlyEdited);
    expect(host.vault.mutations).toHaveLength(0);
  });

  it('links a task reminder and cancels that same reminder after unrelated line insertion and confirmed completion', async () => {
    const taskSource = '# Física\n\n- [ ] Estudiar Física 📅 2026-10-24\n\nConservar este texto.\n';
    const host = await start({ 'Study/Tasks.md': taskSource });
    host.setActive('Study/Tasks.md');
    await linkTaskReminder(host, 'Estudiar Física');
    const linked = host.plugin.reminders.list()[0];
    expect(linked).toMatchObject({ title: 'Estudiar Física', origin: 'task', notePath: 'Study/Tasks.md', status: 'active' });
    expect(linked.taskId).toBeTruthy();
    const inserted = 'Una línea nueva antes de la tarea.\n' + taskSource;
    host.vault.contents.set('Study/Tasks.md', inserted);
    host.vault.emit('modify', host.vault.getAbstractFileByPath('Study/Tasks.md'));
    await flushUi();
    expect(host.plugin.reminders.list()[0].status).toBe('active');
    await host.plugin.action('tasks');
    await choose('☐ Estudiar Física');
    await choose('Marcar como hecha');
    expect(host.plugin.reminders.list()[0].status).toBe('active');
    await clickButton(latestModal(), 'Confirmar');
    expect(host.plugin.reminders.list()).toMatchObject([{ id: linked.id, taskId: linked.taskId, notePath: 'Study/Tasks.md', status: 'cancelled' }]);
    expect(host.vault.contents.get('Study/Tasks.md')).toBe('Una línea nueva antes de la tarea.\n# Física\n\n- [x] Estudiar Física 📅 2026-10-24 ✅ 2026-10-20\n\nConservar este texto.\n');
  });

  it('cancels a linked reminder when an external editor completes its task', async () => {
    const source = '# Física\n- [ ] Estudiar Física\n';
    const host = await start({ 'Study/Tasks.md': source });
    host.setActive('Study/Tasks.md');
    await linkTaskReminder(host, 'Estudiar Física');
    const linked = host.plugin.reminders.list()[0];
    const completedExternally = 'Nuevo encabezado\n' + source.replace('[ ]', '[x]');
    host.vault.contents.set('Study/Tasks.md', completedExternally);
    host.vault.emit('modify', host.vault.getAbstractFileByPath('Study/Tasks.md'));
    await flushUi();
    expect(host.plugin.reminders.list()).toMatchObject([{ id: linked.id, status: 'cancelled' }]);
    expect(host.plugin.data.reminders[0].status).toBe('cancelled');
    expect(host.vault.contents.get('Study/Tasks.md')).toBe(completedExternally);
    expect(host.vault.mutations).toHaveLength(0);
  });

  it('keeps notes and linked reminders unchanged when Tasks proposes an intermediate status', async () => {
    const source = '- [ ] Estudiar Física 🔁 every day\n';
    const host = await start({ 'Study/Tasks.md': source });
    host.setActive('Study/Tasks.md');
    await linkTaskReminder(host, 'Estudiar Física');
    (host.app as unknown as { plugins: { plugins: Record<string, unknown> } }).plugins.plugins['obsidian-tasks-plugin'] = { apiV1: { executeToggleTaskDoneCommand: (line: string) => line.replace('[ ]', '[/]') } };
    await host.plugin.handleChat('marca como hecha Estudiar Física');
    expect(dialogTitle()).toBe('Completar: Estudiar Física');
    await clickButton(latestModal(), 'Confirmar');
    expect(latestModal().contentEl.querySelector('.miauwi-error')?.textContent).toMatch(/estado intermedio/i);
    expect(host.vault.contents.get('Study/Tasks.md')).toBe(source);
    expect(host.vault.mutations).toHaveLength(0);
    expect(host.plugin.reminders.list()[0].status).toBe('active');
  });

  it('requires an explicit HH:mm before saving a task reminder ahead of its due date', async () => {
    const host = await start({ 'Study/Tasks.md': '- [ ] Estudiar Física 📅 2026-10-24\n' });
    host.setActive('Study/Tasks.md');
    await host.plugin.action('tasks');
    await choose('☐ Estudiar Física');
    await choose('Avisar antes del vencimiento');
    await clickButton(latestModal(), 'Continuar');
    expect(latestModal().contentEl.querySelector('.miauwi-error')?.textContent).toContain('HH:mm');
    expect(host.plugin.reminders.list()).toHaveLength(0);
    fillField('Hora local (HH:mm)', '19:00');
    await clickButton(latestModal(), 'Continuar');
    expect(dialogTitle()).toBe('Confirmar recordatorio');
    expect(host.plugin.reminders.list()).toHaveLength(0);
    await clickButton(latestModal(), 'Confirmar');
    expect(host.plugin.reminders.list()).toMatchObject([{ title: 'Estudiar Física', origin: 'task', notePath: 'Study/Tasks.md', dueAt: '2026-10-22T00:00:00.000Z', status: 'active' }]);
  });
});

describe('agent context privacy at the plugin boundary', () => {
  it('filters active and linked notes by complete folder boundaries before reading or sending content', async () => {
    const ask = vi.spyOn(AgentService.prototype, 'ask').mockResolvedValue(agentReply);
    const host = await start({ 'Study/Public.md': 'PUBLIC', 'Study/Linked.md': 'LINKED', 'Study 2/Excluded.md': 'PRIVATE', '.obsidian/config.md': 'PRIVATE CONFIG' }, { agentProvider: 'codex', codexExecutable: 'C:/codex.exe', allowedFolders: ['Study'] });
    host.setActive('Study/Public.md');
    host.metadata.resolvedLinks['Study/Public.md'] = { 'Study/Linked.md': 1, 'Study 2/Excluded.md': 1, '.obsidian/config.md': 1 };
    host.vault.reads = [];
    await host.plugin.action('agent');
    expect(host.vault.reads.map(read => read.path)).toEqual(['Study/Public.md', 'Study/Linked.md']);
    expect(ask).toHaveBeenCalledOnce();
    expect(ask.mock.calls[0][1]).toEqual([{ path: 'Study/Public.md', content: 'PUBLIC' }, { path: 'Study/Linked.md', content: 'LINKED' }]);
    expect(JSON.stringify(ask.mock.calls)).not.toContain('PRIVATE');
  });

  it('blocks context-required proofreading before reading or contacting an agent for an excluded note', async () => {
    const ask = vi.spyOn(AgentService.prototype, 'ask').mockResolvedValue(agentReply);
    const host = await start({ 'Private/Diary.md': 'DO NOT SEND' }, { agentProvider: 'codex', codexExecutable: 'C:/codex.exe', allowedFolders: ['Study'] });
    host.setActive('Private/Diary.md'); host.vault.reads = [];
    await host.plugin.action('proofread');
    expect(host.vault.reads).toHaveLength(0);
    expect(ask).not.toHaveBeenCalled();
    expect(host.plugin.data.history.at(-1)?.content).toContain('Autoriza la carpeta');
  });

  it('never sends private local task replies or legacy local history as external conversation history', async () => {
    const ask = vi.spyOn(AgentService.prototype, 'ask').mockResolvedValue(agentReply);
    const host = await start({ 'Private/Tasks.md': '- [ ] Private medical research title\n', 'Study/Public.md': 'PUBLIC' }, { agentProvider: 'codex', codexExecutable: 'C:/codex.exe', allowedFolders: ['Study'] }, { history: [{ role: 'assistant', content: 'LEGACY PRIVATE CONTENT', at: new Date().toISOString() }] });
    host.setActive('Study/Public.md');
    await host.plugin.handleChat('Qué tareas tengo pendientes');
    expect(host.plugin.data.history.at(-1)?.content).toContain('Private medical research title');
    for (const modal of Modal.instances) if (modal.isOpen) modal.close();
    await host.plugin.action('agent');
    expect(ask).toHaveBeenCalledOnce();
    expect(JSON.stringify(ask.mock.calls[0])).not.toContain('Private medical');
    expect(JSON.stringify(ask.mock.calls[0])).not.toContain('LEGACY PRIVATE');
  });

  it('forgets external context history when the folder scope changes', async () => {
    const ask = vi.spyOn(AgentService.prototype, 'ask').mockResolvedValueOnce({ ...agentReply, message: 'OLD SCOPE INFORMATION' }).mockResolvedValue(agentReply);
    const host = await start({ 'Study/Public.md': 'STUDY CONTEXT', 'Other/New.md': 'NEW CONTEXT' }, { agentProvider: 'codex', codexExecutable: 'C:/codex.exe', allowedFolders: ['Study'] });
    host.setActive('Study/Public.md');
    await host.plugin.action('agent');
    await host.plugin.updateSettings({ allowedFolders: ['Other'] });
    host.setActive('Other/New.md');
    await host.plugin.action('agent');
    expect(ask).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(ask.mock.calls[1])).not.toContain('OLD SCOPE');
    expect(ask.mock.calls[1][1]).toEqual([{ path: 'Other/New.md', content: 'NEW CONTEXT' }]);
  });
});
