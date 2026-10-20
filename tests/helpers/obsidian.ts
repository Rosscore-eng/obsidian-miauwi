import type { App, Command, PluginManifest } from 'obsidian';

type Handler = (...args: unknown[]) => unknown;
type Ref = { off: () => void };
type ElementOptions = { text?: string; cls?: string; attr?: Record<string, string> };

export function installDomHelpers(): void {
  const create = function (this: HTMLElement, tag: string, options: ElementOptions = {}) {
    const element = document.createElement(tag);
    if (options.text !== undefined) element.textContent = options.text;
    if (options.cls) element.className = options.cls;
    for (const [key, value] of Object.entries(options.attr ?? {})) element.setAttribute(key, value);
    this.append(element);
    return element;
  };
  Object.defineProperties(HTMLElement.prototype, {
    createEl: { configurable: true, value: create },
    createDiv: { configurable: true, value: function (this: HTMLElement, options?: ElementOptions) { return create.call(this, 'div', options); } },
    empty: { configurable: true, value: function (this: HTMLElement) { this.replaceChildren(); } },
    addClass: { configurable: true, value: function (this: HTMLElement, ...names: string[]) { this.classList.add(...names); } },
  });
}

class Events {
  private listeners = new Map<string, Set<Handler>>();
  on(name: string, callback: Handler): Ref {
    const listeners = this.listeners.get(name) ?? new Set<Handler>();
    listeners.add(callback); this.listeners.set(name, listeners);
    return { off: () => { listeners.delete(callback); } };
  }
  emit(name: string, ...args: unknown[]): void { for (const callback of this.listeners.get(name) ?? []) callback(...args); }
  count(name: string): number { return this.listeners.get(name)?.size ?? 0; }
}

export class TFile {
  stat = { ctime: 100, mtime: 100, size: 0 };
  name: string; basename: string; extension: string;
  constructor(public path: string) {
    this.name = path.split('/').at(-1)!;
    const dot = this.name.lastIndexOf('.');
    this.basename = dot < 0 ? this.name : this.name.slice(0, dot);
    this.extension = dot < 0 ? '' : this.name.slice(dot + 1);
  }
}
export class TFolder { constructor(public path: string) {} }

export class HostVault extends Events {
  files = new Map<string, TFile | TFolder>();
  contents = new Map<string, string>();
  reads: { kind: 'read' | 'cachedRead'; path: string }[] = [];
  mutations: { path: string; before: string; after: string }[] = [];
  add(path: string, content: string): TFile { const file = new TFile(path); this.files.set(path, file); this.contents.set(path, content); return file; }
  getMarkdownFiles(): TFile[] { return [...this.files.values()].filter((file): file is TFile => file instanceof TFile && file.extension === 'md'); }
  getAbstractFileByPath(path: string): TFile | TFolder | null { return this.files.get(path) ?? null; }
  async cachedRead(file: TFile): Promise<string> { this.reads.push({ kind: 'cachedRead', path: file.path }); return this.contents.get(file.path) ?? ''; }
  async read(file: TFile): Promise<string> { this.reads.push({ kind: 'read', path: file.path }); return this.contents.get(file.path) ?? ''; }
  async process(file: TFile, transform: (current: string) => string): Promise<string> {
    const before = this.contents.get(file.path) ?? '';
    const after = transform(before); // A failed conflict check must preserve the current content.
    this.contents.set(file.path, after); file.stat.mtime++;
    this.mutations.push({ path: file.path, before, after });
    this.emit('modify', file);
    return after;
  }
  async create(path: string, content: string): Promise<TFile> { return this.add(path, content); }
  async createFolder(path: string): Promise<void> { this.files.set(path, new TFolder(path)); }
  getResourcePath(file: TFile): string { return `app://test/${file.path}`; }
}

type ViewFactory = (leaf: WorkspaceLeaf) => ItemView;
export class WorkspaceLeaf {
  view: ItemView | { getViewType: () => string } = { getViewType: () => 'markdown' };
  type = 'markdown';
  constructor(private workspace: HostWorkspace) {}
  async setViewState(state: { type: string }): Promise<void> {
    this.type = state.type;
    const factory = this.workspace.factories.get(state.type);
    if (factory) { this.view = factory(this); this.workspace.containerEl.append((this.view as ItemView).contentEl); await (this.view as ItemView).onOpen(); }
  }
  async openFile(file: TFile, options?: unknown): Promise<void> { this.workspace.opened.push({ path: file.path, options }); this.workspace.active = file; }
}
export class HostWorkspace extends Events {
  containerEl = document.createElement('div');
  active: TFile | null = null;
  opened: { path: string; options?: unknown }[] = [];
  factories = new Map<string, ViewFactory>();
  leaves: WorkspaceLeaf[] = [];
  ready: (() => void)[] = [];
  getActiveFile(): TFile | null { return this.active; }
  onLayoutReady(callback: () => void): void { this.ready.push(callback); }
  layoutReady(): void { const ready = this.ready.splice(0); ready.forEach(callback => callback()); }
  getLeavesOfType(type: string): WorkspaceLeaf[] { return this.leaves.filter(leaf => leaf.type === type); }
  getRightLeaf(): WorkspaceLeaf { const leaf = new WorkspaceLeaf(this); this.leaves.push(leaf); return leaf; }
  getLeaf(_newLeaf?: boolean): WorkspaceLeaf { return this.leaves.find(leaf => leaf.type === 'markdown') ?? this.getRightLeaf(); }
  async revealLeaf(_leaf: WorkspaceLeaf): Promise<void> {}
}

interface HostState { saved: unknown[]; loaded: unknown; workspace: HostWorkspace }
const hosts = new WeakMap<App, HostState>();
export function createHost(loaded: unknown = {}, files: Record<string, string> = {}) {
  const vault = new HostVault();
  for (const [path, content] of Object.entries(files)) vault.add(path, content);
  const workspace = new HostWorkspace();
  document.body.append(workspace.containerEl);
  const metadata = { resolvedLinks: {} as Record<string, Record<string, number>>, getFileCache: (_file: TFile) => undefined, getFirstLinkpathDest: (_link: string, _path: string) => null };
  const app = { vault, workspace, metadataCache: metadata, plugins: { plugins: {} } } as unknown as App;
  const saved: unknown[] = [];
  hosts.set(app, { loaded, saved, workspace });
  return { app, vault, workspace, metadata, saved, setActive(path: string) { workspace.active = vault.getAbstractFileByPath(path) as TFile | null; } };
}

export class Plugin {
  registeredCommands: Command[] = [];
  private intervals: number[] = [];
  private refs: Ref[] = [];
  private cleanups: (() => void)[] = [];
  constructor(public app: App, public manifest: PluginManifest) {}
  async loadData(): Promise<unknown> { return hosts.get(this.app)?.loaded; }
  async saveData(data: unknown): Promise<void> { hosts.get(this.app)?.saved.push(structuredClone(data)); }
  addCommand(command: Command): Command {
    const registered = { ...command, id: `${this.manifest.id}:${command.id}`, name: `${this.manifest.name}: ${command.name}` };
    this.registeredCommands.push(registered); return registered;
  }
  registerView(type: string, factory: ViewFactory): void { hosts.get(this.app)!.workspace.factories.set(type, factory); }
  addSettingTab(_tab: unknown): void {}
  addRibbonIcon(_icon: string, _title: string, _callback: unknown): HTMLElement { return document.createElement('button'); }
  registerEvent(ref: Ref): void { this.refs.push(ref); }
  registerInterval(interval: number): number { this.intervals.push(interval); return interval; }
  registerDomEvent(element: EventTarget, type: string, listener: EventListener): void { element.addEventListener(type, listener); this.cleanups.push(() => element.removeEventListener(type, listener)); }
  unload(): void {
    (this as unknown as { onunload?: () => void }).onunload?.();
    this.intervals.forEach(interval => window.clearInterval(interval));
    this.refs.forEach(ref => ref.off()); this.cleanups.forEach(cleanup => cleanup());
  }
}

export class Notice { static messages: string[] = []; constructor(message: string, _timeout?: number) { Notice.messages.push(message); } }
export const Platform = { isDesktopApp: true };
export function normalizePath(path: string): string { return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, ''); }
export class Menu {
  addItem(callback: (item: { setTitle: (title: string) => { onClick: (callback: () => void) => void } }) => void): this { callback({ setTitle: _title => ({ onClick: _handler => {} }) }); return this; }
  showAtMouseEvent(_event: MouseEvent): void {}
}

const uiJobs = new Set<Promise<unknown>>();
function runUi(callback: () => unknown): void {
  const job = Promise.resolve().then(callback);
  uiJobs.add(job); void job.finally(() => uiJobs.delete(job)).catch(() => {});
}
export async function flushUi(): Promise<void> { while (uiJobs.size) await Promise.all([...uiJobs]); for (let i = 0; i < 12; i++) await Promise.resolve(); }

export class Modal {
  static instances: Modal[] = [];
  contentEl = document.createElement('div');
  isOpen = false;
  constructor(public app: App) {}
  open(): void { this.isOpen = true; Modal.instances.push(this); document.body.append(this.contentEl); this.onOpen(); }
  close(): void { this.isOpen = false; this.onClose(); this.contentEl.remove(); }
  onOpen(): void {}
  onClose(): void {}
}
export function latestModal(): Modal { const modal = [...Modal.instances].reverse().find(modal => modal.isOpen); if (!modal) throw new Error('Expected an open dialog'); return modal; }
export async function clickButton(modal: Modal, text: string): Promise<void> {
  const button = [...modal.contentEl.querySelectorAll('button')].find(button => button.textContent === text);
  if (!button) throw new Error(`Missing dialog button: ${text}`);
  button.click(); await flushUi();
}

class TextInput {
  inputEl: HTMLInputElement | HTMLTextAreaElement;
  constructor(container: HTMLElement, multiline = false) { this.inputEl = document.createElement(multiline ? 'textarea' : 'input'); container.append(this.inputEl); }
  setValue(value: string): this { this.inputEl.value = value; return this; }
  setPlaceholder(value: string): this { this.inputEl.placeholder = value; return this; }
  onChange(callback: (value: string) => unknown): this { this.inputEl.addEventListener('input', () => callback(this.inputEl.value)); return this; }
}
class Button {
  buttonEl = document.createElement('button');
  constructor(container: HTMLElement) { container.append(this.buttonEl); }
  setButtonText(text: string): this { this.buttonEl.textContent = text; return this; }
  setCta(): this { this.buttonEl.classList.add('mod-cta'); return this; }
  setDisabled(value: boolean): this { this.buttonEl.disabled = value; return this; }
  onClick(callback: () => unknown): this { this.buttonEl.addEventListener('click', () => runUi(callback)); return this; }
}
export class Setting {
  settingEl = document.createElement('div');
  nameEl = document.createElement('div');
  descEl = document.createElement('div');
  constructor(container: HTMLElement) { this.settingEl.className = 'setting-item'; this.nameEl.className = 'setting-item-name'; this.descEl.className = 'setting-item-description'; this.settingEl.append(this.nameEl, this.descEl); container.append(this.settingEl); }
  setName(name: string): this { this.nameEl.textContent = name; return this; }
  setDesc(description: string): this { this.descEl.textContent = description; return this; }
  addButton(callback: (button: Button) => unknown): this { callback(new Button(this.settingEl)); return this; }
  addText(callback: (input: TextInput) => unknown): this { callback(new TextInput(this.settingEl)); return this; }
  addTextArea(callback: (input: TextInput) => unknown): this { callback(new TextInput(this.settingEl, true)); return this; }
}
export class ItemView {
  contentEl = document.createElement('div');
  constructor(public leaf: WorkspaceLeaf) {}
  async onOpen(): Promise<void> {}
  registerDomEvent(element: EventTarget, type: string, listener: EventListener): void { element.addEventListener(type, listener); }
}
export class PluginSettingTab { containerEl = document.createElement('div'); constructor(public app: App, public plugin: Plugin) {} }
