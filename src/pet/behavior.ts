export const PET_STATES = ['idle', 'walk', 'run', 'jump', 'climb', 'sit', 'stretch', 'yawn', 'sleep', 'wake',
  'hide', 'fall', 'look', 'chase', 'peek', 'hang', 'celebrate', 'drag'] as const;
export type PetState = typeof PET_STATES[number];
export interface PersonalityProfile {
  label: string;
  description: string;
  languageStyle: string;
  jokeFrequency: number;
  curiosity: number;
  sociability: number;
  sleepTendency: number;
  reactions: Record<string, string>;
  preferredAnimations: PetState[];
  phrases: string[];
  prompt?: string;
  weights: Partial<Record<PetState, number>>;
  activity: number;
  speed: number;
  idleMinutes: number;
}

function profile(label: string, description: string, weights: PersonalityProfile['weights'], activity: number,
  speed: number, sleepTendency: number, phrases: string[]): PersonalityProfile {
  return { label, description, languageStyle: 'Español cálido, breve y curioso', jokeFrequency: 0.3,
    curiosity: 0.7, sociability: 0.6, sleepTendency, reactions: { note: 'look', folder: 'peek', success: 'celebrate' },
    preferredAnimations: Object.keys(weights) as PetState[], phrases, weights, activity, speed, idleMinutes: 8 };
}

export const PERSONALITIES: Record<string, PersonalityProfile> = {
  travieso: profile('Gato travieso', 'Explora y persigue al puntero con pequeñas travesuras.',
    { idle: 2, walk: 4, run: 2, jump: 3, climb: 1, look: 2, chase: 3, peek: 2, stretch: 1, hang: 1 }, 0.7, 1.1, 0.2,
    ['Inspección felina completada.', 'Esa carpeta parecía sospechosa.']),
  cientifico: profile('Gato científico', 'Observa, investiga y acompaña tus experimentos.',
    { idle: 3, walk: 3, jump: 1, look: 6, sit: 3, peek: 2, stretch: 1, yawn: 1 }, 0.45, 0.85, 0.3,
    ['Hipótesis: un pequeño descanso ayuda.', 'Anotado en mi cuaderno imaginario.']),
  adorable: profile('Gato adorable', 'Busca compañía y celebra tus avances con calma.',
    { idle: 3, walk: 2, sit: 5, look: 4, stretch: 3, celebrate: 2, yawn: 2 }, 0.3, 0.75, 0.5,
    ['Estoy aquí contigo.', 'Un paso más. Miau.']),
  caotico: profile('Gato caótico', 'Alterna carreras, saltos y escondites impredecibles.',
    { idle: 1, walk: 2, run: 5, jump: 5, climb: 3, chase: 4, hide: 2, peek: 3, hang: 2, stretch: 1 }, 0.9, 1.35, 0.15,
    ['¡Una idea! Espera, otra.', 'Esta investigación requiere un salto.']),
  academico: profile('Gato académico', 'Acompaña el estudio con movimientos discretos y pausas.',
    { idle: 5, walk: 2, sit: 6, look: 3, stretch: 3, yawn: 2 }, 0.25, 0.65, 0.55,
    ['Una idea a la vez.', 'Tu próxima página te espera.'])
};
export const DEFAULT_PERSONALITY_PROFILES = PERSONALITIES;
const aliases: Record<string, string> = { curioso: 'travieso', curious: 'travieso', jugueton: 'caotico', playful: 'caotico',
  tranquilo: 'adorable', calm: 'adorable', estudioso: 'academico', studious: 'academico', dormilon: 'adorable', sleepy: 'adorable' };

export function getPersonality(key: string, custom?: Record<string, PersonalityProfile>): PersonalityProfile {
  if (custom && Object.hasOwn(custom, key)) return custom[key]!;
  if (Object.hasOwn(PERSONALITIES, key)) return PERSONALITIES[key]!;
  return PERSONALITIES[Object.hasOwn(aliases, key) ? aliases[key]! : 'travieso']!;
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
/** Validate editable JSON without executing it; omitted descriptive fields receive usable defaults. */
export function validatePersonalityProfiles(input: unknown): { valid: boolean; profiles: Record<string, PersonalityProfile>; errors: string[] } {
  const errors: string[] = [];
  let value = input;
  if (typeof value === 'string') {
    try { value = JSON.parse(value) as unknown; } catch { return { valid: false, profiles: {}, errors: ['El JSON de personalidades no es válido.'] }; }
  }
  if (!record(value) || !Object.keys(value).length || Object.keys(value).length > 30)
    return { valid: false, profiles: {}, errors: ['Se requiere un objeto con entre 1 y 30 perfiles.'] };
  const profiles: Record<string, PersonalityProfile> = Object.create(null) as Record<string, PersonalityProfile>;
  for (const [key, data] of Object.entries(value)) {
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(key) || !record(data) || typeof data.label !== 'string' || !data.label.trim()) {
      errors.push(`Perfil inválido: ${key}.`); continue;
    }
    const base = getPersonality(key);
    const weights: PersonalityProfile['weights'] = {};
    const sourceWeights = data.weights ?? base.weights;
    if (!record(sourceWeights)) { errors.push(`${key}: weights debe ser un objeto.`); continue; }
    for (const [state, weight] of Object.entries(sourceWeights)) {
      if (!(PET_STATES as readonly string[]).includes(state) || typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0 || weight > 100)
        errors.push(`${key}: peso inválido para ${state}.`);
      else weights[state as PetState] = weight;
    }
    if (!Object.values(weights).some(weight => (weight ?? 0) > 0)) errors.push(`${key}: incluye al menos un peso positivo.`);
    const number = (field: string, fallback: number, min: number, max: number): number => {
      const n = data[field] ?? fallback;
      if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) {
        errors.push(`${key}: ${field} debe estar entre ${min} y ${max}.`); return fallback;
      }
      return n;
    };
    const text = (field: string, fallback: string, limit = 2000): string => {
      const str = data[field] ?? fallback;
      if (typeof str !== 'string' || str.length > limit) { errors.push(`${key}: ${field} debe ser texto de hasta ${limit} caracteres.`); return fallback; }
      return str;
    };
    const preferred = data.preferredAnimations ?? Object.keys(weights);
    const preferredAnimations = Array.isArray(preferred) && preferred.every(s => typeof s === 'string' && (PET_STATES as readonly string[]).includes(s))
      ? preferred as PetState[] : base.preferredAnimations;
    if (preferredAnimations === base.preferredAnimations && preferred !== base.preferredAnimations) errors.push(`${key}: preferredAnimations inválido.`);
    const phrases = data.phrases ?? base.phrases;
    if (!Array.isArray(phrases) || phrases.length > 100 || !phrases.every(p => typeof p === 'string' && p.length <= 500)) errors.push(`${key}: phrases inválido.`);
    const reactions = data.reactions ?? base.reactions;
    if (!record(reactions) || !Object.values(reactions).every(r => typeof r === 'string' && r.length <= 500)) errors.push(`${key}: reactions inválido.`);
    profiles[key] = { label: data.label.trim().slice(0, 80), description: text('description', base.description),
      languageStyle: text('languageStyle', base.languageStyle), jokeFrequency: number('jokeFrequency', base.jokeFrequency, 0, 1),
      curiosity: number('curiosity', base.curiosity, 0, 1), sociability: number('sociability', base.sociability, 0, 1),
      sleepTendency: number('sleepTendency', base.sleepTendency, 0, 1), reactions: record(reactions) ? reactions as Record<string, string> : base.reactions,
      preferredAnimations, phrases: Array.isArray(phrases) ? phrases as string[] : base.phrases, weights,
      activity: number('activity', base.activity, 0, 1), speed: number('speed', base.speed, 0.25, 3),
      idleMinutes: number('idleMinutes', base.idleMinutes, 1, 240),
      ...(data.prompt !== undefined ? { prompt: text('prompt', '', 12000) } : {}) };
  }
  return { valid: errors.length === 0, profiles: errors.length ? {} : profiles, errors };
}

export interface BehaviorContext { focus: boolean; reducedMotion: boolean; activity: number; inactiveMs: number;
  idleMinutes: number; personality: string; surfaces: number; profiles?: Record<string, PersonalityProfile> }
const movingStates: readonly PetState[] = ['walk', 'run', 'jump', 'climb', 'chase', 'fall', 'drag'];
export const isMovingState = (state: PetState): boolean => movingStates.includes(state);
export function canTransition(current: PetState, next: PetState): boolean {
  if (current === 'sleep') return ['sleep', 'wake', 'hide', 'drag'].includes(next);
  if (current === 'drag') return ['fall', 'idle', 'sit', 'hide', 'sleep', 'drag'].includes(next);
  return true;
}

export function chooseBehavior(context: BehaviorContext, random = Math.random()): PetState {
  if (context.inactiveMs >= Math.max(1, context.idleMinutes) * 60000) return 'sleep';
  if (context.focus) return 'sit';
  if (context.reducedMotion) return random < 0.45 ? 'idle' : random < 0.8 ? 'sit' : 'look';
  const personality = getPersonality(context.personality, context.profiles);
  const entries = Object.entries(personality.weights).filter(([state, weight]) => (weight ?? 0) > 0
    && !['sleep', 'wake', 'fall', 'drag'].includes(state)
    && (context.surfaces > 0 || !['climb', 'hang', 'peek'].includes(state))) as [PetState, number][];
  const effective = entries.map(([state, weight]) => [state, isMovingState(state) || state === 'jump'
    ? weight * Math.max(0, context.activity) * personality.activity * 2 : weight] as const);
  const total = effective.reduce((sum, [, weight]) => sum + weight, 0);
  let pick = Math.max(0, Math.min(0.999999, random)) * total;
  for (const [state, weight] of effective) { pick -= weight; if (pick < 0) return state; }
  return 'idle';
}

export interface LocalPhraseContext {
  now: number;
  focus: boolean;
  quiet: boolean;
  lastSpokenAt?: number;
  lastPhrase?: string;
}

/** Event-driven local dialogue: no agent request and no animation polling. */
export function chooseLocalPhrase(profile: PersonalityProfile, context: LocalPhraseContext,
  random = Math.random()): string | null {
  if (context.focus || context.quiet || (context.lastSpokenAt !== undefined && context.now - context.lastSpokenAt < 45000)) return null;
  const phrases = [...new Set(profile.phrases.map(phrase => phrase.trim()))]
    .filter(phrase => phrase.length > 0 && phrase !== context.lastPhrase);
  if (!phrases.length) return null;
  const willingness = Math.max(0, Math.min(1, profile.sociability))
    * (0.35 + Math.max(0, Math.min(1, profile.jokeFrequency)) * 0.65);
  const sample = Math.max(0, Math.min(0.999999, Number.isFinite(random) ? random : 0));
  if (willingness <= 0 || sample >= willingness) return null;
  return phrases[Math.min(phrases.length - 1, Math.floor(sample / willingness * phrases.length))] ?? null;
}
