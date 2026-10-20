import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve('test-vault');
await mkdir(resolve(root,'.obsidian/plugins/miauwi'),{recursive:true});
for(const f of ['main.js','manifest.json','styles.css'])await copyFile(f,resolve(root,'.obsidian/plugins/miauwi',f));
await writeFile(resolve(root,'.obsidian/community-plugins.json'),JSON.stringify(['miauwi']));
await writeFile(resolve(root,'Prueba.md'),'# Vault de prueba de Miauwi\n\n- [ ] Estudiar Maxwell 📅 2026-11-08\n- [ ] Hacer una pausa\n- [x] Preparar el escritorio ✅ 2026-10-20\n\nEste vault es independiente de tus notas.\n');
console.log(root);
