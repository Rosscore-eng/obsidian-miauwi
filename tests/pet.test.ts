// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PetController, canTransition, chooseBehavior, chooseLocalPhrase, clampPosition, nearestSurface,
  validatePersonalityProfiles, viewportGround, type PetOptions, type Surface, type SkinPack
} from '../src/pet';

const viewport = { left: 0, top: 0, right: 600, bottom: 400 };
const shelf: Surface = { id: 'folder', left: 10, right: 230, y: 120, kind: 'folder' };
const ground = viewportGround(viewport, 12);
const baseOptions = (): PetOptions => ({ name: 'Miauwi', size: 60, speed: 1, activity: 0.5,
  personality: 'curioso', reducedMotion: false, idleMinutes: 5, sleepScene: true,
  onInteract: vi.fn(), onMenu: vi.fn() });

describe('safe pet geometry', () => {
  it('keeps the whole cat inside a viewport, including tiny windows', () => {
    expect(clampPosition({ x: 900, y: -40 }, 60, viewport)).toEqual({ x: 540, y: 0 });
    expect(clampPosition({ x: -4, y: 60 }, 60, { left: 0, top: 0, right: 30, bottom: 20 }))
      .toEqual({ x: 0, y: 0 });
  });
  it('lands on a reachable shelf beneath the cat and falls back when it disappears', () => {
    expect(nearestSurface({ x: 55, y: 20 }, 60, [shelf], ground).id).toBe('folder');
    expect(nearestSurface({ x: 55, y: 20 }, 60, [], ground).id).toBe('ground');
    expect(nearestSurface({ x: 500, y: 20 }, 60, [shelf], ground).id).toBe('ground');
  });
  it('does not land on a surface above its feet', () => {
    expect(nearestSurface({ x: 55, y: 160 }, 60, [shelf], ground).id).toBe('ground');
  });
});

describe('interruptible behavior and editable personalities', () => {
  it('gives inactivity sleep priority over autonomous movement', () => {
    expect(chooseBehavior({ focus: false, reducedMotion: false, activity: 1,
      inactiveMs: 301000, idleMinutes: 5, personality: 'jugueton', surfaces: 4 }, 0.8)).toBe('sleep');
  });
  it('keeps focus and reduced-motion choices still', () => {
    const context = { focus: true, reducedMotion: false, activity: 1, inactiveMs: 0,
      idleMinutes: 5, personality: 'jugueton', surfaces: 4 };
    expect(chooseBehavior(context, 0.7)).toBe('sit');
    expect(['sit', 'look', 'idle']).toContain(chooseBehavior({ ...context, focus: false, reducedMotion: true }, 0.7));
  });
  it('only wakes a sleeping cat through an explicit interrupt', () => {
    expect(canTransition('sleep', 'walk')).toBe(false);
    expect(canTransition('sleep', 'wake')).toBe(true);
    expect(canTransition('walk', 'drag')).toBe(true);
    expect(canTransition('hide', 'idle')).toBe(true);
  });
  it('rejects malformed profile data and accepts usable custom weights', () => {
    expect(validatePersonalityProfiles('{broken').valid).toBe(false);
    expect(validatePersonalityProfiles({ bad: { label: 'Bad', weights: { walk: -1 } } }).valid).toBe(false);
    const result = validatePersonalityProfiles({ zen: { label: 'Zen', activity: 0.2,
      speed: 0.8, idleMinutes: 8, weights: { sit: 8, walk: 1 } } });
    expect(result.valid).toBe(true);
    expect(result.profiles.zen?.weights.sit).toBe(8);
  });
  it('uses edited profile weights when selecting autonomous behavior', () => {
    const custom = validatePersonalityProfiles({ zen: { label: 'Zen', weights: { stretch: 10 } } });
    expect(chooseBehavior({ focus: false, reducedMotion: false, activity: 1,
      inactiveMs: 0, idleMinutes: 8, personality: 'zen', surfaces: 0, profiles: custom.profiles }, 0.4)).toBe('stretch');
  });
  it('uses the default profile for unknown names including inherited object keys', () => {
    expect(chooseBehavior({ focus: false, reducedMotion: false, activity: 1,
      inactiveMs: 0, idleMinutes: 8, personality: 'constructor', surfaces: 0 }, 0)).toBe('idle');
  });
});

describe('local varied dialogue', () => {
  const social = () => validatePersonalityProfiles({ social: { label: 'Sociable', sociability: 1,
    jokeFrequency: 1, phrases: ['Una idea a la vez.', 'Aquí estoy contigo.'] } }).profiles.social!;

  it('enforces a cooldown and avoids the previous phrase after it expires', () => {
    const profile = social();
    expect(chooseLocalPhrase(profile, { now: 100000, focus: false, quiet: false }, 0)).toBe('Una idea a la vez.');
    expect(chooseLocalPhrase(profile, { now: 110000, lastSpokenAt: 100000,
      lastPhrase: 'Una idea a la vez.', focus: false, quiet: false }, 0)).toBeNull();
    expect(chooseLocalPhrase(profile, { now: 146000, lastSpokenAt: 100000,
      lastPhrase: 'Una idea a la vez.', focus: false, quiet: false }, 0)).toBe('Aquí estoy contigo.');
  });

  it('suppresses chatter in focus and quiet hours', () => {
    expect(chooseLocalPhrase(social(), { now: 100000, focus: true, quiet: false }, 0)).toBeNull();
    expect(chooseLocalPhrase(social(), { now: 100000, focus: false, quiet: true }, 0)).toBeNull();
  });

  it('uses sociability and joke frequency to regulate spontaneous dialogue', () => {
    const profile = social();
    expect(chooseLocalPhrase({ ...profile, sociability: 0 }, { now: 100000, focus: false, quiet: false }, 0)).toBeNull();
    expect(chooseLocalPhrase({ ...profile, jokeFrequency: 0 }, { now: 100000, focus: false, quiet: false }, 0.6)).toBeNull();
    expect(chooseLocalPhrase(profile, { now: 100000, focus: false, quiet: false }, 0.6)).toBe('Aquí estoy contigo.');
  });
});

describe('pet interaction lifecycle', () => {
  let container: HTMLElement;
  let pet: PetController | undefined;
  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.append(container);
  });
  afterEach(() => {
    pet?.destroy();
    pet = undefined;
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('offers a named keyboard-accessible cat and opens chat on activation', () => {
    const options = baseOptions();
    pet = new PetController(container, options);
    pet.show();
    const button = container.querySelector<HTMLButtonElement>('.miauwi-cat')!;
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('aria-label')).toContain('Miauwi');
    button.click();
    expect(options.onInteract).toHaveBeenCalledOnce();
    expect(pet.getState()).toBe('celebrate');
    pet.update({ name: 'Luna' });
    expect(button.getAttribute('aria-label')).toContain('Luna');
  });

  it('wakes by interaction and suppresses autonomous movement in focus mode', () => {
    pet = new PetController(container, baseOptions());
    pet.show();
    pet.sleep();
    expect(pet.getState()).toBe('sleep');
    container.querySelector<HTMLButtonElement>('.miauwi-cat')!.click();
    expect(pet.getState()).toBe('wake');
    vi.advanceTimersByTime(1200);
    pet.focus(true);
    expect(pet.getState()).toBe('sit');
    vi.advanceTimersByTime(20000);
    expect(['sit', 'sleep']).toContain(pet.getState());
  });

  it('keeps reminder text literal and supplies an accessible dismiss action', () => {
    pet = new PetController(container, baseOptions());
    pet.show();
    pet.say('<img src=x onerror=alert(1)>', true);
    const bubble = container.querySelector<HTMLElement>('.miauwi-bubble')!;
    expect(bubble.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(bubble.querySelector('img')).toBeNull();
    bubble.querySelector<HTMLButtonElement>('button')!.click();
    expect(bubble.hidden).toBe(true);
  });

  it('routes the context menu and releases every owned timer on destruction', () => {
    const options = baseOptions();
    pet = new PetController(container, options);
    pet.show();
    container.querySelector('.miauwi-cat')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    expect(options.onMenu).toHaveBeenCalledOnce();
    pet.say('Hola');
    pet.destroy();
    expect(container.querySelector('.miauwi-overlay')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('supports pointer dragging without treating the release as a chat click', () => {
    const options = baseOptions();
    pet = new PetController(container, options);
    pet.show();
    const button = container.querySelector<HTMLElement>('.miauwi-cat')!;
    const pointer = (type: string, x: number, y: number) => {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
      Object.defineProperty(event, 'pointerId', { value: 4 });
      return event;
    };
    button.dispatchEvent(pointer('pointerdown', 40, 300));
    document.dispatchEvent(pointer('pointermove', 150, 160));
    expect(pet.getState()).toBe('drag');
    document.dispatchEvent(pointer('pointerup', 150, 160));
    button.click();
    expect(options.onInteract).not.toHaveBeenCalled();
    expect(['fall', 'idle', 'sit']).toContain(pet.getState());
  });

  it('switches to local sprite frames and restores the original cat when the skin is removed', () => {
    pet = new PetController(container, baseOptions());
    pet.show();
    pet.update({ skin: { url: 'app://local/black-cat.png', frameWidth: 64, frameHeight: 64,
      columns: 4, states: { idle: { row: 0, frames: 4, fps: 8 }, sleep: { row: 1, frames: 2, fps: 2 } } } });
    const skin = container.querySelector<HTMLElement>('.miauwi-custom-skin')!;
    expect(skin).not.toBeNull();
    expect(skin.style.backgroundImage).toContain('black-cat.png');
    pet.sleep();
    expect(skin.style.getPropertyValue('--miauwi-sprite-y')).toBe('-60px');
    expect(container.querySelector<HTMLElement>('.miauwi-overlay')!.dataset.skin).toBe('custom');
    pet.update({ skin: undefined });
    expect(container.querySelector<HTMLElement>('.miauwi-overlay')!.dataset.skin).toBe('original');
  });

  it('falls back to original artwork for incomplete sprite manifests without crashing', () => {
    pet = new PetController(container, baseOptions());
    pet.show();
    expect(() => pet!.update({ skin: { url: 'app://local/cat.png' } as SkinPack })).not.toThrow();
    expect(container.querySelector<HTMLElement>('.miauwi-overlay')!.dataset.skin).toBe('original');
  });

  it('stops timers while its owner document is hidden and resumes safely', () => {
    pet = new PetController(container, baseOptions());
    pet.show();
    pet.say('Mensaje');
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(vi.getTimerCount()).toBe(0);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(vi.getTimerCount()).toBeGreaterThan(0);
  });

  it('cancels pending geometry work when hidden by the user', () => {
    pet = new PetController(container, baseOptions());
    pet.show();
    document.dispatchEvent(new Event('scroll'));
    pet.hide();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('places messages inside a short viewport instead of clipping them above it', () => {
    const height = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 160 });
    try {
      pet = new PetController(container, baseOptions());
      pet.show();
      pet.say('Un mensaje visible.');
      const bubble = container.querySelector<HTMLElement>('.miauwi-bubble')!;
      expect(Number.parseFloat(bubble.style.top)).toBeGreaterThanOrEqual(12);
      expect(bubble.style.bottom).toBe('auto');
    } finally { Object.defineProperty(window, 'innerHeight', { configurable: true, value: height }); }
  });

  it('does not repeatedly resubscribe resize observers and create an idle polling loop', () => {
    class InitialResizeObserver {
      private observed = new Set<Element>();
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element): void {
        if (this.observed.has(target)) return;
        this.observed.add(target);
        this.callback([], this as unknown as ResizeObserver);
      }
      unobserve(target: Element): void { this.observed.delete(target); }
      disconnect(): void { this.observed.clear(); }
    }
    vi.stubGlobal('ResizeObserver', InitialResizeObserver);
    pet = new PetController(container, baseOptions());
    pet.show();
    vi.advanceTimersByTime(1200);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('falls safely when its supporting folder moves away horizontally', () => {
    const folder = document.createElement('div');
    folder.className = 'nav-folder-title';
    let left = 0;
    folder.getBoundingClientRect = () => new DOMRect(left, 120, 300, 25);
    document.body.append(folder);
    try {
      pet = new PetController(container, baseOptions());
      pet.show();
      const button = container.querySelector<HTMLElement>('.miauwi-cat')!;
      const origin = button.style.transform.match(/translate3d\((\d+)px, (\d+)px/)!;
      const event = (type: string, x: number, y: number): MouseEvent => {
        const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
        Object.defineProperty(e, 'pointerId', { value: 1 });
        return e;
      };
      button.dispatchEvent(event('pointerdown', 0, 0));
      document.dispatchEvent(event('pointermove', 50 - Number(origin[1]), 20 - Number(origin[2])));
      document.dispatchEvent(event('pointerup', 50 - Number(origin[1]), 20 - Number(origin[2])));
      vi.advanceTimersByTime(1500);
      expect(button.style.transform).toContain('60px');
      left = 500;
      document.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(1700);
      expect(button.style.transform).toContain('694px');
    } finally { folder.remove(); }
  });

  it('speaks locally on note, folder and pet interactions, including reduced motion', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const profiles = validatePersonalityProfiles({ social: { label: 'Sociable', sociability: 1,
      jokeFrequency: 1, phrases: ['Una idea a la vez.', 'Aquí estoy contigo.', 'Inspección felina.'] } }).profiles;
    pet = new PetController(container, { ...baseOptions(), reducedMotion: true, personality: 'social', profiles });
    pet.show();
    const bubble = container.querySelector<HTMLElement>('.miauwi-bubble')!;
    pet.reactToNote();
    expect(bubble.textContent).toContain('Una idea a la vez.');
    vi.advanceTimersByTime(11000);
    container.querySelector<HTMLButtonElement>('.miauwi-cat')!.click();
    expect(bubble.hidden).toBe(true);
    vi.advanceTimersByTime(35000);
    const folder = document.createElement('button');
    folder.className = 'nav-folder-title';
    document.body.append(folder);
    try {
      folder.click();
      expect(bubble.textContent).toContain('Aquí estoy contigo.');
      vi.advanceTimersByTime(46000);
      container.querySelector<HTMLButtonElement>('.miauwi-cat')!.click();
      expect(bubble.textContent).toContain('Una idea a la vez.');
      vi.advanceTimersByTime(46000);
      pet.focus(true);
      pet.reactToNote();
      container.querySelector<HTMLButtonElement>('.miauwi-cat')!.click();
      expect(bubble.hidden).toBe(true);
      pet.focus(false);
      pet.update({ quiet: true });
      folder.click();
      expect(bubble.hidden).toBe(true);
    } finally { folder.remove(); }
  });
});
