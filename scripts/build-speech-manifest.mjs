import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {oralPhrases} from '../public/oral-content.js';
import {exercises} from '../src/content.js';
const texts=new Set();
const add=s=>{if(s?.trim())texts.add(s.trim());};
for(const p of oralPhrases){for(const t of [p.text,p.question,p.reply,...p.chunks])add(t);for(const w of p.text.split(/\s+/))add(w.replace(/[.,!?;:]/g,''));}
for(const e of exercises){
 if(e.speech)add(e.speech);
 if(e.type==='order')add(e.answer);
 else if(e.type==='repair'){const pos=e.answer.indexOf(':');add(e.words.map((w,i)=>i===Number(e.answer.slice(0,pos))?e.answer.slice(pos+1):w).join(' '));}
 else if(e.type!=='pairs'){add(e.answer);if(e.prompt.includes('___'))add(e.prompt.replace('___',e.answer).replace(/\([^)]*\)/g,''));}
}
const manifest=Object.fromEntries([...texts].map(t=>[t,createHash('sha256').update(t).digest('hex').slice(0,16)+'.wav']));
mkdirSync('public/audio',{recursive:true});writeFileSync('public/audio/manifest.json',JSON.stringify(manifest,null,2));writeFileSync('scripts/speech-jobs.json',JSON.stringify(Object.entries(manifest).map(([text,file])=>({text,file})),null,2));console.log(`${texts.size} modèles vocaux préparés`);
