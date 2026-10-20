import { describe, expect, it } from 'vitest';
import { parseReminder, ReminderManager, type Reminder, parseTasks, filterTasks, completeTaskText, createTaskText } from '../src/productivity';

describe('Spanish reminder parsing', () => {
  const now = new Date('2026-10-20T15:00:00.000Z'); // Tuesday 10:00 in Lima.
  it.each([
    ['Recuérdame estudiar mañana a las 7 p.m.', '2026-10-22T00:00:00.000Z', 'none'],
    ['Repasar pasado mañana a las siete de la tarde', '2026-10-23T00:00:00.000Z', 'none'],
    ['Estudiar próximo lunes a las 19:00', '2026-10-27T00:00:00.000Z', 'none'],
    ['Repasar todos los lunes a las ocho de la mañana', '2026-10-26T13:00:00.000Z', 'weekly'],
    ['Leer diario a las 07:00', '2026-10-21T12:00:00.000Z', 'daily'],
    ['Revisar mensual el día 31 a las 09:00', '2026-10-31T14:00:00.000Z', 'monthly'],
    ['Descansar en treinta minutos', '2026-10-20T15:30:00.000Z', 'none'],
    ['Estirar dentro de45min', '2026-10-20T15:45:00.000Z', 'none'],
    ['Repasar el 2026-11-05 a las 14:30', '2026-11-05T19:30:00.000Z', 'none'],
  ])('resolves an explicit request: %s', (text, dueAt, recurrence) => {
    expect(parseReminder(text, now, 'America/Lima')).toMatchObject({ ok: true, dueAt, recurrence, timeZone: 'America/Lima' });
  });
  it.each(['Estudiar mañana', 'Estudiar a las 19:00', 'Estudiar mañana a las siete', 'Estudiar antes del examen', 'Estudiar el 2026-02-31 a las 09:00', 'Estudiar mensual a las 09:00'])('asks instead of inventing information: %s', (text) => {
    expect(parseReminder(text, now, 'America/Lima').ok).toBe(false);
  });
  it('keeps a useful title without date instructions', () => {
    expect(parseReminder('Recuérdame estudiar cálculo mañana a las 7 p.m.', now, 'America/Lima')).toMatchObject({ ok: true, title: 'estudiar cálculo' });
  });
  it('does not silently shift a nonexistent DST time', () => {
    expect(parseReminder('Estudiar el 2027-03-14 a las 02:30', now, 'America/New_York').ok).toBe(false);
  });
  it('asks which occurrence of a repeated DST clock time was intended', () => {
    expect(parseReminder('Estudiar el 2026-11-01 a las 01:30', now, 'America/New_York').ok).toBe(false);
  });
  it('checks DST after advancing the initial daily occurrence', () => {
    expect(parseReminder('Leer diario a las 02:30', new Date('2027-03-13T20:00:00Z'), 'America/New_York').ok).toBe(false);
  });
  it('preserves Unicode characters in reminder titles', () => {
    expect(parseReminder('Recuérdame 🐈 estudiar mañana a las 19:00',now,'America/Lima')).toMatchObject({ok:true,title:'🐈 estudiar'});
  });
  it.each(['Leer mañana o pasado mañana a las 19:00','Leer el 2026-11-05 o el 2026-11-06 a las 19:00','Leer en treinta minutos o en una hora','Leer mañana en treinta minutos'])('asks which conflicting date or delay was intended: %s', text=>{
    expect(parseReminder(text,now,'America/Lima').ok).toBe(false);
  });
});

describe('Markdown tasks', () => {
  it('ignores frontmatter and fences, validates dates and keeps source positions', () => {
    const text='---\nexample: "- [ ] Hidden"\n---\n```md\n- [ ] Hidden code\n```\n- [ ] Repasar 📅 2026-10-21 ⏫\n- [x] Leer ✅ 2026-10-20\n- [ ] Invalid 📅 2026-02-31\n~~~\n- [ ] Hidden too\n~~~';
    const tasks=parseTasks(text,'Tasks.md');
    expect(tasks.map(task=>task.title)).toEqual(['Repasar','Leer','Invalid']);
    expect(tasks[0]).toMatchObject({path:'Tasks.md',line:6,completed:false,due:'2026-10-21',priority:1});
    expect(tasks[1]).toMatchObject({completed:true,completedOn:'2026-10-20'});
    expect(tasks[2].due).toBeUndefined();
  });
  it('ignores fenced examples nested inside a list',()=>{
    const text='- Parent\n    ```md\n    - [ ] Hidden\n    ```\n- [ ] Visible';
    expect(parseTasks(text,'T.md').map(task=>task.title)).toEqual(['Visible']);
  });
  it('filters against Lima calendar dates rather than the UTC date', () => {
    const tasks=parseTasks('- [ ] Due tomorrow 📅 2026-10-20\n- [ ] Overdue 📅 2026-10-18\n- [ ] Urgent ⏫\n- [x] Done ✅ 2026-10-19\n- [ ] Sunday 📅 2026-10-25\n- [ ] Next week 📅 2026-10-26','Tasks.md');
    const now=new Date('2026-10-20T02:00:00Z'); // Lima October 19.
    expect(filterTasks(tasks,'tomorrow',now,'America/Lima').map(task=>task.title)).toEqual(['Due tomorrow']);
    expect(filterTasks(tasks,'overdue',now,'America/Lima').map(task=>task.title)).toEqual(['Overdue']);
    expect(filterTasks(tasks,'urgent',now,'America/Lima').map(task=>task.title)).toEqual(['Urgent']);
    expect(filterTasks(tasks,'done-today',now,'America/Lima').map(task=>task.title)).toEqual(['Done']);
    expect(filterTasks(tasks,'week',now,'America/Lima').map(task=>task.title)).toEqual(['Due tomorrow','Sunday']);
    expect(filterTasks(tasks,'pending',now,'America/Lima')).toHaveLength(5);
  });
  it('completes just the exact snapshot line and preserves CRLF, indentation and unrelated content', () => {
    const text='# Title\r\n  - [ ] Repasar 📅 2026-10-21\r\n- [ ] Repasar 📅 2026-10-21\r\n';
    const task=parseTasks(text,'Tasks.md')[0];
    expect(completeTaskText(text,task,'2026-10-20')).toBe('# Title\r\n  - [x] Repasar 📅 2026-10-21 ✅ 2026-10-20\r\n- [ ] Repasar 📅 2026-10-21\r\n');
    expect(()=>completeTaskText(text.replace('  - [ ]','  - [/]'),task,'2026-10-20')).toThrow();
  });
  it('does not stamp a completion twice', () => {
    const text='- [x] Leer ✅ 2026-10-20';
    expect(completeTaskText(text,parseTasks(text,'T.md')[0],'2026-10-20')).toBe(text);
  });
  it('requires the Tasks API for recurrence and keeps both API result lines', () => {
    const text='Before\r\n- [ ] Study 🔁 every day 📅 2026-10-20\r\nAfter';
    const task=parseTasks(text,'T.md')[0];
    expect(()=>completeTaskText(text,task,'2026-10-20')).toThrow();
    expect(completeTaskText(text,task,'2026-10-20',()=>'- [x] Study ✅ 2026-10-20\n- [ ] Study 🔁 every day 📅 2026-10-21')).toBe('Before\r\n- [x] Study ✅ 2026-10-20\r\n- [ ] Study 🔁 every day 📅 2026-10-21\r\nAfter');
  });
  it('preserves a block id at the end of a completion line', () => {
    const text='- [ ] Leer ^read';
    expect(completeTaskText(text,parseTasks(text,'T.md')[0],'2026-10-20')).toBe('- [x] Leer ✅ 2026-10-20 ^read');
  });
  it('creates a single safe task without destroying the existing end-of-file style', () => {
    expect(createTaskText('# Tasks\r\n','Leer','2026-10-21')).toBe('# Tasks\r\n- [ ] Leer 📅 2026-10-21\r\n');
    expect(createTaskText('','Leer')).toBe('- [ ] Leer\n');
    expect(()=>createTaskText('','Leer\n- [ ] Surprise')).toThrow();
    expect(()=>createTaskText('','Leer','2026-02-31')).toThrow();
  });
  it('does not duplicate an identical pending task when creation is retried',()=>{
    const text='# Tasks\r\n- [ ] Leer 📅 2026-10-21\r\n';
    expect(createTaskText(text,'Leer','2026-10-21')).toBe(text);
  });
  it('honors deletion returned by the optional Tasks API',()=>{
    const text='Before\n- [ ] Delete me 🏁 delete\nAfter';
    expect(completeTaskText(text,parseTasks(text,'T.md')[0],'2026-10-20',()=>'' )).toBe('Before\nAfter');
  });
});

describe('durable reminders', () => {
  const make = (patch: Partial<Reminder> = {}): Reminder => ({ id:'one', title:'Repasar', description:'', dueAt:'2026-10-20T15:30:00.000Z', timeZone:'America/Lima', recurrence:'none', status:'active', origin:'manual', nextRun:'2026-10-20T15:30:00.000Z', createdAt:'2026-10-20T15:00:00.000Z', ...patch });
  it('does not expose an alert before its consumed occurrence is persisted', async () => {
    let release!: () => void;
    const saved: Reminder[][] = [];
    const manager = new ReminderManager([make()], async items => { saved.push(items); await new Promise<void>(resolve => { release = resolve; }); });
    let returned = false;
    const ticking = manager.tick(new Date('2026-10-20T16:00:00Z')).then(items => { returned=true; return items; });
    await new Promise(resolve => setTimeout(resolve,0));
    expect(returned).toBe(false);
    expect(saved[0][0].lastNotified).toBe('2026-10-20T15:30:00.000Z');
    release();
    expect(await ticking).toHaveLength(1);
    expect(await manager.tick(new Date('2026-10-20T17:00:00Z'))).toEqual([]);
    expect(new ReminderManager(manager.list(), async()=>{}).catchUp(new Date('2026-10-20T17:00:00Z'))).toEqual([]);
  });
  it('serializes concurrent ticks so the same due reminder appears once', async () => {
    const manager = new ReminderManager([make()], async()=>{});
    const result = await Promise.all([manager.tick(new Date('2026-10-20T16:00:00Z')), manager.tick(new Date('2026-10-20T16:00:00Z'))]);
    expect(result.flat()).toHaveLength(1);
  });
  it('keeps state retryable if persistence fails', async () => {
    let fail=true;
    const manager = new ReminderManager([make()], async()=>{ if(fail) throw new Error('disk full'); });
    await expect(manager.tick(new Date('2026-10-20T16:00:00Z'))).rejects.toThrow('disk full');
    expect(manager.list()[0].status).toBe('active');
    fail=false;
    expect(await manager.tick(new Date('2026-10-20T16:00:00Z'))).toHaveLength(1);
  });
  it('jumps an old recurring schedule to a future occurrence in its time zone', async () => {
    const manager = new ReminderManager([make({dueAt:'2000-01-01T14:00:00.000Z',nextRun:'2000-01-01T14:00:00.000Z',recurrence:'daily'})],async()=>{});
    expect(await manager.tick(new Date('2026-10-20T16:00:00Z'))).toHaveLength(1);
    expect(manager.list()[0].nextRun).toBe('2026-10-21T14:00:00.000Z');
  });
  it('retains the original monthly day after a short month', async () => {
    const manager = new ReminderManager([make({dueAt:'2027-01-31T14:00:00.000Z',nextRun:'2027-01-31T14:00:00.000Z',recurrence:'monthly'})],async()=>{});
    await manager.tick(new Date('2027-02-01T00:00:00Z'));
    expect(manager.list()[0].nextRun).toBe('2027-02-28T14:00:00.000Z');
    await manager.tick(new Date('2027-03-01T00:00:00Z'));
    expect(manager.list()[0].nextRun).toBe('2027-03-31T14:00:00.000Z');
  });
  it('creates, edits, snoozes, and cancels only the intended task reminder', async () => {
    const saved: Reminder[][]=[];
    const manager = new ReminderManager([],async items=>{saved.push(items);});
    const first = await manager.create({title:'Leer',dueAt:'2026-10-21T14:00:00Z',timeZone:'America/Lima',taskId:'a'});
    const second = await manager.create({title:'Escribir',dueAt:'2026-10-21T15:00:00Z',timeZone:'America/Lima',taskId:'b'});
    expect(first.id).not.toBe(second.id);
    await manager.edit(first.id,{title:'Leer capítulo 2'});
    await manager.snooze(first.id,10,new Date('2026-10-20T15:00:00Z'));
    expect(manager.list()[0]).toMatchObject({title:'Leer capítulo 2',nextRun:'2026-10-20T15:10:00.000Z'});
    await manager.cancelForTask('a');
    expect(manager.list().map(item=>item.status)).toEqual(['cancelled','active']);
    await manager.cancel(second.id);
    expect(manager.catchUp(new Date('2026-10-22T00:00:00Z'))).toEqual([]);
    expect(saved.at(-1)?.map(item=>item.status)).toEqual(['cancelled','cancelled']);
  });
  it('prevents invalid dates, zones and non-positive snoozes from corrupting state', async () => {
    const manager = new ReminderManager([make()],async()=>{});
    await expect(manager.create({title:'X',dueAt:'2026-02-31T12:00:00Z',timeZone:'America/Lima'})).rejects.toThrow();
    await expect(manager.edit('one',{timeZone:'Made/Up'})).rejects.toThrow();
    await expect(manager.snooze('one',0)).rejects.toThrow();
    const snapshot=manager.list(); snapshot[0].title='Changed externally';
    expect(manager.list()[0].title).toBe('Repasar');
  });
  it.each([{timeZone:'Made/Up'},{dueAt:'2026-02-31T12:00:00Z'},{status:'unknown'},{recurrence:'yearly'},{nextRun:'bad'},{id:''}])('rejects corrupted persisted records without silently resetting them: %j', patch => {
    expect(()=>new ReminderManager([make(patch as Partial<Reminder>)],async()=>{})).toThrow();
  });
});
