import {DateTime} from 'luxon';
import type {Reminder} from './productivity';

export interface PropertyRule {folder:string;required:Record<string,'string'|'number'|'date'|'array'>}
export interface Settings {
 name:string;size:number;speed:number;activity:number;personality:string;idleMinutes:number;
 sleepScene:boolean;reducedMotion:boolean;focusMode:boolean;lowPower:boolean;
 agentProvider:'none'|'codex'|'claude';codexExecutable:string;claudeExecutable:string;
 agentIntervalMinutes:number;maxHourly:number;timeoutSeconds:number;allowedFolders:string[];
 resourcesFolder:string;quietStart:string;quietEnd:string;timeZone:string;propertyRules:PropertyRule[];
 customProfilesPath:string;skinPath:string;saveHistory:boolean;dueAlerts:boolean;
}
export interface ChatEntry {role:'user'|'assistant';content:string;at:string}
export interface Data {
 schemaVersion:1;settings:Settings;reminders:Reminder[];history:ChatEntry[];agentHistory:ChatEntry[];agentScope:string;
 memory:{opened:Record<string,number>;lastAgentRun:number;agentRuns:number[];quietUntil:number;lastContext:string;findings:string[]};
}
export const DEFAULTS:Settings={name:'Miauwi',size:64,speed:1,activity:0.45,personality:'travieso',idleMinutes:5,sleepScene:true,reducedMotion:false,focusMode:false,lowPower:false,agentProvider:'none',codexExecutable:'',claudeExecutable:'',agentIntervalMinutes:0,maxHourly:3,timeoutSeconds:90,allowedFolders:[],resourcesFolder:'Miauwi',quietStart:'23:00',quietEnd:'07:00',timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone||'America/Lima',propertyRules:[],customProfilesPath:'',skinPath:'',saveHistory:true,dueAlerts:true};
const bounded=(value:unknown,fallback:number,min:number,max:number)=>typeof value==='number'&&Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
export function safeRelativePath(value:string):boolean {
 return value.length>0&&!/^[\\/]|^[a-z]:|[\u0000-\u001f]/i.test(value)&&!value.replace(/\\/g,'/').split('/').some(p=>p==='..'||p==='.'||p.startsWith('.')||!p);
}
export function normalizeSettings(input:unknown):Settings {
 const raw=input&&typeof input==='object'?input as Record<string,unknown>:{};
 const s={...DEFAULTS};
 for(const key of ['sleepScene','reducedMotion','focusMode','lowPower','saveHistory','dueAlerts'] as const)if(typeof raw[key]==='boolean')s[key]=raw[key];
 s.name=typeof raw.name==='string'?raw.name.replace(/[\u0000-\u001f]/g,'').trim().slice(0,40)||'Miauwi':'Miauwi';
 s.size=bounded(raw.size,64,32,160);s.speed=bounded(raw.speed,1,0.25,3);s.activity=bounded(raw.activity,0.45,0,1);s.idleMinutes=bounded(raw.idleMinutes,5,1,240);
 s.maxHourly=bounded(raw.maxHourly,3,1,20);s.timeoutSeconds=bounded(raw.timeoutSeconds,90,10,300);
 if([0,15,30,60].includes(Number(raw.agentIntervalMinutes)))s.agentIntervalMinutes=Number(raw.agentIntervalMinutes);
 if(['none','codex','claude'].includes(String(raw.agentProvider)))s.agentProvider=raw.agentProvider as Settings['agentProvider'];
 for(const key of ['codexExecutable','claudeExecutable','customProfilesPath','skinPath'] as const)if(typeof raw[key]==='string')s[key]=raw[key].trim();
 if(typeof raw.personality==='string'&&raw.personality.length<80)s.personality=raw.personality;
 if(typeof raw.resourcesFolder==='string'&&safeRelativePath(raw.resourcesFolder))s.resourcesFolder=raw.resourcesFolder.replace(/\\/g,'/');
 if(typeof raw.timeZone==='string'&&DateTime.now().setZone(raw.timeZone).isValid)s.timeZone=raw.timeZone;
 for(const key of ['quietStart','quietEnd'] as const)if(typeof raw[key]==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(raw[key]))s[key]=raw[key];
 s.allowedFolders=Array.isArray(raw.allowedFolders)?raw.allowedFolders.filter((f):f is string=>typeof f==='string'&&safeRelativePath(f)).map(f=>f.replace(/\\/g,'/')):[];
 if(Array.isArray(raw.propertyRules))s.propertyRules=raw.propertyRules.filter((r):r is PropertyRule=>!!r&&typeof r==='object'&&typeof r.folder==='string'&&(r.folder===''||safeRelativePath(r.folder))&&r.required&&typeof r.required==='object'&&!Array.isArray(r.required)&&Object.values(r.required).every(v=>['string','number','date','array'].includes(String(v))));
 return s;
}
export function normalizeData(value:unknown):Data {
 const raw=value&&typeof value==='object'?value as Record<string,unknown>:{};
 if(typeof raw.schemaVersion==='number'&&raw.schemaVersion>1)throw new Error('Los datos pertenecen a una versión más nueva. Actualiza Miauwi; no se sobrescribieron.');
 if(raw.reminders!==undefined&&!Array.isArray(raw.reminders))throw new Error('El archivo de recordatorios está dañado. No se sobrescribió; conserva una copia para repararlo.');
 const mem=raw.memory&&typeof raw.memory==='object'?raw.memory as Record<string,unknown>:{};
 const history=Array.isArray(raw.history)?raw.history.filter((h):h is ChatEntry=>h&&['user','assistant'].includes(h.role)&&typeof h.content==='string'&&typeof h.at==='string').slice(-100):[];
 const agentHistory=Array.isArray(raw.agentHistory)?raw.agentHistory.filter((h):h is ChatEntry=>h&&['user','assistant'].includes(h.role)&&typeof h.content==='string'&&typeof h.at==='string').slice(-16):[];
 return {schemaVersion:1,settings:normalizeSettings(raw.settings),reminders:Array.isArray(raw.reminders)?raw.reminders as Reminder[]:[],history,agentHistory,agentScope:typeof raw.agentScope==='string'?raw.agentScope:'',memory:{opened:mem.opened&&typeof mem.opened==='object'?Object.fromEntries(Object.entries(mem.opened).filter(([,v])=>typeof v==='number'&&Number.isFinite(v))):{},lastAgentRun:typeof mem.lastAgentRun==='number'?mem.lastAgentRun:0,agentRuns:Array.isArray(mem.agentRuns)?mem.agentRuns.filter((n):n is number=>typeof n==='number'):[],quietUntil:typeof mem.quietUntil==='number'?mem.quietUntil:0,lastContext:typeof mem.lastContext==='string'?mem.lastContext:'',findings:Array.isArray(mem.findings)?mem.findings.filter((f):f is string=>typeof f==='string').slice(-30):[]}};
}
export const commandNames=(name:string)=>[
 ['chat','Conversar'],['call','Ven aquí'],['sleep','Dormir'],['hide','Retirarse'],['focus','Alternar concentración'],['reminder','Nuevo recordatorio'],['reminders','Ver recordatorios'],['tasks','Ver tareas pendientes'],['audit','Revisar propiedades de esta nota'],['proofread','Sugerir correcciones de esta nota'],['discover','Recomendar una nota'],['agent','Consultar al agente'],['cancel','Cancelar consulta'],['resources','Crear prompts y perfiles editables']
].map(([id,label])=>({id,name:`${name}: ${label}`}));
export function shouldConsult(c:{now:number;lastRun:number;intervalMinutes:number;busy:boolean;focused:boolean;focusMode:boolean;quiet:boolean;changed:boolean;hourlyCount:number;maxHourly:number}):boolean {
 return c.intervalMinutes>0&&!c.busy&&c.focused&&!c.focusMode&&!c.quiet&&c.changed&&c.hourlyCount<c.maxHourly&&c.now-c.lastRun>=c.intervalMinutes*60000;
}
export function isQuiet(s:Settings,now:Date,quietUntil:number):boolean {
 if(now.getTime()<quietUntil)return true;
 const time=DateTime.fromJSDate(now).setZone(s.timeZone).toFormat('HH:mm');
 return s.quietStart===s.quietEnd?false:s.quietStart<s.quietEnd?time>=s.quietStart&&time<s.quietEnd:time>=s.quietStart||time<s.quietEnd;
}
export type LocalIntent={kind:'sleep'|'wake'|'hide'|'focus'|'quiet'|'reminder'|'reminders'|'tasks'|'complete'|'create-task'|'navigate'|'discover'|'audit'|'proofread'|'agent';text:string};
export function classifyLocal(input:string,name:string):LocalIntent {
 const escape=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const text=input.trim().replace(new RegExp(`^${escape}\\s*[,.:!?]?\\s*`,'i'),'');
 const lower=text.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
 let kind:LocalIntent['kind']='agent';
 if(/^(ve a dormir|duerme|a dormir)/.test(lower))kind='sleep';
 else if(/^(despierta|ven aqui|ven|vuelve)/.test(lower))kind='wake';
 else if(/^(retirate|escondete|vete)/.test(lower))kind='hide';
 else if(/concentracion/.test(lower))kind='focus';
 else if(/no me interrumpas|silencio/.test(lower))kind='quiet';
 else if(/^(elimina|cancela|cambia|pospon|edita).*(recordatorio|aviso)/.test(lower)||/^(mis |ver |lista de )?recordatorios/.test(lower))kind='reminders';
 else if(/recuerdame|avisame|recordar|recordatorio/.test(lower))kind='reminder';
 else if(/^(ya termine|marca como|tacha |acabo de completar|completa )/.test(lower))kind='complete';
 else if(/^(crea|agrega|anade).*(tarea|estudiar|planificacion)/.test(lower))kind='create-task';
 else if(/^(abre|llevame|busca una nota llamada)/.test(lower))kind='navigate';
 else if(/nota.*(olvidad|revisar|interesante)|encontraste interesante/.test(lower))kind='discover';
 else if(/propiedades|yaml/.test(lower))kind='audit';
 else if(/ortografia|corrige|correcciones/.test(lower))kind='proofread';
 else if(/tareas|pendiente|atrasad|urgente|entregas|cuales termine/.test(lower))kind='tasks';
 return {kind,text};
}
