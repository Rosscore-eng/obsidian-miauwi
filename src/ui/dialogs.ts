import {App,Modal,Setting} from 'obsidian';

export class InputDialog extends Modal {
 private finished=false;
 constructor(app:App,private titleText:string,private fields:{label:string;value?:string;placeholder?:string;multiline?:boolean}[],private submit:(values:string[])=>Promise<void>|void){super(app);}
 onOpen(){
  this.contentEl.createEl('h2',{text:this.titleText});
  const values=this.fields.map(f=>f.value??'');
  this.fields.forEach((f,i)=>{
   new Setting(this.contentEl).setName(f.label)[f.multiline?'addTextArea':'addText'](input=>input.setValue(values[i]).setPlaceholder(f.placeholder??'').onChange(v=>{values[i]=v;}));
  });
  const error=this.contentEl.createEl('p',{cls:'miauwi-error'});
  const row=new Setting(this.contentEl);
  row.addButton(b=>b.setButtonText('Cancelar').onClick(()=>this.close()));
  row.addButton(b=>b.setButtonText('Continuar').setCta().onClick(async()=>{
   if(this.finished)return;this.finished=true;b.setDisabled(true);
   try{await this.submit(values);this.close();}catch(e){error.textContent=e instanceof Error?e.message:String(e);this.finished=false;b.setDisabled(false);}
  }));
 }
 onClose(){this.contentEl.empty();}
}
export class ConfirmDialog extends Modal {
 constructor(app:App,private titleText:string,private message:string,private accept:()=>Promise<void>|void){super(app);}
 onOpen(){
  this.contentEl.createEl('h2',{text:this.titleText});this.contentEl.createEl('p',{text:this.message,cls:'miauwi-preserve'});
  const error=this.contentEl.createEl('p',{cls:'miauwi-error'});
  const s=new Setting(this.contentEl);s.addButton(b=>b.setButtonText('Cancelar').onClick(()=>this.close()));
  s.addButton(b=>b.setButtonText('Confirmar').setCta().onClick(async()=>{b.setDisabled(true);try{await this.accept();this.close();}catch(e){error.textContent=e instanceof Error?e.message:String(e);b.setDisabled(false);}}));
 }
 onClose(){this.contentEl.empty();}
}
export interface Choice {label:string;description?:string;run:()=>Promise<void>|void}
export class ChoiceDialog extends Modal {
 constructor(app:App,private titleText:string,private choices:Choice[]){super(app);}
 onOpen(){
  this.contentEl.createEl('h2',{text:this.titleText});
  if(!this.choices.length)this.contentEl.createEl('p',{text:'No hay resultados.'});
  const error=this.contentEl.createEl('p',{cls:'miauwi-error'});
  for(const choice of this.choices)new Setting(this.contentEl).setName(choice.label).setDesc(choice.description??'').addButton(b=>b.setButtonText('Elegir').onClick(async()=>{b.setDisabled(true);try{await choice.run();this.close();}catch(e){error.textContent=e instanceof Error?e.message:String(e);b.setDisabled(false);}}));
 }
 onClose(){this.contentEl.empty();}
}
