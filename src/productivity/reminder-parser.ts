import { DateTime, IANAZone } from 'luxon';
import type { ParsedReminder, Recurrence } from './types';

const normalize = (value: string): string => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const weekdays = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const numbers: Record<string, number> = {
  cero:0, un:1, uno:1, una:1, dos:2, tres:3, cuatro:4, cinco:5, seis:6, siete:7, ocho:8, nueve:9,
  diez:10, once:11, doce:12, trece:13, catorce:14, quince:15, dieciseis:16, diecisiete:17,
  dieciocho:18, diecinueve:19, veinte:20, veintiuno:21, veintidos:22, veintitres:23,
  veinticuatro:24, veinticinco:25, veintiseis:26, veintisiete:27, veintiocho:28,
  veintinueve:29, treinta:30, cuarenta:40, cincuenta:50, sesenta:60,
};
function number(value: string): number | null {
  const clean = value.trim();
  if (/^\d+$/.test(clean)) return Number(clean);
  if (numbers[clean] !== undefined) return numbers[clean];
  const parts = clean.split(' y ');
  if (parts.length === 2 && numbers[parts[0]] >= 30 && numbers[parts[1]] > 0 && numbers[parts[1]] < 10) return numbers[parts[0]] + numbers[parts[1]];
  return null;
}
const fail = (question: string): ParsedReminder => ({ok:false,question});

/** Deliberately bounded Spanish grammar: missing or ambiguous data produces a question. */
export function parseReminder(text: string, now: Date, timeZone: string): ParsedReminder {
  if (!IANAZone.isValidZone(timeZone) || !Number.isFinite(now.getTime())) return fail('¿Qué zona horaria válida quieres usar?');
  const localNow = DateTime.fromJSDate(now,{zone:timeZone});
  const source = normalize(text);
  const ranges: Array<[number,number]> = [];
  const consume = (match: RegExpMatchArray): void => { if (match.index !== undefined) ranges.push([match.index,match.index + match[0].length]); };
  const finish = (date: DateTime, recurrence: Recurrence): ParsedReminder => {
    // RegExp indices use UTF-16 offsets, including both units of an emoji.
    const chars = text.split('');
    for (const [start,end] of ranges) for (let i=start;i<end;i++) chars[i]=' ';
    const title = chars.join('').replace(/^\s*(?:recu[eé]rdame|recordarme|av[ií]same|recordatorio\s*(?:para|de)?|hazme recordar)\s*/i,'').replace(/\s+/g,' ').replace(/^[\s,.;:]+|[\s,.;:]+$/g,'').trim();
    if (!title) return fail('¿Qué quieres que te recuerde?');
    if (!date.isValid) return fail('Esa fecha no existe. ¿Qué fecha quieres usar?');
    return {ok:true,title,dueAt:date.toUTC().toISO()!,timeZone,recurrence};
  };

  const relatives = Array.from(source.matchAll(/\b(?:en\s+|dentro\s+de\s*)(\d+|[a-z]+(?:\s+y\s+[a-z]+)?)\s*(minutos?|mins?|horas?|hrs?)\b/g));
  if(relatives.length>1) return fail('Has indicado más de un plazo. ¿Cuál quieres usar?');
  const relative = relatives[0];
  if (relative) {
    if(/\b(?:hoy|manana|proximo|cada|diario|mensual|a las?)\b|\d{1,2}:\d{2}|\d{4}-\d{2}-\d{2}/.test(source)) return fail('Has combinado un plazo con otro horario. ¿Cuál quieres usar?');
    const amount = number(relative[1]);
    if (amount === null || amount <= 0 || amount > 52560000) return fail('¿Dentro de cuántos minutos u horas quieres el aviso?');
    consume(relative);
    return finish(localNow.plus(relative[2].startsWith('h') ? {hours:amount}:{minutes:amount}),'none');
  }

  let recurrence: Recurrence = 'none';
  const daily = source.match(/\b(?:diari[oa]|cada dia|todos los dias)\b/);
  const monthly = source.match(/\b(?:mensual|cada mes|todos los meses)\b/);
  const weekly = source.match(new RegExp(`\\b(?:todos los|cada) (${weekdays.join('|')})\\b`));
  if ([daily,monthly,weekly].filter(Boolean).length > 1) return fail('¿Qué única frecuencia quieres para este recordatorio?');
  if (daily) {recurrence='daily';consume(daily);}
  if (monthly) {recurrence='monthly';consume(monthly);}
  if (weekly) {recurrence='weekly';consume(weekly);}

  // A colon is explicit 24-hour notation; a bare hour needs a day-period marker.
  const hourToken = '(?:\\d{1,2}|cero|una?|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte|veintiuno|veintidos|veintitres)';
  // Require a time-introducer/period or HH:mm so date components cannot become hours.
  const timeMatches = Array.from(source.matchAll(new RegExp(`(?:\\ba las?\\s+(${hourToken})(?::([0-5]\\d)|\\s+y\\s+(media|cuarto))?\\s*(a\\.?\\s*m\\.?|p\\.?\\s*m\\.?|de la manana|de la tarde|de la noche|del mediodia|de la madrugada)?|\\b(\\d{1,2}):([0-5]\\d)\\b|\\b(${hourToken})\\s*(a\\.?\\s*m\\.?|p\\.?\\s*m\\.?|de la manana|de la tarde|de la noche|del mediodia|de la madrugada))(?![\\d:a-z])`,'g')));
  if (timeMatches.length !== 1) return fail('¿A qué hora exacta quieres el aviso? Incluye a.m./p.m. o usa 24 horas.');
  const time = timeMatches[0];
  let hour = number(time[1] ?? time[5] ?? time[7]);
  const minute = Number(time[2] ?? time[6] ?? (time[3]==='media'?30:time[3]==='cuarto'?15:0));
  const period = time[4] ?? time[8];
  const colon = Boolean(time[2] !== undefined || time[6] !== undefined);
  if (hour === null || hour > 23 || (!colon && !period)) return fail('¿La hora es por la mañana o por la tarde? También puedes usar 24 horas.');
  if (period) {
    if (hour < 1 || hour > 12) return fail('¿Qué hora entre 1 y 12 corresponde a a.m./p.m.?');
    const pm = /^(?:p|de la tarde|de la noche|del mediodia)/.test(period);
    hour = hour % 12 + (pm?12:0);
  }
  consume(time);

  const dateChars=source.split('');
  for(const [a,b] of ranges) for(let i=a;i<b;i++) dateChars[i]=' ';
  const dateSource=dateChars.join('');
  const dateExpressions=new RegExp(`\\b(?:el\\s+)?\\d{4}-\\d{2}-\\d{2}\\b|\\b(?:el\\s+)?\\d{1,2}/\\d{1,2}/\\d{4}\\b|\\b(?:el\\s+)?\\d{1,2} de (?:${months.join('|')})(?: de \\d{4})?\\b|\\b(?:pasado manana|manana|hoy)\\b|\\b(?:proximo|el) (?:${weekdays.join('|')})\\b${monthly?'|\\bel\\s+(?:dia\\s+)?\\d{1,2}\\b':''}`,'g');
  if(Array.from(dateSource.matchAll(dateExpressions)).length>1) return fail('Has indicado más de una fecha. ¿Cuál quieres usar?');

  let target = localNow.startOf('day');
  let hasDate = false;
  const iso = source.match(/\b(?:el\s+)?(\d{4})-(\d{2})-(\d{2})\b/);
  const numeric = source.match(/\b(?:el\s+)?(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  const named = source.match(new RegExp(`\\b(?:el\\s+)?(\\d{1,2}) de (${months.join('|')})(?: de (\\d{4}))?\\b`));
  const relativeDay = /\b(pasado manana|manana|hoy)\b/.exec(dateSource)?.index;
  const dayName = source.match(new RegExp(`\\b(?:proximo|el) (${weekdays.join('|')})\\b`));
  const monthDay = monthly ? source.match(/\bel\s+(?:dia\s+)?(\d{1,2})(?![\d/-])\b/) : null;
  if (iso) {target=DateTime.fromObject({year:Number(iso[1]),month:Number(iso[2]),day:Number(iso[3])},{zone:timeZone});hasDate=true;consume(iso);}
  else if (numeric) {target=DateTime.fromObject({year:Number(numeric[3]),month:Number(numeric[2]),day:Number(numeric[1])},{zone:timeZone});hasDate=true;consume(numeric);}
  else if (named) {
    if (!named[3]) return fail('¿De qué año es esa fecha?');
    target=DateTime.fromObject({year:Number(named[3]),month:months.indexOf(named[2])+1,day:Number(named[1])},{zone:timeZone});hasDate=true;consume(named);
  } else if (relativeDay !== undefined) {
    const match = /^(pasado manana|manana|hoy)\b/.exec(source.slice(relativeDay))!;
    target=target.plus({days:match[1]==='pasado manana'?2:match[1]==='manana'?1:0});hasDate=true;ranges.push([relativeDay,relativeDay+match[0].length]);
  } else if (weekly || dayName) {
    const match=weekly ?? dayName!;
    let days=(weekdays.indexOf(match[1])+1-localNow.weekday+7)%7;
    if (dayName && days===0) days=7;
    target=target.plus({days});hasDate=true;if(dayName)consume(dayName);
  } else if (monthDay) {
    const day=Number(monthDay[1]);
    if(day<1 || day>31) return fail('¿Qué día del mes, entre 1 y 31, quieres usar?');
    let month=target.startOf('month');
    // Find the next actual requested date; never reinterpret February 31 as February 28.
    for(let i=0;i<13;i++) {
      if(day<=month.daysInMonth!) {
        const candidate=month.set({day,hour,minute});
        if(candidate.toMillis()>=localNow.toMillis()){target=month.set({day});break;}
      }
      month=month.plus({months:1});
    }
    hasDate=true;consume(monthDay);
  }
  if(!hasDate && recurrence!=='daily') return fail('¿Qué fecha exacta quieres? Si es antes de un examen, dime la fecha del aviso y su hora.');
  if(!target.isValid) return fail('Esa fecha no existe. ¿Qué fecha quieres usar?');
  const expected={year:target.year,month:target.month,day:target.day,hour,minute};
  let result=DateTime.fromObject(expected,{zone:timeZone});
  if(result.toMillis()<localNow.toMillis() && (recurrence==='daily' || recurrence==='weekly')) {
    const nextDay=target.plus({days:recurrence==='daily'?1:7});
    result=DateTime.fromObject({year:nextDay.year,month:nextDay.month,day:nextDay.day,hour,minute},{zone:timeZone});
  }
  if(result.hour!==hour || result.minute!==minute || !result.isValid) return fail('Esa hora no existe por el cambio horario. ¿Qué otra hora quieres?');
  if(result.getPossibleOffsets().length>1) return fail('Esa hora ocurre dos veces por el cambio horario. Indica una hora que no sea ambigua.');
  return finish(result,recurrence);
}
