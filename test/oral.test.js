import {test} from 'node:test';
import assert from 'node:assert/strict';
import {speakText,stopSpeaking,startRecording,cleanupOral,oralPage} from '../public/oral.js';
import {oralPhrases} from '../public/oral-content.js';
import {readFileSync} from 'node:fs';

test('speech state follows real playback callbacks and ignores stale callbacks',()=>{
 const classes=new Set(),nodes=new Map();
 const element=()=>({textContent:'',hidden:false,disabled:false,classList:{toggle(){},remove(){}},removeAttribute(){}});
 const saved={window:globalThis.window,document:globalThis.document,localStorage:globalThis.localStorage,SpeechSynthesisUtterance:globalThis.SpeechSynthesisUtterance,speechSynthesis:globalThis.speechSynthesis};
 let pending,cancels=0;
 globalThis.localStorage={getItem:()=>null};
 globalThis.document={querySelector:s=>{if(!nodes.has(s))nodes.set(s,element());return nodes.get(s);},querySelectorAll:()=>[],body:{classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)}}};
 globalThis.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
 globalThis.speechSynthesis={getVoices:()=>[{lang:'fr-FR',voiceURI:'fr'}],cancel:()=>cancels++,speak:u=>{pending=u;}};
 globalThis.window={speechSynthesis,SpeechSynthesisUtterance};
 try{
  speakText('Bonjour');assert.equal(pending.lang,'fr-FR');assert.equal(classes.has('leo-speaking'),false);
  const old=pending;pending.onstart();assert.equal(classes.has('leo-speaking'),true);
  stopSpeaking();assert.equal(classes.has('leo-speaking'),false);
  speakText('Merci',{slow:true});assert.equal(pending.rate,.65);pending.onstart();old.onend();assert.equal(classes.has('leo-speaking'),true);
  pending.onend();assert.equal(classes.has('leo-speaking'),false);assert.ok(cancels>=3);
 }finally{cleanupOral();for(const [key,val] of Object.entries(saved)){if(val===undefined)delete globalThis[key];else globalThis[key]=val;}}
});

test('a delayed microphone grant is released if the learner leaves the studio',async()=>{
 const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 const saved={window:globalThis.window,document:globalThis.document};let resolveMic,stops=0;
 const nodes=new Map(),element=()=>({textContent:'',hidden:false,disabled:false,classList:{toggle(){},remove(){}},removeAttribute(){}});
 globalThis.document={querySelector:s=>{if(!nodes.has(s))nodes.set(s,element());return nodes.get(s);},querySelectorAll:()=>[],body:{classList:{remove(){}}}};
 globalThis.window={MediaRecorder:class{},speechSynthesis:{cancel(){}}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:()=>new Promise(r=>resolveMic=r)}}});
 try{
  const pending=startRecording();cleanupOral();resolveMic({getTracks:()=>[{stop:()=>stops++}]});await pending;assert.equal(stops,1);
 }finally{cleanupOral();if(originalNavigator)Object.defineProperty(globalThis,'navigator',originalNavigator);else delete globalThis.navigator;for(const [key,val] of Object.entries(saved)){if(val===undefined)delete globalThis[key];else globalThis[key]=val;}}
});

test('each oral workshop contains a model, small chunks, a pronunciation cue and a dialogue',()=>{
 assert.equal(oralPhrases.length,12);assert.equal(new Set(oralPhrases.map(p=>p.id)).size,12);
 const clean=s=>s.replace(/[.,;!?]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
 for(const p of oralPhrases){assert.equal(clean(p.chunks.join(' ')),clean(p.text));for(const key of ['en','tip','enTip','question','reply'])assert.ok(p[key]?.length>5);}
 const html=oralPage('fr');assert.ok(html.includes('M’enregistrer'));assert.ok(html.includes('Ton ressenti')||html.includes('TON RESSENTI'));assert.ok(!html.includes('oral-translation'));
});
test('every oral model, question and chunk has a valid local French audio file',()=>{
 const root=new URL('../public/audio-young/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));
 for(const p of oralPhrases)for(const text of [p.text,p.question,p.reply,...p.chunks])assert.ok(manifest[text],`Missing audio: ${text}`);
 for(const file of Object.values(manifest)){assert.match(file,/^[a-f0-9]{16}\.wav$/);const audio=readFileSync(new URL(file,root));assert.equal(audio.toString('ascii',0,4),'RIFF');assert.equal(audio.toString('ascii',8,12),'WAVE');assert.ok(audio.length>1000);}
});
