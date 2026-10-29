import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp,normalize} from '../src/app.js';
import {gameExercises} from '../src/games.js';
import {exercises,lessons} from '../src/content.js';
const apiKey='test-service-secret-123456789';
test('learning lifecycle, ownership, validation and persistence',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'quest-'));const dbPath=join(dir,'test.sqlite');
 let app=createApp({apiKey,dbPath});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${app.server.address().port}`;
 async function request(path,method='GET',body,token,service=false){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} :{}),...(service?{'X-API-Key':apiKey}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
 try{
  assert.equal((await request('/v1/catalog')).status,401);
  const a=(await request('/v1/learners','POST',{externalId:'a',locale:'en'},null,true)).data;
  const b=(await request('/v1/learners','POST',{externalId:'b',locale:'fr'},null,true)).data;
  assert.equal((await request('/v1/learners','POST',{externalId:'a'},null,true)).status,409);
  const catalog=(await request('/v1/catalog','GET',null,a.token)).data;
  assert.equal(catalog.lessons.length,12);
  const s=(await request('/v1/sessions','POST',{lessonId:'etre-avoir'},a.token)).data;
  assert.equal(s.exercises.length,5);assert.equal('answer' in s.exercises[0],false);
  assert.equal((await request(`/v1/sessions/${s.id}/answers`,'POST',{exerciseId:s.exercises[0].id,answer:'suis'},b.token)).status,404);
  let result=await request(`/v1/sessions/${s.id}/answers`,'POST',{exerciseId:s.exercises[0].id,answer:' SUIS '},a.token);
  assert.equal(result.data.correct,true);assert.equal(result.data.xpEarned,10);
  assert.equal((await request(`/v1/sessions/${s.id}/answers`,'POST',{exerciseId:s.exercises[0].id,answer:'suis'},a.token)).status,409);
  const s2=(await request('/v1/sessions','POST',{lessonId:'etre-avoir'},a.token)).data;
  result=await request(`/v1/sessions/${s2.id}/answers`,'POST',{exerciseId:s.exercises[0].id,answer:'suis'},a.token);
  assert.equal(result.data.xpEarned,0);assert.equal(result.data.progress.xp,10);
  const accented=(await request('/v1/sessions','POST',{lessonId:'passe-compose'},a.token)).data;
  result=await request(`/v1/sessions/${accented.id}/answers`,'POST',{exerciseId:'passe-compose-1',answer:'mange'},a.token);
  assert.equal(result.data.correct,false);assert.equal(result.data.finalized,false);assert.ok(result.data.hint);assert.equal('expected' in result.data,false);
  result=await request(`/v1/sessions/${accented.id}/answers`,'POST',{exerciseId:'passe-compose-1',answer:'mange',hintUsed:true},a.token);
  assert.equal(result.data.correct,false);assert.equal(result.data.finalized,true);assert.ok(result.data.explanation);
  assert.equal((await request('/v1/sessions','POST',{lessonId:'unknown'},a.token)).status,400);
  assert.equal((await request('/v1/me/progress','GET',null,b.token)).data.xp,0);
  const rotated=(await request(`/v1/learners/${a.id}/token`,'POST',{},null,true)).data;
  assert.equal((await request('/v1/me/progress','GET',null,a.token)).status,401);
  assert.equal((await request('/v1/me/progress','GET',null,rotated.token)).data.xp,10);
  await new Promise(r=>app.server.close(r));app.db.close();
  app=createApp({apiKey,dbPath});assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM attempts').get().n,3);
 }finally{if(app.server.listening)await new Promise(r=>app.server.close(r));app.db.close();rmSync(dir,{recursive:true,force:true});}
});
test('normalization keeps meaningful French accents',()=>{assert.notEqual(normalize('a'),normalize('à'));assert.equal(normalize('m’appelle'),normalize("m'appelle"));});
test('all four games validate on the server without exposing solutions',async()=>{
 const app=createApp({apiKey});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${app.server.address().port}`;
 const req=async(path,body,token)=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{'X-API-Key':apiKey})},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 try{
  const {data:learner}=await req('/v1/learners',{externalId:'gamer'});
  for(const type of ['order','repair','pairs','listen']){
   const {status,data:s}=await req('/v1/sessions',{kind:'game',gameType:type},learner.token);assert.equal(status,201);assert.equal(s.exercises.length,4);
   for(const e of s.exercises){assert.equal(e.type,type);assert.equal('answer' in e,false);assert.equal('explanation' in e,false);const source=gameExercises.find(g=>g.id===e.id);const {data:r}=await req(`/v1/sessions/${s.id}/answers`,{exerciseId:e.id,answer:source.answer},learner.token);assert.equal(r.correct,true);assert.equal(r.xpEarned,10);}
  }
  assert.equal((await req('/v1/sessions',{kind:'game',gameType:'bad'},learner.token)).status,400);
 }finally{await new Promise(r=>app.server.close(r));app.db.close();}
});
test('two attempts, hidden corrections, complete report and exact replay are enforced by the API',async()=>{
 const app=createApp({apiKey});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
 const request=async(path,method='GET',body,token)=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{'X-API-Key':apiKey})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
 try{
  const a=(await request('/v1/learners','POST',{externalId:'two-tries'})).data,b=(await request('/v1/learners','POST',{externalId:'other'})).data;
  const s=(await request('/v1/sessions','POST',{kind:'game',gameType:'order'},a.token)).data;
  const answer=(i,text,hintUsed=false)=>request(`/v1/sessions/${s.id}/answers`,'POST',{exerciseId:s.exercises[i].id,answer:text,hintUsed},a.token);
  assert.equal((await request(`/v1/sessions/${s.id}/restart`,'POST',{},a.token)).status,409);
  let r=(await answer(0,'erreur')).data;assert.equal(r.attemptsRemaining,1);assert.equal(r.finalized,false);assert.equal('expected' in r,false);assert.equal('explanationTranslations' in r,false);
  assert.equal((await request(`/v1/sessions/${s.id}/report`,'GET',null,a.token)).data.completed,false);
  r=(await answer(0,gameExercises.find(e=>e.id===s.exercises[0].id).answer,true)).data;assert.equal(r.correct,true);assert.equal(r.attempt,2);assert.equal(r.xpEarned,10);
  await answer(1,'erreur');r=(await answer(1,'encore une erreur',true)).data;assert.equal(r.finalized,true);assert.equal(r.correct,false);
  assert.equal((await answer(1,'troisième essai')).status,409);
  for(const i of [2,3])await answer(i,gameExercises.find(e=>e.id===s.exercises[i].id).answer);
  const report=(await request(`/v1/sessions/${s.id}/report`,'GET',null,a.token)).data;
  assert.equal(report.completed,true);assert.equal(report.correct,3);assert.equal(report.firstTry,2);assert.equal(report.recovered,1);assert.equal(report.incorrect,1);assert.equal(report.details[0].attempts[1].hintUsed,true);assert.ok(report.details.every(d=>d.expected&&d.explanationTranslations.fr));
  assert.equal((await request(`/v1/sessions/${s.id}/report`,'GET',null,b.token)).status,404);
  assert.equal((await request(`/v1/sessions/${s.id}/restart`,'POST',{},b.token)).status,404);
  const replay=(await request(`/v1/sessions/${s.id}/restart`,'POST',{},a.token)).data;assert.notEqual(replay.id,s.id);assert.deepEqual(replay.exercises.map(e=>e.id),s.exercises.map(e=>e.id));
  r=(await request(`/v1/sessions/${replay.id}/answers`,'POST',{exerciseId:replay.exercises[0].id,answer:report.details[0].expected},a.token)).data;assert.equal(r.xpEarned,0);
 }finally{await new Promise(r=>app.server.close(r));app.db.close();}
});
test('a continuous journey advances through all lessons in order and stops at the catalogue end',async()=>{
 const app=createApp({apiKey});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
 const req=async(path,method='GET',body,token)=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{'X-API-Key':apiKey})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
 try{
  const a=(await req('/v1/learners','POST',{externalId:'continuous'})).data,b=(await req('/v1/learners','POST',{externalId:'observer'})).data;
  let s=(await req('/v1/sessions','POST',{kind:'practice',lessonId:lessons[0].id},a.token)).data;
  assert.equal((await req(`/v1/sessions/${s.id}/next`,'POST',{},a.token)).status,409);
  for(let i=0;i<lessons.length;i++){
   assert.equal(s.lesson.id,lessons[i].id);assert.equal(s.lesson.order,i+1);assert.ok(s.lesson.rule.fr);assert.equal(s.exercises.length,lessons[i].exercises.length);
   for(const e of s.exercises)await req(`/v1/sessions/${s.id}/answers`,'POST',{exerciseId:e.id,answer:exercises.find(x=>x.id===e.id).answer},a.token);
   const report=(await req(`/v1/sessions/${s.id}/report`,'GET',null,a.token)).data;
   assert.equal(report.completed,true);assert.equal(report.nextLesson?.id||null,lessons[i+1]?.id||null);
   assert.equal((await req(`/v1/sessions/${s.id}/next`,'POST',{},b.token)).status,404);
   const next=(await req(`/v1/sessions/${s.id}/next`,'POST',{},a.token)).data;
   if(i===lessons.length-1){assert.equal(next.finished,true);assert.equal('id' in next,false);break;}
   const duplicate=(await req(`/v1/sessions/${s.id}/next`,'POST',{},a.token)).data;assert.equal(next.id,duplicate.id);assert.equal(next.finished,false);s=next;
  }
  assert.equal((await req('/v1/me/progress','GET',null,a.token)).data.masteredExercises,exercises.length);
  assert.equal((await req('/v1/me','DELETE',{},a.token)).data.deleted,true);
 }finally{await new Promise(r=>app.server.close(r));app.db.close();}
});
