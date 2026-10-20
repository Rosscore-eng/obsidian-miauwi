import {mkdir,copyFile,cp,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const destination=resolve('dist/miauwi');
await mkdir(destination,{recursive:true});
for(const file of ['main.js','manifest.json','styles.css','LICENSE','THIRD_PARTY_NOTICES.md']) await copyFile(file,resolve(destination,file));
await cp('examples',resolve(destination,'examples'),{recursive:true});
await cp('assets',resolve(destination,'assets'),{recursive:true});
const manifest=JSON.parse(await readFile('manifest.json','utf8'));
console.log(`Plugin ${manifest.name} ${manifest.version}: ${destination}`);
