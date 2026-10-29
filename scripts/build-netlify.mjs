import {readFile,stat} from 'node:fs/promises';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

if(Number(process.versions.node.split('.')[0])<24)throw new Error('Node.js 24 or later is required');
const root=new URL('../',import.meta.url);
for(const path of ['public/index.html','public/app.js','public/oral.js','public/theme.css','public/assets/leo-avatar.png','netlify.toml'])await stat(new URL(path,root));
const manifest=JSON.parse(await readFile(new URL('public/audio-young/manifest.json',root),'utf8'));
for(const file of Object.values(manifest)){if(!/^[a-f0-9]{16}\.wav$/.test(file))throw new Error('Invalid audio asset path');await stat(new URL('public/audio-young/'+file,root));}
await build({absWorkingDir:fileURLToPath(root),entryPoints:['netlify/functions/api.mjs'],outfile:'.netlify/verify/api.mjs',platform:'node',target:'node24',format:'esm',bundle:true,packages:'external',logLevel:'warning'});
console.log('Netlify ready: public/ + API Node 24 + persistent learner snapshots; '+Object.keys(manifest).length+' voice assets verified.');
