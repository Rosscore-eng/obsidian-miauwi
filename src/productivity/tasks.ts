import { DateTime, IANAZone } from 'luxon';

export interface MarkdownTask {
  id: string; path: string; line: number; raw: string; title: string; completed: boolean;
  due?: string; scheduled?: string; completedOn?: string; priority: number; recurring: boolean;
}

type TaskQuery = 'pending'|'tomorrow'|'week'|'overdue'|'urgent'|'done-today';
interface SourceLine { text: string; eol: string; start: number; end: number }
const checkbox = /^(\s*(?:[-+*]|\d+[.)])\s+)\[([^\]])\](\s+)(.*)$/;
function sourceLines(content: string): SourceLine[] {
  const lines: SourceLine[]=[];
  const pattern=/([^\r\n]*)(\r\n|\n|\r|$)/g;
  let match: RegExpExecArray | null;
  while((match=pattern.exec(content)) && match[0]) lines.push({text:match[1],eol:match[2],start:match.index,end:pattern.lastIndex});
  return lines;
}
function date(value: string | undefined): string | undefined {
  if(!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return DateTime.fromISO(value,{zone:'UTC'}).isValid ? value : undefined;
}
function taskFromLine(raw: string, path: string, line: number): MarkdownTask | null {
  const match=checkbox.exec(raw);
  if(!match) return null;
  const body=match[4];
  const due=date(/📅\s*(\d{4}-\d{2}-\d{2})/.exec(body)?.[1]);
  const scheduled=date(/⏳\s*(\d{4}-\d{2}-\d{2})/.exec(body)?.[1]);
  const completedOn=date(/✅\s*(\d{4}-\d{2}-\d{2})/.exec(body)?.[1]);
  const priority=body.includes('🔺')?0:body.includes('⏫') || /#(?:urgent|urgente)\b/i.test(body)?1:body.includes('🔼')?2:body.includes('🔽')?4:body.includes('⏬')?5:3;
  const block=/\s\^([A-Za-z0-9-]+)\s*$/.exec(body)?.[1];
  const title=body.replace(/(?:📅|⏳|✅|🛫|➕|❌)\s*\d{4}-\d{2}-\d{2}/gu,'').replace(/🔁\s*[^📅⏳✅🛫➕❌🔺⏫🔼🔽⏬🏁]*/gu,'').replace(/[🔺⏫🔼🔽⏬]/gu,'').replace(/\s\^[A-Za-z0-9-]+\s*$/,'').replace(/\s+/g,' ').trim();
  const identity=raw.replace(checkbox,(_all,prefix:string,_state:string,space:string,text:string)=>`${prefix}[ ]${space}${text}`).replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/u,'');
  return {id:`${path}:${block?`^${block}`:`task:${encodeURIComponent(identity)}`}`,path,line,raw,title,completed:/^x$/i.test(match[2]),...(due?{due}:{}),...(scheduled?{scheduled}:{}),...(completedOn?{completedOn}:{}),priority,recurring:body.includes('🔁')};
}

/** Parse checkbox tasks, excluding initial YAML and fenced code. Line numbers are zero-based. */
export function parseTasks(content: string, path: string): MarkdownTask[] {
  const lines=sourceLines(content);
  const tasks: MarkdownTask[]=[];
  let frontmatter=lines[0]?.text.replace(/^\uFEFF/,'').trim()==='---';
  let fence: {char:string;length:number}|null=null;
  const occurrences=new Map<string,number>();
  for(let line=0;line<lines.length;line++) {
    const raw=lines[line].text;
    if(frontmatter) { if(line>0 && /^(?:---|\.\.\.)\s*$/.test(raw)) frontmatter=false; continue; }
    // List-nested fenced examples may have more than three leading spaces.
    const marker=/^[ \t]*(`{3,}|~{3,})(.*)$/.exec(raw);
    if(fence) {
      if(marker && marker[1][0]===fence.char && marker[1].length>=fence.length && !marker[2].trim()) fence=null;
      continue;
    }
    if(marker){fence={char:marker[1][0],length:marker[1].length};continue;}
    const task=taskFromLine(raw,path,line);
    if(task){if(!task.id.includes(':^')){const count=occurrences.get(task.id)??0;occurrences.set(task.id,count+1);task.id+=`:${count}`;}tasks.push(task);}
  }
  return tasks;
}

export function filterTasks(tasks: MarkdownTask[], query: TaskQuery, now: Date, timeZone: string): MarkdownTask[] {
  if(!IANAZone.isValidZone(timeZone) || !Number.isFinite(now.getTime())) throw new Error('La fecha o zona horaria no es válida.');
  const current=DateTime.fromJSDate(now,{zone:timeZone});
  const today=current.toISODate()!;
  const tomorrow=current.plus({days:1}).toISODate()!;
  const weekEnd=current.endOf('week').toISODate()!;
  return tasks.filter(task=>{
    const target=task.due ?? task.scheduled;
    if(query==='done-today') return task.completed && task.completedOn===today;
    if(task.completed) return false;
    if(query==='pending') return true;
    if(query==='tomorrow') return target===tomorrow;
    if(query==='week') return Boolean(target && target>=today && target<=weekEnd);
    if(query==='overdue') return Boolean(task.due && task.due<today);
    if(query==='urgent') return task.priority<=1;
    return false;
  }).map(task=>({...task}));
}

/** Caller must invoke this transform inside Vault.process after an explicit task selection. */
export function completeTaskText(content: string, task: MarkdownTask, today: string, toggle?: (line:string,path:string)=>string): string {
  if(!date(today)) throw new Error('La fecha de finalización no es válida.');
  const line=sourceLines(content)[task.line];
  const current=parseTasks(content,task.path).find(item=>item.line===task.line);
  if(!line || line.text!==task.raw || !current || current.completed!==task.completed) throw new Error('La tarea cambió. Actualiza la lista y vuelve a elegirla.');
  if(current.completed) return content;
  if(current.recurring && !toggle) throw new Error('Instala y habilita Tasks para completar una tarea recurrente sin perder su próxima ocurrencia.');
  let replacement: string;
  if(toggle) replacement=toggle(current.raw,task.path);
  else {
    const match=checkbox.exec(current.raw)!;
    if(match[2]!==' ' && match[2]!=='/') throw new Error('El estado personalizado de esta tarea requiere el complemento Tasks.');
    const withoutDone=current.raw.replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/u,'');
    const checked=withoutDone.replace(checkbox,(_whole,prefix:string,_status:string,space:string,body:string)=>`${prefix}[x]${space}${body}`);
    const block=/\s+\^[A-Za-z0-9-]+\s*$/.exec(checked);
    replacement=block ? `${checked.slice(0,block.index).trimEnd()} ✅ ${today}${block[0]}` : `${checked.trimEnd()} ✅ ${today}`;
  }
  if(typeof replacement!=='string' || replacement.includes('\0')) throw new Error('Tasks devolvió un resultado inválido.');
  if(toggle&&replacement.trim()&&!parseTasks(replacement,task.path).some(t=>t.completed&&t.title===current.title))throw new Error('Tasks avanzaría a un estado intermedio, no completado. Completa esta tarea desde Tasks; no se modificó.');
  const eol=line.eol || /\r\n|\n|\r/.exec(content)?.[0] || '\n';
  const normalized=replacement.replace(/\r\n|\n|\r/g,eol).replace(new RegExp(`(?:${eol==='\r\n'?'\\r\\n':eol==='\r'?'\\r':'\\n'})+$`),'');
  if(!normalized) return content.slice(0,line.start)+content.slice(line.end);
  return content.slice(0,line.start)+normalized+line.eol+content.slice(line.end);
}

export function createTaskText(content: string, title: string, due?: string): string {
  const clean=title.trim();
  if(!clean || /[\r\n\0]/.test(clean) || /^[-+*]\s*\[/.test(clean)) throw new Error('Escribe una sola descripción de tarea.');
  if(due!==undefined && !date(due)) throw new Error('La fecha de vencimiento no es válida.');
  const taskLine=`- [ ] ${clean}${due?` 📅 ${due}`:''}`;
  if(parseTasks(content,'').some(task=>!task.completed && task.raw.trim()===taskLine)) return content;
  const eol=/\r\n|\n|\r/.exec(content)?.[0] || '\n';
  const separator=content && !/(?:\r\n|\n|\r)$/.test(content)?eol:'';
  return `${content}${separator}${taskLine}${eol}`;
}
