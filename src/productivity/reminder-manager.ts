import { DateTime, IANAZone } from 'luxon';
import type { Reminder } from './types';

type CreateReminder = Pick<Reminder,'title'|'dueAt'|'timeZone'> & Partial<Pick<Reminder,'recurrence'|'description'|'origin'|'notePath'|'taskId'>>;
type EditReminder = Partial<Pick<Reminder,'title'|'dueAt'|'timeZone'|'recurrence'>>;
const copy = (items: Reminder[]): Reminder[] => items.map(item=>({...item}));
const recurrences = new Set(['none','daily','weekly','monthly']);
const statuses = new Set(['active','done','cancelled']);

function instant(value: unknown, field: string): DateTime {
  if(typeof value!=='string' || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) throw new Error(`Fecha inválida en ${field}: debe incluir zona u offset.`);
  const date=DateTime.fromISO(value,{setZone:true});
  if(!date.isValid) throw new Error(`Fecha inválida en ${field}.`);
  return date;
}
function validate(item: Reminder): void {
  if(!item || typeof item!=='object') throw new Error('Registro de recordatorio inválido; conserva el archivo para repararlo.');
  for(const key of ['id','title','origin'] as const) if(typeof item[key]!=='string' || !item[key].trim()) throw new Error(`Campo de recordatorio inválido: ${key}.`);
  if(typeof item.description!=='string' || !IANAZone.isValidZone(item.timeZone)) throw new Error('Descripción o zona horaria de recordatorio inválida.');
  if(!recurrences.has(item.recurrence) || !statuses.has(item.status)) throw new Error('Estado o recurrencia de recordatorio inválidos.');
  for(const field of ['dueAt','nextRun','createdAt'] as const) instant(item[field],field);
  if(item.lastNotified!==undefined) instant(item.lastNotified,'lastNotified');
  for(const field of ['notePath','taskId'] as const) if(item[field]!==undefined && typeof item[field]!=='string') throw new Error(`Campo inválido: ${field}.`);
}
function records(items: Reminder[]): void {
  if(!Array.isArray(items)) throw new Error('Los recordatorios guardados no forman una lista válida.');
  const ids=new Set<string>();
  for(const item of items) {
    validate(item);
    if(ids.has(item.id)) throw new Error('Hay identificadores de recordatorio repetidos.');
    ids.add(item.id);
  }
}
function nowMillis(now: Date): number {
  const millis=now.getTime();
  if(!Number.isFinite(millis)) throw new Error('La fecha actual no es válida.');
  return millis;
}
function due(item: Reminder, now: number): boolean {
  const occurrence=instant(item.nextRun,'nextRun').toMillis();
  return item.status==='active' && occurrence<=now && (!item.lastNotified || instant(item.lastNotified,'lastNotified').toMillis()!==occurrence);
}
function nextOccurrence(item: Reminder, now: Date): string {
  const anchor=instant(item.dueAt,'dueAt').setZone(item.timeZone);
  const current=DateTime.fromJSDate(now,{zone:item.timeZone});
  const days=Math.floor(current.startOf('day').diff(anchor.startOf('day'),'days').days);
  let count=item.recurrence==='monthly'
    ? Math.max(0,(current.year-anchor.year)*12+current.month-anchor.month)
    : Math.max(0,Math.floor(days/(item.recurrence==='weekly'?7:1)));
  const candidateAt = (n: number): DateTime => item.recurrence==='monthly' ? anchor.plus({months:n}) : item.recurrence==='weekly' ? anchor.plus({weeks:n}) : anchor.plus({days:n});
  let candidate=candidateAt(count);
  if(candidate.toMillis()<=current.toMillis()) candidate=candidateAt(++count);
  if(!candidate.isValid || candidate.toMillis()<=current.toMillis()) throw new Error('No se pudo calcular la siguiente ocurrencia.');
  return candidate.toUTC().toISO()!;
}
function uniqueId(): string {
  const crypto=globalThis.crypto;
  if(crypto?.randomUUID) return crypto.randomUUID();
  if(!crypto?.getRandomValues) throw new Error('No está disponible el generador seguro de identificadores.');
  return Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');
}

/** Commits immutable snapshots before releasing alerts; the caller owns actual notification UI. */
export class ReminderManager {
  private items: Reminder[];
  private queue: Promise<void> = Promise.resolve();
  constructor(items: Reminder[], private readonly persist: (items: Reminder[]) => Promise<void>) {
    records(items);
    this.items=copy(items);
  }
  list(): Reminder[] { return copy(this.items); }
  private transaction<T>(operation: (draft: Reminder[]) => {value:T;changed?:boolean}): Promise<T> {
    const run=this.queue.then(async()=>{
      const draft=copy(this.items);
      const result=operation(draft);
      if(result.changed!==false) {
        records(draft);
        await this.persist(copy(draft));
        this.items=draft;
      }
      return result.value;
    });
    this.queue=run.then(()=>undefined,()=>undefined);
    return run;
  }
  create(input: CreateReminder): Promise<Reminder> {
    return this.transaction(draft=>{
      const dueAt=instant(input.dueAt,'dueAt').toUTC().toISO()!;
      const item: Reminder={id:uniqueId(),title:input.title.trim(),description:input.description ?? '',dueAt,timeZone:input.timeZone,recurrence:input.recurrence ?? 'none',status:'active',origin:input.origin ?? 'manual',nextRun:dueAt,createdAt:DateTime.utc().toISO()!,...(input.notePath!==undefined?{notePath:input.notePath}:{}),...(input.taskId!==undefined?{taskId:input.taskId}:{})};
      validate(item);draft.push(item);return {value:{...item}};
    });
  }
  edit(id: string, patch: EditReminder): Promise<void> {
    return this.transaction(draft=>{
      const item=this.find(draft,id);
      if(item.status==='cancelled') throw new Error('Ese recordatorio está cancelado.');
      if(patch.title!==undefined) item.title=patch.title.trim();
      if(patch.timeZone!==undefined) item.timeZone=patch.timeZone;
      if(patch.recurrence!==undefined) item.recurrence=patch.recurrence;
      if(patch.dueAt!==undefined) {
        item.dueAt=instant(patch.dueAt,'dueAt').toUTC().toISO()!;
        item.nextRun=item.dueAt;item.status='active';delete item.lastNotified;
      }
      return {value:undefined};
    });
  }
  cancel(id: string): Promise<void> {
    return this.transaction(draft=>{this.find(draft,id).status='cancelled';return {value:undefined};});
  }
  snooze(id: string, minutes: number, now = new Date()): Promise<void> {
    return this.transaction(draft=>{
      if(!Number.isFinite(minutes) || minutes<=0) throw new Error('El tiempo para posponer debe ser mayor que cero.');
      const millis=nowMillis(now)+minutes*60000;
      if(!Number.isFinite(millis)) throw new Error('El tiempo para posponer no es válido.');
      const item=this.find(draft,id);
      if(item.status==='cancelled') throw new Error('Ese recordatorio está cancelado.');
      item.nextRun=DateTime.fromMillis(millis).toUTC().toISO()!;item.status='active';delete item.lastNotified;
      return {value:undefined};
    });
  }
  cancelForTask(taskId: string): Promise<void> {
    return this.transaction(draft=>{
      let changed=false;
      for(const item of draft) if(item.taskId===taskId && item.status==='active'){item.status='cancelled';changed=true;}
      return {value:undefined,changed};
    });
  }
  tick(now: Date): Promise<Reminder[]> {
    return this.transaction(draft=>{
      const millis=nowMillis(now);
      const alerts: Reminder[]=[];
      for(const item of draft) if(due(item,millis)) {
        const consumed=item.nextRun;
        item.lastNotified=consumed;
        alerts.push({...item});
        if(item.recurrence==='none') item.status='done';
        else item.nextRun=nextOccurrence(item,now);
      }
      return {value:alerts,changed:alerts.length>0};
    });
  }
  catchUp(now: Date): Reminder[] {
    const millis=nowMillis(now);
    return this.items.filter(item=>due(item,millis)).map(item=>({...item}));
  }
  private find(items: Reminder[], id: string): Reminder {
    const item=items.find(value=>value.id===id);
    if(!item) throw new Error('No se encontró el recordatorio.');
    return item;
  }
}
