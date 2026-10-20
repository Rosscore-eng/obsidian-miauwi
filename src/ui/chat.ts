import {ItemView,WorkspaceLeaf} from 'obsidian';
import type {ChatEntry} from '../core';
export const CHAT_VIEW='miauwi-chat';
export interface ChatHost {name:()=>string;history:()=>ChatEntry[];send:(text:string)=>Promise<void>;cancel:()=>void;quick:(action:string)=>void}
export class ChatView extends ItemView {
 private messages?:HTMLElement;private status?:HTMLElement;private form?:HTMLFormElement;
 constructor(leaf:WorkspaceLeaf,private host:ChatHost){super(leaf);}
 getViewType(){return CHAT_VIEW;}
 getDisplayText(){return this.host.name();}
 getIcon(){return 'cat';}
 async onOpen(){
  this.contentEl.empty();this.contentEl.addClass('miauwi-chat');
  this.contentEl.createEl('h2',{text:this.host.name()});
  this.contentEl.createEl('p',{text:'Compañía y productividad local. Los agentes son opcionales.',cls:'miauwi-muted'});
  const shortcuts=this.contentEl.createDiv({cls:'miauwi-shortcuts'});
  for(const [label,action]of [['Pendientes','tasks'],['Recordatorios','reminders'],['Nuevo aviso','reminder'],['Concentración','focus'],['Cancelar IA','cancel']]){
   const b=shortcuts.createEl('button',{text:label});this.registerDomEvent(b,'click',()=>action==='cancel'?this.host.cancel():this.host.quick(action));
  }
  this.messages=this.contentEl.createDiv({cls:'miauwi-messages',attr:{role:'log','aria-live':'polite','aria-label':'Conversación'}});
  this.status=this.contentEl.createDiv({cls:'miauwi-status',attr:{role:'status'}});
  this.form=this.contentEl.createEl('form',{cls:'miauwi-chat-form'});
  const input=this.form.createEl('textarea',{attr:{placeholder:`${this.host.name()}, ¿qué tengo pendiente?`,'aria-label':`Mensaje para ${this.host.name()}`,rows:'3',maxlength:'6000'}});
  const send=this.form.createEl('button',{text:'Enviar',attr:{type:'submit'}});
  const submit=async()=>{
   const text=input.value.trim();if(!text)return;
   input.value='';send.disabled=true;this.setStatus('Procesando…');
   try{await this.host.send(text);}catch(e){this.setStatus(e instanceof Error?e.message:String(e));}finally{send.disabled=false;this.render();input.focus();}
  };
  this.registerDomEvent(this.form,'submit',e=>{e.preventDefault();void submit();});
  this.registerDomEvent(input,'keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void submit();}});
  this.render();
 }
 render(){
  if(!this.messages)return;this.messages.empty();
  for(const entry of this.host.history().slice(-60)){
   const row=this.messages.createDiv({cls:`miauwi-message miauwi-message-${entry.role}`});
   row.createEl('strong',{text:entry.role==='user'?'Tú':this.host.name()});
   row.createEl('div',{text:entry.content,cls:'miauwi-preserve'});
   row.createEl('time',{text:new Date(entry.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),cls:'miauwi-muted'});
  }
  this.messages.scrollTop=this.messages.scrollHeight;
 }
 setStatus(text:string){if(this.status)this.status.textContent=text;}
 async onClose(){this.contentEl.empty();}
}
