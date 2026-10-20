import esbuild from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
const production = process.argv.includes('production');
await writeFile('styles.css',(await readFile('pet.css','utf8'))+'\n'+(await readFile('ui.css','utf8')));
const context = await esbuild.context({
  entryPoints: ['src/main.ts'], bundle: true, external: ['obsidian','electron','node:*'],
  format: 'cjs', target: 'es2022', platform: 'node', outfile: 'main.js',
  sourcemap: production ? false : 'inline', minify: production, logLevel: 'info'
});
if (production) { await context.rebuild(); await context.dispose(); }
else await context.watch();
