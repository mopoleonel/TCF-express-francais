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
  // Une erreur d'accent seule déclenche d'abord un avertissement gratuit, sans consommer d'essai.
  assert.equal(result.data.accentCheck,true);assert.equal(result.data.attemptsRemaining,2);assert.equal('expected' in result.data,false);
  result=await request(`/v1/sessions/${accented.id}/answers`,'POST',{exerciseId:'passe-compose-1',answer:'mange'},a.token);
  assert.equal(result.data.accentCheck,undefined);assert.equal(result.data.correct,false);assert.equal(result.data.finalized,false);assert.ok(result.data.hint);assert.equal('expected' in result.data,false);
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
test('gamification: partial feedback keeps learner work, practice mode, richer progress', async () => {
  const app = createApp({ apiKey });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const req = async (path, method = 'POST', body, token) => {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : { 'X-API-Key': apiKey }) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json() };
  };
  try {
    const a = (await req('/v1/learners', 'POST', { externalId: 'gamer' })).data;
    // Les mini-jeux ne contiennent que des exercices de jeu, jamais les questions écrites de leçon.
    const g = (await req('/v1/sessions', 'POST', { kind: 'game', gameType: 'order' }, a.token)).data;
    assert.ok(g.exercises.every((e) => e.id.startsWith('game-')));
    // Chaque question écrite a désormais un indice propre.
    assert.ok(exercises.every((e) => e.hint?.fr && e.hint?.en));
    // Duos : la 1re erreur indique seulement les paires fausses.
    const pairs = (await req('/v1/sessions', 'POST', { kind: 'game', gameType: 'pairs' }, a.token)).data;
    const pe = gameExercises.find((e) => e.id === pairs.exercises[0].id);
    const good = pe.answer.split('|');
    const swapped = [good[0].split('=')[0] + '=' + good[1].split('=')[1], good[1].split('=')[0] + '=' + good[0].split('=')[1], ...good.slice(2)].join('|');
    let r = await req(`/v1/sessions/${pairs.id}/answers`, 'POST', { exerciseId: pe.id, answer: swapped }, a.token);
    assert.equal(r.data.finalized, false);
    assert.deepEqual(r.data.feedback.wrongLeft.sort(), [good[0].split('=')[0], good[1].split('=')[0]].sort());
    // Phrase : la 1re erreur indique combien de mots du début sont bien placés.
    const order = (await req('/v1/sessions', 'POST', { kind: 'game', gameType: 'order' }, a.token)).data;
    const oe = gameExercises.find((e) => e.id === order.exercises[0].id);
    const words = oe.answer.split(' ');
    r = await req(`/v1/sessions/${order.id}/answers`, 'POST', { exerciseId: oe.id, answer: [words[0], ...words.slice(1).reverse()].join(' ') }, a.token);
    assert.equal(r.data.feedback.correctPrefix >= 1, true);
    // Mode entraînement : les questions ratées passent en premier.
    r = await req(`/v1/sessions/${pairs.id}/answers`, 'POST', { exerciseId: pe.id, answer: swapped }, a.token);
    assert.equal(r.data.finalized, true);
    assert.equal(r.data.expected, pe.answer);
    const refill = (await req('/v1/sessions', 'POST', { kind: 'refill' }, a.token)).data;
    assert.equal(refill.exercises[0].id, pe.id);
    const p = (await req('/v1/me/progress', 'GET', undefined, a.token)).data;
    assert.equal(p.mistakes, 1);
    assert.ok(Array.isArray(p.badges) && 'bestStreak' in p && 'lessonsDone' in p);
    // Une leçon terminée sans erreur rapporte les bonus et les badges associés.
    const l = (await req('/v1/sessions', 'POST', { lessonId: 'premiers-mots' }, a.token)).data;
    for (const e of l.exercises) await req(`/v1/sessions/${l.id}/answers`, 'POST', { exerciseId: e.id, answer: exercises.find((x) => x.id === e.id).answer }, a.token);
    const after = (await req('/v1/me/progress', 'GET', undefined, a.token)).data;
    assert.equal(after.lessonsDone, 1);
    assert.ok(after.badges.includes('sans-faute') && after.badges.includes('premier-pas'));
    assert.equal(after.xp, after.masteredExercises * 10 + 20 + after.perfectSessions * 5);
  } finally {
    app.server.close();
  }
});
test('reliability: accepted variants, session resume, synced game state, Douala days', async () => {
  let clock = new Date('2026-11-05T22:30:00Z'); // 23 h 30 à Douala
  const app = createApp({ apiKey, now: () => clock });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const req = async (path, method = 'POST', body, token) => {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : { 'X-API-Key': apiKey }) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json() };
  };
  try {
    const a = (await req('/v1/learners', 'POST', { externalId: 'fiable' })).data;
    // « je suis Marie » est une bonne réponse ; la variante n'est jamais envoyée au navigateur.
    const s = (await req('/v1/sessions', 'POST', { lessonId: 'premiers-mots' }, a.token)).data;
    assert.ok(s.exercises.every((e) => !('alternatives' in e)));
    assert.equal((await req(`/v1/sessions/${s.id}/answers`, 'POST', { exerciseId: 'premiers-mots-3', answer: 'suis' }, a.token)).data.correct, true);
    // Les consignes ambiguës précisent qu'on attend un article indéfini.
    assert.match(exercises.find((e) => e.id === 'articles-3').prompt, /Un, une ou des/);
    // Reprise : la session indique ce qui est déjà fait.
    await req(`/v1/sessions/${s.id}/answers`, 'POST', { exerciseId: 'premiers-mots-1', answer: 'Bonsoir' }, a.token);
    const resume = (await req(`/v1/sessions/${s.id}`, 'GET', undefined, a.token)).data;
    assert.deepEqual(resume.answered.find((x) => x.id === 'premiers-mots-3'), { id: 'premiers-mots-3', attempts: 1, finalized: true });
    assert.deepEqual(resume.answered.find((x) => x.id === 'premiers-mots-1'), { id: 'premiers-mots-1', attempts: 1, finalized: false });
    const other = (await req('/v1/learners', 'POST', { externalId: 'autre' })).data;
    assert.equal((await req(`/v1/sessions/${s.id}`, 'GET', undefined, other.token)).status, 404);
    // Journée comptée à l'heure de Douala : 22 h 30 UTC = 23 h 30 à Douala, puis 23 h 30 UTC = 00 h 30 le lendemain.
    let p = (await req('/v1/me/progress', 'GET', undefined, a.token)).data;
    assert.equal(p.today, '2026-11-05');
    assert.equal(p.dailyCompleted, 1);
    clock = new Date('2026-11-05T23:30:00Z');
    p = (await req('/v1/me/progress', 'GET', undefined, a.token)).data;
    assert.equal(p.today, '2026-11-06');
    assert.equal(p.dailyCompleted, 0);
    assert.equal(p.streakDays, 1);
    // État de jeu : fusion entre deux appareils, XP de l'oral comptés par le serveur.
    const xp0 = p.xp;
    let st = (await req('/v1/me/state', 'POST', { state: { hearts: 3, heartsDate: '2026-11-06', goal: 10, oralEasy: ['p1'], oralChallengeDays: ['2026-11-06'] } }, a.token)).data;
    assert.equal(st.state.hearts, 3);
    assert.equal(st.progress.xp, xp0 + 15);
    st = (await req('/v1/me/state', 'POST', { state: { hearts: 5, heartsDate: '2026-11-05', goal: 10, oralEasy: ['p2'] } }, a.token)).data;
    assert.equal(st.state.hearts, 3, 'un état plus ancien ne recharge pas les cœurs');
    assert.deepEqual(st.state.oralEasy.sort(), ['p1', 'p2']);
    assert.equal(st.progress.xp, xp0 + 20);
    assert.equal((await req('/v1/me/state', 'POST', { state: [] }, a.token)).status, 400);
    const bad = (await req('/v1/me/state', 'POST', { state: { hearts: 99, goal: 7, oralEasy: 'x' } }, a.token)).data.state;
    assert.equal(bad.hearts, 3);
    assert.equal(bad.goal, 5);
    // Les mini-jeux sont mélangés d'une partie à l'autre.
    const firsts = new Set();
    for (let i = 0; i < 8; i++) firsts.add((await req('/v1/sessions', 'POST', { kind: 'game', gameType: 'order' }, a.token)).data.exercises.map((e) => e.id).join());
    assert.ok(firsts.size > 1);
  } finally {
    app.server.close();
  }
});
