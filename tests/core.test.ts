import {describe,it,expect} from 'vitest';
import {normalizeData, normalizeSettings, commandNames, shouldConsult, classifyLocal} from '../src/core';
import {auditProperties,recommendNotes} from '../src/audit';

describe('preferences and command identity',()=>{
 it('uses a renamed pet for all palette labels',()=>{
  expect(commandNames('Miau').every(c=>c.name.startsWith('Miau: '))).toBe(true);
  expect(commandNames('Miau').some(c=>c.id==='chat')).toBe(true);
 });
 it('clamps malformed settings without accepting broad folder defaults',()=>{
  const s=normalizeSettings({name:'  ',size:-100,agentIntervalMinutes:3,allowedFolders:['../secrets','.obsidian','Physics']});
  expect(s.name).toBe('Miauwi'); expect(s.size).toBeGreaterThanOrEqual(32);
  expect(s.allowedFolders).toEqual(['Physics']); expect(s.agentProvider).toBe('none');
 });
 it('refuses newer data versions to avoid destructive downgrade',()=>{
  expect(()=>normalizeData({schemaVersion:9})).toThrow(/versión/i);
 });
 it('does not reset a malformed persisted reminder container',()=>{
  expect(()=>normalizeData({schemaVersion:1,reminders:{damaged:true}})).toThrow(/recordatorios/i);
 });
 it('never promotes local conversation into external agent history on migration',()=>{
  const data=normalizeData({history:[{role:'assistant',content:'Secret task from private folder',at:'2026-10-20'}]});
  expect(data.agentHistory).toEqual([]);
 });
 it('recognizes custom invocation and local commands without an agent',()=>{
  expect(classifyLocal('Miau, ve a dormir','Miau').kind).toBe('sleep');
  expect(classifyLocal('Miau, ¿qué tengo pendiente mañana?','Miau').kind).toBe('tasks');
  expect(classifyLocal('recuérdame mañana a las 7 p. m. estudiar','Miau').kind).toBe('reminder');
 });
});
describe('orchestration',()=>{
 const base={now:10000000,lastRun:0,intervalMinutes:30,busy:false,focused:true,focusMode:false,quiet:false,changed:true,hourlyCount:0,maxHourly:3};
 it('suppresses equivalent context, focus, busy, quiet and inactive calls',()=>{
  expect(shouldConsult(base)).toBe(true);
  for(const change of [{busy:true},{focusMode:true},{quiet:true},{focused:false},{changed:false},{hourlyCount:3},{intervalMinutes:0}])expect(shouldConsult({...base,...change})).toBe(false);
 });
});
describe('local audit',()=>{
 it('reports duplicate properties and wrong types while leaving source unchanged',()=>{
  const note='---\nAsignatura: Física\nAsignatura: Otra\nEstado: 42\nFecha: 2026-02-30\n---\n# Tema';
  const findings=auditProperties(note,[{folder:'',required:{Asignatura:'string',Estado:'string',Fecha:'date'}}]);
  expect(findings.map(f=>f.code)).toContain('duplicate');
  expect(note).toContain('Estado: 42');
 });
 it('never calls an old modification an unread note',()=>{
  const results=recommendNotes([{path:'Fisica.md',mtime:0,links:['Maxwell.md']},{path:'Maxwell.md',mtime:1,links:[]}],{'Fisica.md':100},'Maxwell.md',10000000000);
  expect(results.find(r=>r.path==='Fisica.md')?.reason).toContain('apertura registrada');
  expect(results.some(r=>r.reason.includes('nunca leída'))).toBe(false);
 });
});
