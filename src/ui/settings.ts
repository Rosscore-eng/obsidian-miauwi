import {App,PluginSettingTab,Setting} from 'obsidian';
import type {Plugin} from 'obsidian';
import type {Settings} from '../core';
export interface SettingsHost {
 settings:Settings;updateSettings:(patch:Partial<Settings>)=>Promise<void>;
 detectAgents:()=>Promise<void>;initializeResources:()=>Promise<void>;clearHistory:()=>Promise<void>;
 reportError:(e:unknown)=>void;
 personalityOptions:()=>Record<string,string>;
}
export class MiauwiSettingsTab extends PluginSettingTab {
 constructor(app:App,plugin:Plugin,private host:SettingsHost){super(app,plugin);}
 display(){
  const el=this.containerEl;el.empty();const s=this.host.settings;
  const update=(patch:Partial<Settings>)=>{void this.host.updateSettings(patch).catch(this.host.reportError);};
  const title=(text:string)=>el.createEl('h3',{text});
  const text=(name:string,key:'name'|'codexExecutable'|'claudeExecutable'|'resourcesFolder'|'timeZone'|'quietStart'|'quietEnd'|'customProfilesPath'|'skinPath',desc:string)=>new Setting(el).setName(name).setDesc(desc).addText(t=>t.setValue(s[key]).onChange(v=>update({[key]:v})));
  const toggle=(name:string,key:'sleepScene'|'reducedMotion'|'focusMode'|'lowPower'|'saveHistory'|'dueAlerts',desc:string)=>new Setting(el).setName(name).setDesc(desc).addToggle(t=>t.setValue(s[key]).onChange(v=>update({[key]:v})));
  const number=(name:string,key:'size'|'speed'|'activity'|'idleMinutes'|'maxHourly'|'timeoutSeconds',min:number,max:number,step:number)=>new Setting(el).setName(name).addSlider(t=>t.setLimits(min,max,step).setValue(s[key]).setDynamicTooltip().onChange(v=>update({[key]:v})));
  el.createEl('h2',{text:s.name});
  title('Mascota');
  text('Nombre','name','Nombre visible y nombres de comandos. El identificador técnico miauwi permanece estable.');
  number('Tamaño','size',32,160,8);number('Velocidad','speed',0.25,3,0.25);number('Actividad','activity',0,1,0.05);
  new Setting(el).setName('Personalidad').addDropdown(d=>d.addOptions({travieso:'Gato travieso',cientifico:'Gato científico',adorable:'Gato adorable',caotico:'Gato caótico',academico:'Gato académico',...this.host.personalityOptions()}).setValue(s.personality).onChange(v=>update({personality:v})));
  text('Perfiles JSON personalizados','customProfilesPath','Ruta dentro del vault; déjala vacía para usar los perfiles incluidos.');
  text('Paquete de sprites JSON','skinPath','Ruta de un paquete local compatible. Consulta examples/skins/README.md.');
  title('Comportamiento y rendimiento');
  toggle('Modo concentración','focusMode','Silencia comentarios y consultas periódicas. Los recordatorios siguen apareciendo.');
  number('Minutos antes de dormir','idleMinutes',1,120,1);toggle('Escena de sueño','sleepScene','Escena tenue y no bloqueante.');
  toggle('Reducir movimiento','reducedMotion','También se respeta la preferencia del sistema.');
  toggle('Bajo consumo','lowPower','Reduce actividad y movimiento; se pausa al ocultar la aplicación.');
  text('Inicio del horario silencioso','quietStart','HH:mm en la zona configurada.');text('Fin del horario silencioso','quietEnd','Si son iguales, se desactiva.');
  title('Productividad');
  text('Zona horaria','timeZone','Zona IANA, por ejemplo America/Lima. Los avisos funcionan con Obsidian abierto.');
  toggle('Avisos de tareas próximas','dueAlerts','Aviso local de tareas que vencen hoy, sin IA y sin modificar notas.');
  let rules=JSON.stringify(s.propertyRules,null,2);
  new Setting(el).setName('Reglas de propiedades por carpeta').setDesc('JSON: [{"folder":"Física","required":{"Asignatura":"string","Fecha":"date"}}]. Tipos: string, number, date, array.').addTextArea(t=>t.setValue(rules).onChange(v=>{rules=v;}));
  new Setting(el).addButton(b=>b.setButtonText('Guardar reglas').onClick(()=>{try{const parsed=JSON.parse(rules);if(!Array.isArray(parsed))throw new Error('Las reglas deben ser una lista.');void this.host.updateSettings({propertyRules:parsed}).catch(this.host.reportError);}catch(e){this.host.reportError(e);}}));
  title('Inteligencia opcional');
  el.createEl('p',{text:'Se envían instantáneas de las carpetas autorizadas al proveedor elegido. Usa tu autenticación CLI existente; pueden aplicarse sus límites de uso. Copilot no publica una API estable para estas sesiones. Claude Cowork no es Claude Code CLI.'});
  new Setting(el).setName('Proveedor').addDropdown(d=>d.addOptions({none:'Sin IA',codex:'Codex CLI',claude:'Claude Code CLI'}).setValue(s.agentProvider).onChange(v=>update({agentProvider:v as Settings['agentProvider']})));
  text('Ejecutable Codex','codexExecutable','Ruta absoluta a codex.exe (Windows) o binario ejecutable (macOS/Linux).');
  text('Ejecutable Claude Code','claudeExecutable','Ruta absoluta a claude.exe; no un comando de shell.');
  new Setting(el).setName('Detectar agentes instalados').addButton(b=>b.setButtonText('Detectar').onClick(async()=>{try{await this.host.detectAgents();this.display();}catch(e){this.host.reportError(e);}}));
  new Setting(el).setName('Carpetas autorizadas para IA').setDesc('Una ruta relativa por línea. Vacío = ningún archivo. No incluye historiales de otros chats.').addTextArea(t=>t.setValue(s.allowedFolders.join('\n')).onChange(v=>update({allowedFolders:v.split(/\r?\n/).map(p=>p.trim()).filter(Boolean)})));
  new Setting(el).setName('Consultas periódicas').addDropdown(d=>d.addOptions({'0':'Solo manual','15':'Cada 15 minutos','30':'Cada 30 minutos','60':'Cada 60 minutos'}).setValue(String(s.agentIntervalMinutes)).onChange(v=>update({agentIntervalMinutes:Number(v)})));
  number('Máximo de consultas por hora','maxHourly',1,20,1);number('Timeout (segundos)','timeoutSeconds',10,300,10);
  toggle('Guardar conversación local','saveHistory','Historial propio, hasta 100 mensajes. Nunca se importan chats privados automáticamente.');
  new Setting(el).setName('Borrar conversación de Miauwi').addButton(b=>b.setButtonText('Borrar').onClick(()=>{void this.host.clearHistory().catch(this.host.reportError);}));
  title('Recursos editables');text('Carpeta de recursos','resourcesFolder','Crear recursos es una acción explícita; no se sobrescriben archivos existentes.');
  new Setting(el).setName('Prompts y personalidades').addButton(b=>b.setButtonText('Crear recursos').onClick(()=>{void this.host.initializeResources().catch(this.host.reportError);}));
 }
}
