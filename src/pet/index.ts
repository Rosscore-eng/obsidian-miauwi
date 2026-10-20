import { clamp, clampPosition, nearestSurface, surfaceFromRect, viewportGround, type Point, type Surface, type Viewport } from './geometry';
import { canTransition, chooseBehavior, chooseLocalPhrase, getPersonality, isMovingState, type PersonalityProfile, type PetState } from './behavior';
import { createCatArt } from './art';
export * from './geometry';
export * from './behavior';

export interface SkinPack {
  url: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  states: Partial<Record<PetState, { row: number; frames: number; fps: number }>>;
}
export interface PetOptions {
  name: string;
  size: number;
  speed: number;
  activity: number;
  personality: string;
  reducedMotion: boolean;
  idleMinutes: number;
  sleepScene: boolean;
  profiles?: Record<string, PersonalityProfile>;
  skin?: SkinPack;
  quiet?: boolean;
  onInteract: () => void;
  onMenu: (event: MouseEvent) => void;
  onActivity?: () => void;
}
interface Motion { from: Point; to: Point; start: number; duration: number; arc: number; state: PetState; surface: string }
interface Drag { pointer: number; start: Point; origin: Point; moved: boolean }
const SURFACE_SELECTORS = [['.nav-folder-title', 'folder'], ['.nav-file-title', 'file'],
  ['.workspace-tab-header', 'tab'], ['.workspace-leaf', 'leaf']] as const;

/** Owns only its overlay. All host nodes are read/observed, never changed. */
export class PetController {
  private readonly doc: Document;
  private readonly win: Window & typeof globalThis;
  private readonly overlay: HTMLDivElement;
  private readonly cat: HTMLButtonElement;
  private readonly skin: HTMLSpanElement;
  private readonly bubble: HTMLDivElement;
  private readonly bubbleText: HTMLSpanElement;
  private readonly disposers: (() => void)[] = [];
  private readonly timers = new Set<number>();
  private observer?: MutationObserver;
  private resizeObserver?: ResizeObserver;
  private observedSurfaces = new Set<Element>();
  private readonly surfaceIds = new WeakMap<Element, string>();
  private surfaceCounter = 0;
  private surfaces: Surface[] = [];
  private support = 'ground';
  private options: PetOptions;
  private state: PetState = 'hide';
  private position: Point = { x: 0, y: 0 };
  private pointer: Point | null = null;
  private drag: Drag | null = null;
  private motion: Motion | null = null;
  private frame: number | null = null;
  private decisionTimer: number | null = null;
  private actionTimer: number | null = null;
  private bubbleTimer: number | null = null;
  private geometryTimer: number | null = null;
  private lastFrame = 0;
  private lastActivity = Date.now();
  private lastPhraseAt?: number;
  private lastPhrase?: string;
  private suppressClickUntil = 0;
  private visible = false;
  private destroyed = false;
  private focused = false;
  private manuallySleeping = false;
  private systemReducedMotion = false;
  private initialized = false;

  constructor(container: HTMLElement, options: PetOptions) {
    this.doc = container.ownerDocument;
    const win = this.doc.defaultView;
    if (!win) throw new Error('Miauwi necesita una ventana activa.');
    this.win = win;
    this.options = this.normalize(options);
    this.overlay = this.doc.createElement('div');
    this.overlay.className = 'miauwi-overlay';
    this.overlay.hidden = true;
    this.cat = this.doc.createElement('button');
    this.cat.type = 'button';
    this.cat.className = 'miauwi-cat';
    this.cat.setAttribute('aria-haspopup', 'dialog');
    this.cat.append(createCatArt(this.doc));
    this.skin = this.doc.createElement('span');
    this.skin.className = 'miauwi-custom-skin';
    this.skin.setAttribute('aria-hidden', 'true');
    this.cat.append(this.skin);
    this.bubble = this.doc.createElement('div');
    this.bubble.className = 'miauwi-bubble';
    this.bubble.hidden = true;
    this.bubble.setAttribute('role', 'status');
    this.bubble.setAttribute('aria-live', 'polite');
    this.bubbleText = this.doc.createElement('span');
    const dismiss = this.doc.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'miauwi-bubble-dismiss';
    dismiss.textContent = '×';
    dismiss.setAttribute('aria-label', 'Cerrar mensaje de la mascota');
    this.bubble.append(this.bubbleText, dismiss);
    this.overlay.append(this.cat, this.bubble);
    container.append(this.overlay);
    this.listen(dismiss, 'click', () => this.dismissBubble());
    this.listen(this.cat, 'click', () => this.interact());
    this.listen(this.cat, 'contextmenu', event => {
      event.preventDefault();
      this.options.onMenu(event as MouseEvent);
    });
    this.listen(this.cat, 'pointerdown', event => this.startDrag(event as PointerEvent));
    this.listen(this.doc, 'pointermove', event => this.pointerMove(event as PointerEvent), { passive: false });
    this.listen(this.doc, 'pointerup', event => this.finishDrag(event as PointerEvent));
    this.listen(this.doc, 'pointercancel', event => this.finishDrag(event as PointerEvent));
    this.listen(this.cat, 'lostpointercapture', event => this.finishDrag(event as PointerEvent));
    this.listen(this.doc, 'keydown', event => {
      this.activity();
      if ((event as KeyboardEvent).key === 'Escape') this.dismissBubble();
    }, { passive: true });
    this.listen(this.doc, 'pointerdown', () => this.activity(), { passive: true });
    this.listen(this.doc, 'click', event => this.hostClick(event), { passive: true });
    this.listen(this.doc, 'visibilitychange', () => this.visibilityChanged());
    this.listen(this.win, 'resize', () => this.queueGeometry(), { passive: true });
    this.listen(this.doc, 'scroll', () => this.queueGeometry(), { passive: true, capture: true });
    this.listen(this.doc, 'transitionend', () => this.queueGeometry(), { passive: true });
    if (typeof this.win.matchMedia === 'function') {
      const media = this.win.matchMedia('(prefers-reduced-motion: reduce)');
      this.systemReducedMotion = media.matches;
      const changed = (): void => { this.systemReducedMotion = media.matches; this.applyOptions(); };
      if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', changed);
        this.disposers.push(() => media.removeEventListener('change', changed));
      } else if (typeof media.addListener === 'function') {
        media.addListener(changed);
        this.disposers.push(() => media.removeListener(changed));
      }
    }
    if (typeof this.win.MutationObserver === 'function' && this.doc.body) {
      this.observer = new this.win.MutationObserver(records => {
        if (records.some(record => !this.overlay.contains(record.target))) this.queueGeometry();
      });
      this.observer.observe(this.doc.body, { childList: true, subtree: true, attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'aria-expanded'] });
    }
    if (typeof this.win.ResizeObserver === 'function') {
      this.resizeObserver = new this.win.ResizeObserver(() => this.queueGeometry());
      this.resizeObserver.observe(this.doc.documentElement);
    }
    this.applyOptions();
    this.measureSurfaces();
  }

  show(): void {
    if (this.destroyed) return;
    this.visible = true;
    this.overlay.hidden = false;
    this.measureSurfaces();
    if (!this.initialized) {
      const ground = this.ground();
      this.position = clampPosition({ x: ground.right - this.size() - 28, y: ground.y - this.size() }, this.size(), this.viewport());
      this.initialized = true;
    }
    this.setState(this.manuallySleeping ? 'sleep' : this.focused ? 'sit' : 'idle', true);
    this.render();
    this.scheduleDecision();
  }

  hide(): void {
    if (this.destroyed) return;
    this.visible = false;
    this.drag = null;
    this.stopAutonomy();
    this.clear(this.geometryTimer); this.geometryTimer = null;
    this.dismissBubble();
    this.overlay.hidden = true;
    this.setState('hide', true);
  }

  sleep(): void {
    if (this.destroyed) return;
    this.manuallySleeping = true;
    this.stopAutonomy();
    this.setState('sleep', true);
  }

  wake(): void {
    if (this.destroyed) return;
    this.manuallySleeping = false;
    this.lastActivity = Date.now();
    this.stopAutonomy();
    this.setState('wake', true);
    if (this.visible && !this.doc.hidden) this.actionTimer = this.later(() => {
      this.actionTimer = null;
      this.setState(this.focused ? 'sit' : 'idle');
      this.scheduleDecision();
    }, this.reduced() ? 100 : 900);
  }

  celebrate(): void {
    if (this.destroyed || !this.visible) return;
    if (this.state === 'sleep') { this.wake(); return; }
    this.perform('celebrate', this.reduced() ? 800 : 1500);
  }

  say(message: string, urgent = false): void {
    if (this.destroyed || !message.trim()) return;
    this.bubbleText.textContent = message.slice(0, 1200);
    this.bubble.setAttribute('aria-live', urgent ? 'assertive' : 'polite');
    this.bubble.hidden = false;
    this.overlay.dataset.urgent = String(urgent);
    this.clear(this.bubbleTimer);
    this.bubbleTimer = this.later(() => this.dismissBubble(), urgent ? 22000 : 10000);
    if (urgent && this.state === 'sleep') this.wake();
    this.render();
  }

  focus(enabled: boolean): void {
    this.focused = enabled;
    if (this.destroyed || !this.visible || this.state === 'sleep') return;
    this.stopAutonomy();
    this.setState(enabled ? 'sit' : 'idle', true);
    this.scheduleDecision();
  }

  update(options: Partial<PetOptions>): void {
    if (this.destroyed) return;
    this.options = this.normalize({ ...this.options, ...options });
    this.applyOptions();
    this.measureSurfaces();
    this.render();
    this.scheduleDecision();
  }

  reactToNote(): void {
    if (this.destroyed || !this.visible || this.focused || this.state === 'sleep' || this.drag) return;
    this.activity();
    const reaction = getPersonality(this.options.personality, this.options.profiles).reactions.note;
    this.perform(['look', 'peek', 'celebrate', 'sit'].includes(reaction ?? '') ? reaction as PetState : 'look', 1600);
    this.maybeSpeak();
  }

  getState(): PetState { return this.state; }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.visible = false;
    this.stopAutonomy();
    for (const timer of this.timers) this.win.clearTimeout(timer);
    this.timers.clear();
    this.observer?.disconnect();
    this.resizeObserver?.disconnect();
    this.observedSurfaces.clear();
    this.disposers.splice(0).forEach(dispose => dispose());
    this.overlay.remove();
    this.drag = null;
    this.surfaces = [];
  }

  private normalize(options: PetOptions): PetOptions {
    return { ...options, name: String(options.name || 'Miauwi').trim().slice(0, 40) || 'Miauwi',
      size: clamp(options.size, 32, 160), speed: clamp(options.speed, 0.25, 3), activity: clamp(options.activity, 0, 1),
      idleMinutes: clamp(options.idleMinutes, 1, 240) };
  }
  private viewport(): Viewport { return { left: 0, top: 0, right: this.win.innerWidth || 800, bottom: this.win.innerHeight || 600 }; }
  private ground(): Surface { return viewportGround(this.viewport(), 14); }
  private size(): number { return Math.max(12, Math.min(this.options.size, this.viewport().right - 4, this.viewport().bottom - 4)); }
  private reduced(): boolean { return this.options.reducedMotion || this.systemReducedMotion; }

  private applyOptions(): void {
    this.cat.setAttribute('aria-label', `${this.options.name}: acariciar y abrir conversación`);
    this.cat.title = `${this.options.name} · Arrastra para mover · Clic derecho para opciones`;
    this.overlay.dataset.reducedMotion = String(this.reduced());
    this.overlay.dataset.sleepScene = String(this.options.sleepScene);
    this.overlay.style.setProperty('--miauwi-size', `${this.size()}px`);
    this.applySkin();
    if (this.reduced() && this.motion) {
      this.stopAutonomy();
      this.position = clampPosition({ x: this.position.x, y: this.ground().y - this.size() }, this.size(), this.viewport());
      this.support = 'ground';
      this.setState(this.focused ? 'sit' : 'idle', true);
      this.render();
      this.scheduleDecision();
    }
  }

  private listen(target: EventTarget, type: string, handler: EventListener, options?: AddEventListenerOptions): void {
    target.addEventListener(type, handler, options);
    this.disposers.push(() => target.removeEventListener(type, handler, options));
  }
  private later(callback: () => void, delay: number): number {
    const timer = this.win.setTimeout(() => { this.timers.delete(timer); if (!this.destroyed) callback(); }, delay);
    this.timers.add(timer);
    return timer;
  }
  private clear(timer: number | null): void { if (timer !== null) { this.win.clearTimeout(timer); this.timers.delete(timer); } }
  private stopMotion(): void {
    if (this.frame !== null) this.win.cancelAnimationFrame(this.frame);
    this.frame = null;
    this.motion = null;
    this.lastFrame = 0;
  }
  private stopAutonomy(): void {
    this.stopMotion();
    this.clear(this.decisionTimer); this.decisionTimer = null;
    this.clear(this.actionTimer); this.actionTimer = null;
  }
  private setState(next: PetState, force = false): void {
    if (!force && !canTransition(this.state, next)) return;
    this.state = next;
    this.overlay.dataset.state = next;
    this.applySkin();
    this.cat.setAttribute('aria-description', next === 'sleep' ? 'Está durmiendo. Actívalo para despertarlo.' : 'Mascota de escritorio interactiva.');
  }
  private activity(): void {
    if (this.destroyed) return;
    this.lastActivity = Date.now();
    this.options.onActivity?.();
    if (this.state === 'sleep' && !this.manuallySleeping && this.visible) this.wake();
  }
  private interact(): void {
    if (this.destroyed || Date.now() < this.suppressClickUntil) return;
    const asleep = this.state === 'sleep';
    this.activity();
    if (asleep) this.wake();
    else if (this.state !== 'wake') this.celebrate();
    this.maybeSpeak();
    this.options.onInteract();
  }
  private maybeSpeak(): void {
    if (this.destroyed || !this.visible || this.doc.hidden || this.state === 'sleep' || !this.bubble.hidden) return;
    const phrase = chooseLocalPhrase(getPersonality(this.options.personality, this.options.profiles), {
      now: Date.now(), focus: this.focused, quiet: this.options.quiet === true,
      lastSpokenAt: this.lastPhraseAt, lastPhrase: this.lastPhrase
    });
    if (!phrase) return;
    this.lastPhraseAt = Date.now();
    this.lastPhrase = phrase;
    this.say(phrase);
  }
  private dismissBubble(): void {
    this.bubble.hidden = true;
    this.clear(this.bubbleTimer); this.bubbleTimer = null;
  }
  private scheduleDecision(delay?: number): void {
    this.clear(this.decisionTimer); this.decisionTimer = null;
    if (!this.visible || this.destroyed || this.doc.hidden || this.manuallySleeping || this.drag || this.motion) return;
    this.decisionTimer = this.later(() => { this.decisionTimer = null; this.decide(); },
      delay ?? (this.focused ? 12000 : 3200 + Math.random() * 4200 / Math.max(0.2, this.options.activity)));
  }
  private decide(): void {
    if (!this.visible || this.destroyed || this.doc.hidden || this.drag) return;
    const state = chooseBehavior({ focus: this.focused, reducedMotion: this.reduced(), activity: this.options.activity,
      inactiveMs: Date.now() - this.lastActivity, idleMinutes: this.options.idleMinutes,
      personality: this.options.personality, surfaces: this.surfaces.length, profiles: this.options.profiles });
    if (state === 'sleep') { this.stopAutonomy(); this.setState('sleep', true); return; }
    if (isMovingState(state) || state === 'jump' || state === 'climb') this.moveFor(state);
    else this.perform(state, state === 'sit' ? 6000 : state === 'hang' ? 2000 : 1500 + Math.random() * 1700);
  }
  private perform(state: PetState, duration: number): void {
    this.stopAutonomy();
    this.setState(state, true);
    this.actionTimer = this.later(() => {
      this.actionTimer = null;
      if (!this.visible || this.drag) return;
      this.setState(this.focused ? 'sit' : 'idle', true);
      this.scheduleDecision();
    }, duration);
  }

  private moveFor(state: PetState): void {
    if (this.reduced() || this.focused) { this.perform('sit', 4000); return; }
    const size = this.size();
    const ground = this.ground();
    const current = this.surfaces.find(surface => surface.id === this.support) ?? ground;
    let target = current;
    if (state === 'jump' || state === 'climb') {
      const candidates = this.surfaces.filter(surface => surface.y >= size
        && (state === 'climb' || Math.abs(surface.y - this.position.y - size) < 330));
      target = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)]! : ground;
    }
    const minX = Math.max(0, target.left);
    const maxX = Math.max(minX, target.right - size);
    const x = state === 'chase' && this.pointer ? clamp(this.pointer.x - size / 2, minX, maxX)
      : minX + Math.random() * (maxX - minX);
    const to = clampPosition({ x, y: target.y - size }, size, this.viewport());
    if (Math.hypot(to.x - this.position.x, to.y - this.position.y) < 12) { this.perform('look', 1600); return; }
    if (Math.abs(to.y - this.position.y) > 4 && state !== 'climb') state = to.y > this.position.y + 140 ? 'fall' : 'jump';
    const speed = 58 * this.options.speed * getPersonality(this.options.personality, this.options.profiles).speed * (state === 'run' || state === 'chase' ? 2.2 : 1);
    const distance = Math.hypot(to.x - this.position.x, to.y - this.position.y);
    const duration = state === 'jump' ? clamp(distance * 2.2, 550, 1300) : clamp(distance / speed * 1000, 650, 7000);
    this.animateTo(to, state, duration, target.id, state === 'jump' ? Math.min(85, 30 + distance * 0.15) : 0);
  }
  private animateTo(to: Point, state: PetState, duration: number, surface: string, arc = 0): void {
    this.stopAutonomy();
    this.motion = { from: { ...this.position }, to, start: this.win.performance.now(), duration, arc, state, surface };
    this.overlay.dataset.facing = to.x < this.position.x ? 'left' : 'right';
    this.setState(state, true);
    this.frame = this.win.requestAnimationFrame(time => this.tick(time));
  }
  private tick(time: number): void {
    this.frame = null;
    const motion = this.motion;
    if (!motion || this.destroyed || !this.visible || this.doc.hidden) return;
    if (time - this.lastFrame < 1000 / 30) { this.frame = this.win.requestAnimationFrame(next => this.tick(next)); return; }
    this.lastFrame = time;
    const progress = clamp((time - motion.start) / motion.duration, 0, 1);
    const yProgress = motion.state === 'fall' ? progress * progress : progress;
    this.position = clampPosition({ x: motion.from.x + (motion.to.x - motion.from.x) * progress,
      y: motion.from.y + (motion.to.y - motion.from.y) * yProgress - Math.sin(progress * Math.PI) * motion.arc }, this.size(), this.viewport());
    this.render();
    if (progress >= 1) {
      this.support = motion.surface;
      this.motion = null;
      this.setState(this.focused ? 'sit' : 'idle', true);
      this.scheduleDecision();
    } else this.frame = this.win.requestAnimationFrame(next => this.tick(next));
  }
  private fall(): void {
    const size = this.size();
    const target = nearestSurface(this.position, size, this.surfaces, this.ground());
    const to = clampPosition({ x: this.position.x, y: target.y - size }, size, this.viewport());
    this.support = target.id;
    if (Math.abs(to.y - this.position.y) < 2 || this.reduced() || this.focused) {
      this.stopAutonomy(); this.position = to; this.setState(this.focused ? 'sit' : 'idle', true); this.render(); this.scheduleDecision();
    } else this.animateTo(to, 'fall', clamp(Math.sqrt(Math.abs(to.y - this.position.y) / 500) * 1000, 200, 1100), target.id);
  }

  private startDrag(event: PointerEvent): void {
    if (event.button !== 0 || !this.visible || this.destroyed) return;
    this.stopAutonomy();
    this.drag = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: { ...this.position }, moved: false };
    try { this.cat.setPointerCapture?.(event.pointerId); } catch { /* A detached popout may lose capture. */ }
  }
  private pointerMove(event: PointerEvent): void {
    if (this.destroyed) return;
    this.pointer = { x: event.clientX, y: event.clientY };
    const drag = this.drag;
    if (drag && event.pointerId === drag.pointer) {
      const dx = event.clientX - drag.start.x;
      const dy = event.clientY - drag.start.y;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      drag.moved = true;
      event.preventDefault();
      this.manuallySleeping = false;
      this.setState('drag', true);
      this.position = clampPosition({ x: drag.origin.x + dx, y: drag.origin.y + dy }, this.size(), this.viewport());
      this.render();
    } else if (this.visible && this.state !== 'sleep' && !this.reduced()) {
      const centerX = this.position.x + this.size() * 0.5;
      const centerY = this.position.y + this.size() * 0.4;
      this.overlay.style.setProperty('--miauwi-gaze-x', `${clamp((event.clientX - centerX) / 100, -2, 2)}px`);
      this.overlay.style.setProperty('--miauwi-gaze-y', `${clamp((event.clientY - centerY) / 150, -1.4, 1.4)}px`);
    }
  }
  private finishDrag(event: PointerEvent): void {
    if (!this.drag || event.pointerId !== this.drag.pointer) return;
    const drag = this.drag;
    this.drag = null;
    try { if (this.cat.hasPointerCapture?.(drag.pointer)) this.cat.releasePointerCapture(drag.pointer); } catch { /* Capture already released. */ }
    if (drag.moved) {
      this.suppressClickUntil = Date.now() + 450;
      this.activity();
      this.fall();
    } else this.scheduleDecision();
  }
  private hostClick(event: Event): void {
    if (this.destroyed || !this.visible || this.focused || this.state === 'sleep' || this.drag) return;
    const target = event.target;
    if (!(target instanceof this.win.Element) || this.overlay.contains(target)) return;
    if (target.closest('.nav-folder-title')) {
      this.queueGeometry();
      this.perform(this.reduced() ? 'look' : 'peek', 1400);
      this.maybeSpeak();
    } else if (target.closest('.nav-file-title, .workspace-tab-header')) this.reactToNote();
  }

  private queueGeometry(): void {
    if (this.destroyed || !this.visible || this.doc.hidden || this.geometryTimer !== null) return;
    this.geometryTimer = this.later(() => { this.geometryTimer = null; this.measureSurfaces(); }, 140);
  }
  private measureSurfaces(): void {
    if (this.destroyed) return;
    const viewport = this.viewport();
    const size = this.size();
    const next: Surface[] = [];
    const observed = new Set<Element>();
    for (const [selector, kind] of SURFACE_SELECTORS) {
      for (const element of this.doc.querySelectorAll(selector)) {
        if (this.overlay.contains(element)) continue;
        const style = this.win.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || element.closest('[hidden], .is-collapsed .nav-folder-children')) continue;
        let id = this.surfaceIds.get(element);
        if (!id) { id = `surface-${++this.surfaceCounter}`; this.surfaceIds.set(element, id); }
        const surface = surfaceFromRect(element.getBoundingClientRect(), kind, id, viewport, size);
        if (surface) {
          next.push(surface);
          observed.add(element);
          if (!this.observedSurfaces.has(element)) this.resizeObserver?.observe(element);
        }
      }
    }
    for (const element of this.observedSurfaces) if (!observed.has(element)) this.resizeObserver?.unobserve(element);
    this.observedSurfaces = observed;
    this.surfaces = next;
    this.position = clampPosition(this.position, size, viewport);
    this.overlay.style.setProperty('--miauwi-size', `${size}px`);
    this.applySkin();
    const support = next.find(surface => surface.id === this.support) ?? (this.support === 'ground' ? this.ground() : null);
    if (this.visible && this.initialized && !this.drag) {
      if (this.motion) {
        const target = this.motion.surface === 'ground' ? this.ground() : next.find(surface => surface.id === this.motion?.surface);
        const targetCenter = this.motion.to.x + size / 2;
        if (!target || Math.abs(this.motion.to.y + size - target.y) > 2 || targetCenter < target.left
          || targetCenter > target.right || this.motion.to.x + size > viewport.right || this.motion.to.y + size > viewport.bottom) this.fall();
      } else if (!support || Math.abs(this.position.y + size - support.y) > 2
        || this.position.x + size / 2 < support.left || this.position.x + size / 2 > support.right) {
        if (this.state === 'sleep') {
          this.position = clampPosition({ x: this.position.x, y: this.ground().y - size }, size, viewport);
          this.support = 'ground';
        } else this.fall();
      }
    }
    this.render();
  }
  private visibilityChanged(): void {
    if (this.doc.hidden) {
      this.stopAutonomy();
      this.clear(this.geometryTimer); this.geometryTimer = null;
      this.clear(this.bubbleTimer); this.bubbleTimer = null;
      if (isMovingState(this.state)) this.setState('idle', true);
      this.overlay.dataset.paused = 'true';
    } else {
      this.overlay.dataset.paused = 'false';
      this.measureSurfaces();
      if (!this.bubble.hidden) this.bubbleTimer = this.later(() => this.dismissBubble(), 10000);
      this.scheduleDecision(800);
    }
  }
  private render(): void {
    this.cat.style.transform = `translate3d(${Math.round(this.position.x)}px, ${Math.round(this.position.y)}px, 0)`;
    const width = Math.min(280, Math.max(120, this.viewport().right - 24));
    this.bubble.style.maxWidth = `${width}px`;
    this.bubble.style.left = `${clamp(this.position.x + this.size() / 2 - width / 2, 12, this.viewport().right - width - 12)}px`;
    if (this.position.y < 160) {
      const top = clamp(this.position.y + this.size() + 8, 12, this.viewport().bottom - 80);
      this.bubble.style.top = `${top}px`;
      this.bubble.style.bottom = 'auto';
      this.bubble.style.maxHeight = `${Math.max(24, Math.min(260, this.viewport().bottom - top - 12))}px`;
    } else {
      this.bubble.style.top = 'auto';
      this.bubble.style.bottom = `${Math.max(12, this.viewport().bottom - this.position.y + 8)}px`;
      this.bubble.style.maxHeight = `${Math.min(260, this.position.y - 20)}px`;
    }
  }

  private applySkin(): void {
    const pack = this.options.skin;
    const frames = pack?.states?.[this.state] ?? pack?.states?.idle;
    const valid = pack && frames && typeof pack.url === 'string' && pack.url.length < 4096
      && !/^(?:https?:|data:|javascript:)/i.test(pack.url)
      && Number.isInteger(pack.columns) && pack.columns > 0 && pack.columns <= 128
      && [pack.frameWidth, pack.frameHeight].every(value => Number.isInteger(value) && value > 0 && value <= 4096)
      && Number.isInteger(frames.row) && frames.row >= 0 && frames.row <= 255
      && Number.isInteger(frames.frames) && frames.frames > 0 && frames.frames <= pack.columns
      && Number.isFinite(frames.fps) && frames.fps > 0 && frames.fps <= 30;
    this.overlay.dataset.skin = valid ? 'custom' : 'original';
    if (!valid || !pack || !frames) { this.skin.style.backgroundImage = ''; return; }
    const rows = Math.max(1, ...Object.values(pack.states).map(state =>
      state && Number.isInteger(state.row) && state.row >= 0 && state.row <= 255 ? state.row + 1 : 1));
    this.skin.style.backgroundImage = `url(${JSON.stringify(pack.url)})`;
    this.skin.style.backgroundSize = `${pack.columns * this.size()}px ${rows * this.size()}px`;
    this.skin.style.setProperty('--miauwi-sprite-y', `${-frames.row * this.size()}px`);
    this.skin.style.setProperty('--miauwi-sprite-end', `${-frames.frames * this.size()}px`);
    this.skin.style.setProperty('--miauwi-sprite-frames', String(frames.frames));
    this.skin.style.setProperty('--miauwi-sprite-duration', `${frames.frames / frames.fps}s`);
  }
}
