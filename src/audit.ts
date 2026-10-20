import {parseDocument,isMap} from 'yaml';
import {DateTime} from 'luxon';
import type {PropertyRule} from './core';
export interface AuditFinding {code:'duplicate'|'missing'|'type'|'invalid-yaml'|'broken-link';message:string}
export function auditProperties(content:string,rules:PropertyRule[]):AuditFinding[]{
 const findings:AuditFinding[]=[];
 const frontmatter=content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
 const doc=parseDocument(frontmatter??'',{uniqueKeys:true});
 for(const error of doc.errors)findings.push({code:error.code==='DUPLICATE_KEY'?'duplicate':'invalid-yaml',message:error.message.split('\n')[0]});
 if(doc.errors.length)return findings;
 const data=isMap(doc.contents)?doc.toJS() as Record<string,unknown>:{};
 for(const rule of rules)for(const [key,type]of Object.entries(rule.required)){
  if(!(key in data)){findings.push({code:'missing',message:`Falta la propiedad «${key}».`});continue;}
  const value=data[key];
  const valid=type==='array'?Array.isArray(value):type==='date'?typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&DateTime.fromISO(value).isValid:typeof value===type;
  if(!valid)findings.push({code:'type',message:`«${key}» debe tener tipo ${type}.`});
 }
 return findings;
}
export function recommendNotes(notes:{path:string;mtime:number;links:string[]}[],opened:Record<string,number>,active:string,now:number):{path:string;reason:string;score:number}[]{
 return notes.filter(n=>n.path!==active).map(n=>{
  const related=n.links.includes(active);const last=opened[n.path];
  const age=now-(last??n.mtime);const days=Math.max(0,Math.floor(age/86400000));
  return {path:n.path,score:(related?100:0)+Math.min(days,90),reason:`${related?'Enlaza con la nota actual. ':''}${last?`Última apertura registrada hace ${days} días.`:`Sin apertura registrada por Miauwi; modificación hace ${days} días.`}`};
 }).sort((a,b)=>b.score-a.score).slice(0,8);
}
