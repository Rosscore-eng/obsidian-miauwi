import {Plugin,Notice,Menu,TFile,TFolder,normalizePath,Platform,type Command} from 'obsidian';
import {DateTime} from 'luxon';
import {normalizeData,normalizeSettings,commandNames,classifyLocal,shouldConsult,isQuiet,safeRelativePath,type Data,type Settings} from './core';
import {PetController,validatePersonalityProfiles,getPersonality,type PersonalityProfile,type PetOptions,type SkinPack} from './pet';
import {ReminderManager,parseReminder,parseTasks,filterTasks,completeTaskText,createTaskText,type Reminder,type MarkdownTask} from './productivity';
import {AgentService,discoverExecutables,isAllowedPath,type AgentReply,type ContextNote} from './intelligence';
import {auditProperties,recommendNotes} from './audit';
import {PROMPTS,RESPONSE_CONTRACT} from './resources';
import {CHAT_VIEW,ChatView} from './ui/chat';
import {MiauwiSettingsTab} from './ui/settings';
import {InputDialog,ConfirmDialog,ChoiceDialog,type Choice} from './ui/dialogs';

export default class MiauwiPlugin extends Plugin {
 data!:Data;declare settings:Settings;pet?:PetController;reminders!:ReminderManager;agent!:AgentService;
 private stopped=false;private saveQueue:Promise<void>=Promise.resolve();private commands:Command[]=[];
 private taskIndex=new Map<string,MarkdownTask[]>();private indexed=false;private indexing?:Promise<void>;
 private contextRevision=0;private dueNotified=new Set<string>();private tickBusy=false;private noteTimer?:number;
 private profiles?:Record<string,PersonalityProfile>;
 private pendingReminder?:{text:string;task?:MarkdownTask};
 reportError=(e:unknown)=>{const message=e instanceof Error?e.message:String(e);new Notice(`${this.settings?.name??'Miauwi'}: ${message}`,8000);this.chatViews().forEach(v=>v.setStatus(message));};
 async onload(){
  this.data=normalizeData(await this.loadData());
  this.settings=this.data.settings;
  this.reminders=new ReminderManager(this.data.reminders,async items=>{await this.persist({reminders:items});});
  if(this.data.agentScope!==this.agentScope()){this.data.agentHistory=[];this.data.agentScope=this.agentScope();}
  this.agent=new AgentService(this.agentConfig());
  this.registerView(CHAT_VIEW,leaf=>new ChatView(leaf,{name:()=>this.settings.name,history:()=>this.data.history,send:text=>this.handleChat(text),cancel:()=>this.agent.cancel(),quick:action=>this.run(()=>this.action(action))}));
  this.addSettingTab(new MiauwiSettingsTab(this.app,this,this));
  for(const c of commandNames(this.settings.name)){const registered=this.addCommand({...c,callback:()=>this.run(()=>this.action(c.id))});registered.name=c.name;this.commands.push(registered);}
  this.addRibbonIcon('cat',this.settings.name,()=>this.run(()=>this.openChat()));
  this.registerEvent(this.app.workspace.on('file-open',file=>{if(file)this.onFileOpen(file);}));
  this.registerEvent(this.app.vault.on('modify',file=>{if(file instanceof TFile&&file.extension==='md'){this.contextRevision++;if(this.indexed)this.run(()=>this.readTaskFile(file));}}));
  this.registerEvent(this.app.vault.on('create',file=>{if(file instanceof TFile&&file.extension==='md'&&this.indexed)this.run(()=>this.readTaskFile(file));}));
  this.registerEvent(this.app.vault.on('delete',file=>{this.taskIndex.delete(file.path);delete this.data.memory.opened[file.path];this.contextRevision++;}));
  this.registerEvent(this.app.vault.on('rename',(file,old)=>{this.taskIndex.delete(old);if(file instanceof TFile&&this.indexed)this.run(()=>this.readTaskFile(file));if(this.data.memory.opened[old]){this.data.memory.opened[file.path]=this.data.memory.opened[old];delete this.data.memory.opened[old];}this.contextRevision++;}));
  this.registerInterval(window.setInterval(()=>this.run(()=>this.tick()),15000));
  this.registerDomEvent(document,'visibilitychange',()=>{if(!document.hidden)this.run(()=>this.tick());});
  this.app.workspace.onLayoutReady(()=>{
   if(this.stopped)return;
   this.pet=new PetController(this.app.workspace.containerEl,this.petOptions());
   this.pet.show();this.pet.focus(this.settings.focusMode);
   this.run(async()=>{await this.loadCustomAssets();if(this.settings.dueAlerts)await this.ensureTaskIndex();await this.tick();});
   const active=this.app.workspace.getActiveFile();if(active)this.onFileOpen(active);
  });
 }
 onunload(){this.stopped=true;this.pet?.destroy();this.agent?.dispose();if(this.noteTimer)window.clearTimeout(this.noteTimer);this.taskIndex.clear();}
 private run(fn:()=>Promise<unknown>|void){try{Promise.resolve(fn()).catch(this.reportError);}catch(e){this.reportError(e);}}
 private chatViews(){return this.app.workspace.getLeavesOfType(CHAT_VIEW).map(l=>l.view).filter((v):v is ChatView=>v instanceof ChatView);}
 private async persist(overrides:Partial<Data>={}){
  const save=this.saveQueue.catch(()=>{}).then(async()=>{
   const snapshot=JSON.parse(JSON.stringify({...this.data,...overrides,history:this.settings.saveHistory?this.data.history:[],agentHistory:this.settings.saveHistory?this.data.agentHistory:[]}));
   await this.saveData(snapshot);Object.assign(this.data,overrides);
  });this.saveQueue=save;await save;
 }
 async updateSettings(patch:Partial<Settings>){
  const previous=this.settings;this.data.settings=normalizeSettings({...previous,...patch});this.settings=this.data.settings;
  if(this.data.agentScope!==this.agentScope()){this.data.agentHistory=[];this.data.agentScope=this.agentScope();}
  await this.persist();
  this.pet?.update(this.petOptions());this.agent.update(this.agentConfig());
  const labels=commandNames(this.settings.name);this.commands.forEach((command,i)=>{command.name=labels[i].name;});
  if(patch.customProfilesPath!==undefined||patch.skinPath!==undefined)await this.loadCustomAssets();
  if(patch.dueAlerts)await this.ensureTaskIndex();
  this.chatViews().forEach(v=>v.render());
 }
 private petOptions():PetOptions{return {name:this.settings.name,size:this.settings.size,speed:this.settings.lowPower?0.4:this.settings.speed,activity:this.settings.lowPower?0.1:this.settings.activity,personality:this.settings.personality,reducedMotion:this.settings.reducedMotion||this.settings.lowPower,idleMinutes:this.settings.idleMinutes,sleepScene:this.settings.sleepScene,quiet:isQuiet(this.settings,new Date(),this.data.memory.quietUntil),onInteract:()=>this.run(()=>this.openChat()),onMenu:e=>this.openMenu(e)};}
 personalityOptions(){return Object.fromEntries(Object.entries(this.profiles??{}).map(([key,value])=>[key,value.label]));}
 private agentConfig(){const s=this.settings;return {provider:Platform.isDesktopApp?s.agentProvider:'none' as const,executable:s.agentProvider==='claude'?s.claudeExecutable:s.codexExecutable,timeoutMs:s.timeoutSeconds*1000,allowedFolders:s.allowedFolders,maxContextChars:24000};}
 private onFileOpen(file:TFile){
  this.data.memory.opened[file.path]=Date.now();
  const entries=Object.entries(this.data.memory.opened).sort((a,b)=>b[1]-a[1]);this.data.memory.opened=Object.fromEntries(entries.slice(0,5000));
  this.contextRevision++;this.pet?.reactToNote();
  if(this.noteTimer)window.clearTimeout(this.noteTimer);
  this.noteTimer=window.setTimeout(()=>this.run(()=>this.persist()),2000);
 }
 async action(id:string):Promise<void>{
  switch(id){
   case 'chat':await this.openChat();break;
   case 'call':this.pet?.show();this.pet?.wake();break;
   case 'sleep':this.pet?.sleep();break;
   case 'hide':this.pet?.hide();break;
   case 'focus':await this.updateSettings({focusMode:!this.settings.focusMode});this.pet?.focus(this.settings.focusMode);await this.reply(this.settings.focusMode?'Modo concentración activado. Los recordatorios siguen activos.':'Ya puedo acompañarte de nuevo.');break;
   case 'reminder':this.newReminder();break;
   case 'reminders':this.showReminders();break;
   case 'tasks':await this.showTasks('pending');break;
   case 'audit':await this.auditActive();break;
   case 'proofread':await this.askAgent('revisar-ortografia','Revisa la ortografía de esta nota. Presenta original y sugerencia; no cambies el archivo.',true,true);break;
   case 'discover':await this.discoverNote();break;
   case 'agent':await this.askAgent('comentar-nota','Comenta algo útil del contexto autorizado.',true);break;
   case 'cancel':this.agent.cancel();break;
   case 'resources':await this.initializeResources();break;
  }
 }
 private openMenu(event:MouseEvent){
  event.preventDefault();const menu=new Menu();
  for(const [title,id]of [['Conversar','chat'],['Ven aquí','call'],['Dormir','sleep'],['Concentración','focus'],['Recordatorios','reminders'],['Tareas','tasks'],['Retirarse','hide']])menu.addItem(item=>item.setTitle(`${this.settings.name}: ${title}`).onClick(()=>this.run(()=>this.action(id))));
  menu.showAtMouseEvent(event);
 }
 async openChat(){let leaf=this.app.workspace.getLeavesOfType(CHAT_VIEW)[0];if(!leaf){leaf=this.app.workspace.getRightLeaf(false)??this.app.workspace.getLeaf(true);await leaf.setViewState({type:CHAT_VIEW,active:true});}await this.app.workspace.revealLeaf(leaf);}
 private async reply(content:string,urgent=false){
  this.data.history.push({role:'assistant',content,at:new Date().toISOString()});this.data.history=this.data.history.slice(-100);
  await this.persist();this.pet?.say(content,urgent);this.chatViews().forEach(v=>{v.setStatus('');v.render();});
 }
 async clearHistory(){this.data.history=[];this.data.agentHistory=[];await this.persist();this.chatViews().forEach(v=>v.render());}
 async handleChat(input:string){
  this.data.history.push({role:'user',content:input.slice(0,6000),at:new Date().toISOString()});this.data.history=this.data.history.slice(-100);await this.persist();this.chatViews().forEach(v=>v.render());
  const intent=classifyLocal(input,this.settings.name);
  if(this.pendingReminder){
   if(/^(cancelar?|olvida(lo)?|cancela eso)$/i.test(intent.text)){this.pendingReminder=undefined;await this.reply('Solicitud de recordatorio descartada.');return;}
   if(intent.kind==='agent'||intent.kind==='reminder'){const pending=this.pendingReminder;this.pendingReminder=undefined;await this.proposeReminder(`${pending.text} ${intent.text}`,pending.task);return;}
   this.pendingReminder=undefined;
  }
  switch(intent.kind){
   case 'sleep':this.pet?.sleep();await this.reply('Me voy a dormir. Puedes llamarme cuando quieras.');break;
   case 'wake':this.pet?.show();this.pet?.wake();await this.reply('Aquí estoy. ¿Seguimos?');break;
   case 'hide':this.pet?.hide();await this.reply('Me retiro. Usa el comando «Ven aquí» para llamarme.');break;
   case 'focus':await this.action('focus');break;
   case 'quiet':{
    const m=intent.text.match(/(?:durante|por)?\s*(\d+)\s*(hora|minuto)/i);const one=/una hora/i.test(intent.text);
    if(!m&&!one){await this.reply('¿Durante cuántos minutos u horas? Por ejemplo: «no me interrumpas durante 45 minutos».');break;}
    const minutes=one?60:Number(m![1])*(m![2].toLowerCase().startsWith('hora')?60:1);
    if(minutes<=0||minutes>1440){await this.reply('Elige un intervalo entre 1 minuto y 24 horas.');break;}
    this.data.memory.quietUntil=Date.now()+minutes*60000;await this.reply(`Silencio durante ${minutes} minutos. Los recordatorios siguen activos.`);break;
   }
   case 'reminder':await this.proposeReminder(intent.text);break;
   case 'reminders':this.showReminders();await this.reply('Elige un recordatorio para editarlo, posponerlo o cancelarlo.');break;
   case 'tasks':{
    const t=intent.text.toLowerCase();const q=/mañana/.test(t)?'tomorrow':/semana/.test(t)?'week':/atrasad|vencid/.test(t)?'overdue':/urgente/.test(t)?'urgent':/termin[eé]|complet/.test(t)?'done-today':'pending';await this.showTasks(q);break;
   }
   case 'complete':await this.chooseCompletion(intent.text);break;
   case 'create-task':this.newTask(intent.text);break;
   case 'navigate':await this.navigate(intent.text);break;
   case 'discover':await this.discoverNote();break;
   case 'audit':await this.auditActive();break;
   case 'proofread':await this.action('proofread');break;
   default:if(this.settings.agentProvider==='none')await this.reply('Puedo ayudarte con tareas, recordatorios, abrir notas, revisar propiedades o concentrarte sin IA. Para preguntas abiertas, configura un agente opcional en Ajustes.');else await this.askAgent('generar-dialogo',intent.text,true);
  }
 }
 private newReminder(){new InputDialog(this.app,`${this.settings.name}: nuevo recordatorio`,[{label:'Qué y cuándo',placeholder:'Recuérdame mañana a las 7 p. m. estudiar Física'}],async([text])=>this.proposeReminder(text)).open();}
 private async proposeReminder(text:string,task?:MarkdownTask){
  const parsed=parseReminder(text,new Date(),this.settings.timeZone);
  if(!parsed.ok){this.pendingReminder={text,task};await this.reply(`${parsed.question}\nPuedes responder aquí o decir «cancelar».`);return;}
  this.pendingReminder=undefined;
  const when=DateTime.fromISO(parsed.dueAt).setZone(parsed.timeZone).setLocale('es').toFormat("cccc d 'de' LLLL yyyy, HH:mm ZZZZ");
  new ConfirmDialog(this.app,'Confirmar recordatorio',`«${parsed.title}»\n${when}\nRepetición: ${{none:'ninguna',daily:'diaria',weekly:'semanal',monthly:'mensual'}[parsed.recurrence]}${task?`\nVinculado a: ${task.path} → ${task.title}`:''}\nSe avisará con Obsidian abierto.`,async()=>{
   if(task){const file=this.app.vault.getAbstractFileByPath(task.path);if(!(file instanceof TFile)||!parseTasks(await this.app.vault.read(file),task.path).some(t=>t.id===task.id&&!t.completed))throw new Error('La tarea cambió. Vuelve a elegirla antes de vincular el aviso.');}
   await this.reminders.create({...parsed,origin:task?'task':'chat',...task?{taskId:task.id,notePath:task.path}: {}});await this.reply(`Te recordaré ${parsed.title} el ${when}.`);
  }).open();
 }
 private showReminders(){
  const active=this.reminders.list().filter(r=>r.status==='active').sort((a,b)=>a.nextRun.localeCompare(b.nextRun));
  new ChoiceDialog(this.app,`${this.settings.name}: recordatorios`,active.map(r=>({label:r.title,description:`${DateTime.fromISO(r.nextRun).setZone(r.timeZone).toFormat('dd/LL/yyyy HH:mm')} · ${r.timeZone} · ${r.recurrence}`,run:()=>this.reminderActions(r)}))).open();
 }
 private reminderActions(r:Reminder){
  new ChoiceDialog(this.app,r.title,[{label:'Posponer 10 minutos',run:async()=>{await this.reminders.snooze(r.id,10);await this.reply('Recordatorio pospuesto 10 minutos.');}},{label:'Editar',run:()=>this.editReminder(r)},{label:'Cancelar',run:()=>new ConfirmDialog(this.app,'Cancelar recordatorio',r.title,async()=>{await this.reminders.cancel(r.id);await this.reply('Recordatorio cancelado.');}).open()}]).open();
 }
 private editReminder(r:Reminder){
  new InputDialog(this.app,'Editar recordatorio',[{label:'Título',value:r.title},{label:'Fecha y hora (AAAA-MM-DD HH:mm)',value:DateTime.fromISO(r.nextRun).setZone(r.timeZone).toFormat('yyyy-MM-dd HH:mm')},{label:'Zona IANA',value:r.timeZone},{label:'Repetición: none, daily, weekly o monthly',value:r.recurrence}],async([title,when,zone,recurrence])=>{
   const dt=DateTime.fromFormat(when,'yyyy-MM-dd HH:mm',{zone});if(!dt.isValid||dt.toFormat('yyyy-MM-dd HH:mm')!==when||dt.toMillis()<=Date.now())throw new Error('Indica una fecha futura válida en la zona elegida.');
   if(!['none','daily','weekly','monthly'].includes(recurrence))throw new Error('Repetición no válida.');
   await this.reminders.edit(r.id,{title,dueAt:dt.toISO()!,timeZone:zone,recurrence:recurrence as Reminder['recurrence']});await this.reply('Recordatorio actualizado.');
  }).open();
 }
 private async readTaskFile(file:TFile){if(this.stopped)return;const text=await this.app.vault.cachedRead(file);if(!this.stopped){const tasks=parseTasks(text,file.path);this.taskIndex.set(file.path,tasks);const linked=new Set(this.reminders.list().filter(r=>r.status==='active').map(r=>r.taskId));for(const task of tasks)if(task.completed&&linked.has(task.id))await this.reminders.cancelForTask(task.id);}}
 private async ensureTaskIndex(){
  if(this.indexed)return;if(this.indexing)return this.indexing;
  this.indexing=(async()=>{
   const files=this.app.vault.getMarkdownFiles();let count=0;
   for(const file of files){if(this.stopped)return;const cache=this.app.metadataCache.getFileCache(file);if(!cache||cache.listItems?.some(item=>typeof item.task==='string'))await this.readTaskFile(file);if(++count%30===0)await new Promise(resolve=>window.setTimeout(resolve,0));}
   this.indexed=true;
  })();
  try{await this.indexing;}finally{this.indexing=undefined;}
 }
 private allTasks(){return [...this.taskIndex.values()].flat();}
 private async showTasks(query:'pending'|'tomorrow'|'week'|'overdue'|'urgent'|'done-today'){
  await this.ensureTaskIndex();const tasks=filterTasks(this.allTasks(),query,new Date(),this.settings.timeZone);
  await this.reply(tasks.length?`${tasks.length} tareas:\n${tasks.slice(0,30).map((t,i)=>`${i+1}. ${t.title}${t.due?` · ${t.due}`:''}\n   [[${t.path}]]:${t.line+1}`).join('\n')}${tasks.length>30?'\nAbre el selector para más resultados.':''}`:'No encontré tareas para esa consulta.');
  new ChoiceDialog(this.app,'Tareas',tasks.slice(0,300).map(task=>({label:`${task.completed?'✓ ':'☐ '}${task.title}`,description:`${task.path}:${task.line+1} ${task.due??''}`,run:()=>new ChoiceDialog(this.app,task.title,[{label:'Abrir nota de origen',run:()=>this.openTask(task)},...task.completed?[]:[{label:'Marcar como hecha',run:()=>this.confirmCompletion(task)},{label:'Crear recordatorio vinculado',run:()=>this.taskReminder(task)},...task.due?[{label:'Avisar antes del vencimiento',run:()=>this.taskReminder(task,true)}]:[]]]).open()}))).open();
 }
 private taskReminder(task:MarkdownTask,advance=false){
  if(!advance){new InputDialog(this.app,`Recordar: ${task.title}`,[{label:'Cuándo',placeholder:'mañana a las 19:00 o dentro de 45 minutos'}],async([when])=>this.proposeReminder(`Recuérdame ${task.title} ${when}`,task)).open();return;}
  new InputDialog(this.app,'Aviso antes del vencimiento',[{label:'Días antes',value:'3'},{label:'Hora local (HH:mm)',placeholder:'19:00'}],async([days,time])=>{
   if(!/^\d{1,3}$/.test(days)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error('Indica días enteros y una hora exacta HH:mm.');
   const day=DateTime.fromISO(task.due!,{zone:this.settings.timeZone}).minus({days:Number(days)}).toISODate();
   await this.proposeReminder(`Recuérdame ${task.title} el ${day} a las ${time}`,task);
  }).open();
 }
 private async openTask(task:MarkdownTask){const file=this.app.vault.getAbstractFileByPath(task.path);if(!(file instanceof TFile))throw new Error('La nota ya no existe.');await this.app.workspace.getLeaf(false).openFile(file,{eState:{line:task.line}});}
 private async chooseCompletion(text:string){
  await this.ensureTaskIndex();let tasks=this.allTasks().filter(t=>!t.completed);
  const ordinal=text.match(/(?:la|el)\s+(primera|segunda|tercera|\d+)\s+tarea/i);
  if(ordinal){const n=({primera:1,segunda:2,tercera:3} as Record<string,number>)[ordinal[1].toLowerCase()]??Number(ordinal[1]);const path=this.app.workspace.getActiveFile()?.path;tasks=tasks.filter(t=>t.path===path);tasks=tasks[n-1]?[tasks[n-1]]:[];}
  else{
   const terms=text.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/^(ya termine|marca como (hecha|completada)|tacha|acabo de completar|completa)\s*/,'').replace(/\b(el|la|los|las|de|tarea|esa|mi|informe)\b/g,' ').split(/\s+/).filter(t=>t.length>2);
   if(terms.length)tasks=tasks.filter(t=>terms.every(term=>t.title.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().includes(term)));
  }
  if(!tasks.length){await this.reply('No encontré una tarea pendiente que coincida. Puedes abrir «Ver tareas pendientes».');return;}
  if(tasks.length===1){this.confirmCompletion(tasks[0]);return;}
  new ChoiceDialog(this.app,'Hay varias coincidencias. Elige la tarea exacta.',tasks.slice(0,100).map(t=>({label:t.title,description:`${t.path}:${t.line+1}`,run:()=>this.confirmCompletion(t)}))).open();
 }
 private tasksToggle():((line:string,path:string)=>string)|undefined{
  const plugin=(this.app as unknown as {plugins?:{plugins?:Record<string,{apiV1?:{executeToggleTaskDoneCommand?:(line:string,path:string)=>string}}>}}).plugins?.plugins?.['obsidian-tasks-plugin'];
  const api=plugin?.apiV1;return typeof api?.executeToggleTaskDoneCommand==='function'?(line,path)=>api.executeToggleTaskDoneCommand!(line,path):undefined;
 }
 private confirmCompletion(task:MarkdownTask){
  if(task.recurring&&!this.tasksToggle()){new Notice('Esta tarea es recurrente. Complétala con el plugin que administra su recurrencia; no se modificó.');return;}
  new ConfirmDialog(this.app,`Completar: ${task.title}`,`${task.path}:${task.line+1}\n${task.raw}${task.recurring?'\nTasks generará la siguiente recurrencia.':''}`,async()=>{
   const file=this.app.vault.getAbstractFileByPath(task.path);if(!(file instanceof TFile))throw new Error('La nota ya no existe.');
   const today=DateTime.now().setZone(this.settings.timeZone).toISODate()!;
   await this.app.vault.process(file,current=>completeTaskText(current,task,today,this.tasksToggle()));
   await this.reminders.cancelForTask(task.id);await this.readTaskFile(file);this.pet?.celebrate();await this.reply(`¡${task.title} completada! Una menos.`,true);
  }).open();
 }
 private newTask(text=''){
  const active=this.app.workspace.getActiveFile();
  new InputDialog(this.app,'Crear tarea',[{label:'Título (sin fecha ni comando)',value:text.replace(/^(crea|agrega|añade)\s+(una\s+)?tarea\s+(para\s+)?/i,'')},{label:'Nota de destino',value:active?.path??''},{label:'Vencimiento opcional AAAA-MM-DD'}],async([title,path,due])=>{
   path=normalizePath(path);if(!safeRelativePath(path)||!path.endsWith('.md'))throw new Error('Selecciona una nota Markdown existente.');const file=this.app.vault.getAbstractFileByPath(path);if(!(file instanceof TFile))throw new Error('La nota no existe.');
   const current=await this.app.vault.read(file);const next=createTaskText(current,title,due||undefined);
   new ConfirmDialog(this.app,'Confirmar nueva tarea',`${path}\n${title}${due?` 📅 ${due}`:''}`,async()=>{await this.app.vault.process(file,latest=>{if(latest!==current)throw new Error('La nota cambió. Vuelve a crear la tarea para revisar el cambio.');return next;});await this.readTaskFile(file);await this.reply('Tarea creada.');}).open();
  }).open();
 }
 private async navigate(text:string){
  const term=text.replace(/^(abre|llévame a|llevame a|busca una nota llamada)\s*/i,'').replace(/^(mis|mi|los|las)\s*/i,'').toLowerCase();
  const files=this.app.vault.getMarkdownFiles().filter(f=>f.basename.toLowerCase().includes(term));
  new ChoiceDialog(this.app,'Abrir nota',files.slice(0,100).map(f=>({label:f.basename,description:f.path,run:async()=>{await this.app.workspace.getLeaf(false).openFile(f);}}))).open();
 }
 private async auditActive(){
  const file=this.app.workspace.getActiveFile();if(!file){await this.reply('Abre una nota para revisar sus propiedades.');return;}
  const rules=this.settings.propertyRules.filter(r=>r.folder===''||file.path.startsWith(`${r.folder}/`));
  const findings=auditProperties(await this.app.vault.cachedRead(file),rules);
  const cache=this.app.metadataCache.getFileCache(file);for(const link of cache?.links??[])if(!this.app.metadataCache.getFirstLinkpathDest(link.link,file.path))findings.push({code:'broken-link',message:`Enlace sin resolver: ${link.link}`});
  await this.reply(findings.length?`${file.path}\n${findings.map(f=>`• ${f.message}`).join('\n')}`:rules.length?'No encontré problemas con las reglas configuradas.':'YAML y enlaces revisados. Configura reglas por carpeta para comprobar propiedades requeridas.');
 }
 private async discoverNote(){
  const active=this.app.workspace.getActiveFile()?.path??'';
  const notes=this.app.vault.getMarkdownFiles().map(f=>({path:f.path,mtime:f.stat.mtime,links:Object.keys(this.app.metadataCache.resolvedLinks[f.path]??{})}));
  const results=recommendNotes(notes,this.data.memory.opened,active,Date.now());
  new ChoiceDialog(this.app,'Notas para revisar',results.map(r=>({label:r.path,description:r.reason,run:async()=>{const file=this.app.vault.getAbstractFileByPath(r.path);if(file instanceof TFile)await this.app.workspace.getLeaf(false).openFile(file);}}))).open();
 }
 private async contextNotes():Promise<ContextNote[]>{
  const active=this.app.workspace.getActiveFile();if(!active)return [];
  const linked=Object.keys(this.app.metadataCache.resolvedLinks[active.path]??{});
  const paths=[active.path,...linked].filter(p=>isAllowedPath(p,this.settings.allowedFolders)).slice(0,4);
  const notes:ContextNote[]=[];let remaining=24000;
  for(const path of paths){const file=this.app.vault.getAbstractFileByPath(path);if(!(file instanceof TFile)||file.extension!=='md')continue;const content=(await this.app.vault.cachedRead(file)).slice(0,Math.min(12000,remaining));notes.push({path,content});remaining-=content.length;if(remaining<=0)break;}
  return notes;
 }
 private async askAgent(key:string,text:string,manual:boolean,requireContext=false){
  if(!Platform.isDesktopApp||this.settings.agentProvider==='none'){if(manual)await this.reply('Activa Codex CLI o Claude Code CLI en Ajustes para esta consulta. Las funciones locales no necesitan IA.');return;}
  const now=Date.now();this.data.memory.agentRuns=this.data.memory.agentRuns.filter(t=>now-t<3600000);
  if(this.agent.busy){if(manual)await this.reply('El agente sigue ocupado. Puedes cancelar su consulta.');return;}
  if(this.data.memory.agentRuns.length>=this.settings.maxHourly){if(manual)await this.reply('Se alcanzó el límite de consultas por hora configurado.');return;}
  const notes=await this.contextNotes();if(requireContext&&!notes.some(n=>n.path===this.app.workspace.getActiveFile()?.path)){await this.reply('Autoriza la carpeta de esta nota en Ajustes antes de enviarla al agente.');return;}
  let instruction=PROMPTS[key]??PROMPTS['generar-dialogo'];const promptFile=this.app.vault.getAbstractFileByPath(`${this.settings.resourcesFolder}/prompts/${key}.md`);if(promptFile instanceof TFile)instruction=(await this.app.vault.cachedRead(promptFile)).slice(0,12000);
  this.data.memory.agentRuns.push(now);this.data.memory.lastAgentRun=now;this.data.memory.lastContext=this.contextFingerprint();await this.persist();
  this.chatViews().forEach(v=>v.setStatus('Consultando al agente…'));
  try{
   const profile=getPersonality(this.settings.personality,this.profiles);
   const reply=await this.agent.ask(`${RESPONSE_CONTRACT}\nNombre: ${this.settings.name}. Estilo: ${profile.languageStyle}. ${profile.prompt??profile.description}\n${instruction.slice(0,1500)}\nSolicitud: ${text.slice(0,1200)}`,notes,this.data.agentHistory);
   if(this.stopped)return;
   if(!manual&&this.data.memory.findings.includes(reply.message))return;
   this.data.memory.findings=[...this.data.memory.findings,reply.message].slice(-30);
   this.data.agentHistory=[...this.data.agentHistory,{role:'user' as const,content:text.slice(0,1500),at:new Date().toISOString()},{role:'assistant' as const,content:reply.message,at:new Date().toISOString()}].slice(-16);
   await this.reply(reply.message,reply.priority==='high');this.applyAgentReply(reply);
  }finally{this.chatViews().forEach(v=>v.setStatus(''));}
 }
 private applyAgentReply(reply:AgentReply){
  if(reply.animation==='celebrate')this.pet?.celebrate();else if(reply.animation==='sleep')this.pet?.sleep();else if(reply.animation==='jump')this.pet?.reactToNote();
  const choices:Choice[]=[];
  if(reply.suggestedActions.includes('open_note')&&reply.notePath&&isAllowedPath(reply.notePath,this.settings.allowedFolders)){
   const path=reply.notePath;const file=this.app.vault.getAbstractFileByPath(path);if(file instanceof TFile)choices.push({label:`Abrir ${path}`,run:async()=>{await this.app.workspace.getLeaf(false).openFile(file);}});
  }
  if(reply.suggestedActions.includes('mark_completed'))choices.push({label:'Elegir una tarea para completar',run:()=>this.chooseCompletion('marca como hecha una tarea')});
  if(reply.suggestedActions.includes('snooze'))choices.push({label:'Elegir un recordatorio para posponer',run:()=>this.showReminders()});
  if(choices.length)new ChoiceDialog(this.app,'Sugerencias del agente',choices).open();
 }
 private contextFingerprint(){const active=this.app.workspace.getActiveFile();return `${active?.path??''}:${active?.stat.mtime??0}:${this.contextRevision}`;}
 private agentScope(){return JSON.stringify({provider:this.settings.agentProvider,folders:[...this.settings.allowedFolders].sort()});}
 private async tick(){
  if(this.stopped||this.tickBusy)return;this.tickBusy=true;
  try{
   const now=new Date();const due=await this.reminders.tick(now);
   if(due.length){const message=due.length>1?`${due.length} recordatorios pendientes:\n${due.map(r=>r.title).join('\n')}`:`Recordatorio: ${due[0].title}`;new Notice(`${this.settings.name}: ${message}`,0);await this.reply(message,true);new ChoiceDialog(this.app,'Recordatorios pendientes',due.map(r=>({label:r.title,description:'Posponer 10 minutos',run:()=>this.reminders.snooze(r.id,10)}))).open();}
   if(document.hidden)return;
   if(this.settings.dueAlerts&&this.indexed){const today=DateTime.now().setZone(this.settings.timeZone).toISODate()!;const urgent=this.allTasks().filter(t=>!t.completed&&t.due===today&&!this.dueNotified.has(`${today}:${t.id}`));if(urgent.length){urgent.forEach(t=>this.dueNotified.add(`${today}:${t.id}`));await this.reply(`${urgent.length} tarea(s) vencen hoy. Abre «Ver tareas pendientes» para revisarlas.`,true);}}
   this.pet?.focus(this.settings.focusMode);this.pet?.update({quiet:isQuiet(this.settings,now,this.data.memory.quietUntil)});
   if(shouldConsult({now:now.getTime(),lastRun:this.data.memory.lastAgentRun,intervalMinutes:this.settings.agentIntervalMinutes,busy:this.agent.busy,focused:document.hasFocus(),focusMode:this.settings.focusMode,quiet:isQuiet(this.settings,now,this.data.memory.quietUntil),changed:this.contextFingerprint()!==this.data.memory.lastContext,hourlyCount:this.data.memory.agentRuns.filter(t=>now.getTime()-t<3600000).length,maxHourly:this.settings.maxHourly}))await this.askAgent('comentar-nota','Ofrece un hallazgo breve si el contexto nuevo lo justifica.',false);
  }finally{this.tickBusy=false;}
 }
 async detectAgents(){if(!Platform.isDesktopApp)throw new Error('La detección CLI solo está disponible en escritorio.');const detected=await discoverExecutables();await this.updateSettings({codexExecutable:detected.codex??this.settings.codexExecutable,claudeExecutable:detected.claude??this.settings.claudeExecutable});new Notice(`Codex: ${detected.codex?'detectado':'no encontrado'} · Claude Code: ${detected.claude?'detectado':'no encontrado'}`);}
 async initializeResources(){
  const root=this.settings.resourcesFolder;if(!safeRelativePath(root))throw new Error('Carpeta de recursos no válida.');
  const ensure=async(path:string)=>{const parts=path.split('/');let parent='';for(const part of parts){parent=parent?`${parent}/${part}`:part;const existing=this.app.vault.getAbstractFileByPath(parent);if(!existing)await this.app.vault.createFolder(parent);else if(!(existing instanceof TFolder))throw new Error(`${parent} no es una carpeta.`);}};
  for(const dir of ['prompts','personalities','reminders','memory','skins'])await ensure(`${root}/${dir}`);
  for(const [key,prompt]of Object.entries(PROMPTS)){const path=`${root}/prompts/${key}.md`;if(!this.app.vault.getAbstractFileByPath(path))await this.app.vault.create(path,`# ${key}\n\n${prompt}\n\n${RESPONSE_CONTRACT}\n`);}
  const {PERSONALITIES}=await import('./pet');const profiles=`${root}/personalities/profiles.json`;if(!this.app.vault.getAbstractFileByPath(profiles))await this.app.vault.create(profiles,JSON.stringify(PERSONALITIES,null,2));
  await this.reply(`Recursos creados en ${root}. Puedes editar los prompts. Para aplicar perfiles editados, selecciona ${profiles} en Ajustes.`);
 }
 private async loadCustomAssets(){
  const options:Partial<PetOptions>={profiles:undefined,skin:undefined};this.profiles=undefined;
  if(this.settings.customProfilesPath){const file=this.app.vault.getAbstractFileByPath(this.settings.customProfilesPath);if(!(file instanceof TFile)||file.extension!=='json')throw new Error('No se encontró el archivo JSON de personalidades.');const parsed=validatePersonalityProfiles(await this.app.vault.cachedRead(file));if(!parsed.valid)throw new Error(parsed.errors.join('\n'));options.profiles=parsed.profiles;this.profiles=parsed.profiles;}
  if(this.settings.skinPath){
   const path=this.settings.skinPath;if(!safeRelativePath(path))throw new Error('Ruta del paquete no válida.');const file=this.app.vault.getAbstractFileByPath(path);if(!(file instanceof TFile)||file.extension!=='json')throw new Error('No se encontró el paquete JSON.');
   const raw=JSON.parse(await this.app.vault.cachedRead(file)) as Record<string,unknown>;if(typeof raw.image!=='string')throw new Error('El paquete necesita una imagen local.');
   const directory=path.includes('/')?path.slice(0,path.lastIndexOf('/')+1):'';const imagePath=directory+raw.image;if(!safeRelativePath(imagePath)||! /\.(png|webp)$/i.test(imagePath))throw new Error('Usa una imagen PNG o WebP local, sin rutas externas.');const image=this.app.vault.getAbstractFileByPath(imagePath);if(!(image instanceof TFile))throw new Error('La imagen del paquete no existe.');
   options.skin={...raw,url:this.app.vault.getResourcePath(image)} as unknown as SkinPack;
  }
  this.pet?.update(options);
 }
}
