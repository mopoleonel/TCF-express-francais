import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { lessons, exercises, publicExercise } from './content.js';

const hash = s=>createHash('sha256').update(s).digest('hex');
export const normalize = s=>s.normalize('NFC').toLocaleLowerCase('fr').replace(/[’‘]/g,"'").replace(/[.!?]+$/u,'').trim().replace(/\s+/g,' ');
export function createApp({dbPath=':memory:',apiKey,origins=['https://tcf-express.com'],now=()=>new Date()}={}) {
 if(!apiKey || apiKey.length<24) throw new Error('API_KEY must contain at least 24 characters');
 const db=new DatabaseSync(dbPath);
 db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS learners(id TEXT PRIMARY KEY, external_id TEXT UNIQUE NOT NULL, locale TEXT NOT NULL, track TEXT NOT NULL, token_hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, learner TEXT NOT NULL REFERENCES learners(id), kind TEXT NOT NULL, items TEXT NOT NULL, created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS attempts(session TEXT NOT NULL REFERENCES sessions(id), exercise TEXT NOT NULL, learner TEXT NOT NULL REFERENCES learners(id), correct INTEGER NOT NULL, answer TEXT NOT NULL, created TEXT NOT NULL, due TEXT NOT NULL, PRIMARY KEY(session,exercise));
 CREATE TABLE IF NOT EXISTS submissions(session TEXT NOT NULL REFERENCES sessions(id), exercise TEXT NOT NULL, number INTEGER NOT NULL, answer TEXT NOT NULL, correct INTEGER NOT NULL, hint_used INTEGER NOT NULL, created TEXT NOT NULL, PRIMARY KEY(session,exercise,number));
 CREATE TABLE IF NOT EXISTS session_next(source TEXT PRIMARY KEY REFERENCES sessions(id), next_session TEXT NOT NULL REFERENCES sessions(id));`);
 const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
 const equal=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b);return x.length===y.length && timingSafeEqual(x,y);};
 const publicLesson=l=>l?{id:l.id,title:l.title,level:l.level,order:l.order,rule:l.rule}:null;
 const nextLesson=s=>{const ids=JSON.parse(s.items);const order=Math.max(0,...ids.map(id=>lessons.find(l=>l.id===exercises.find(e=>e.id===id)?.lessonId)?.order||0));return lessons.find(l=>l.order>order)||null;};
 const sessionPayload=s=>{const items=JSON.parse(s.items).map(id=>exercises.find(e=>e.id===id));const sameLesson=items.length&&items.every(e=>e.lessonId===items[0].lessonId);return {id:s.id,kind:s.kind,exercises:items.map(publicExercise),lesson:sameLesson?publicLesson(lessons.find(l=>l.id===items[0].lessonId)):null,journeyTotal:lessons.length};};
 const progress=id=>{
  const rows=db.prepare('SELECT * FROM attempts WHERE learner=? ORDER BY created,rowid').all(id);
  const mastered=new Set(rows.filter(r=>r.correct).map(r=>r.exercise));
  const skills={};
  for(const e of exercises){skills[e.skill]??={answered:0,correct:0};}
  for(const r of rows){const s=skills[exercises.find(e=>e.id===r.exercise).skill];s.answered++;s.correct+=r.correct;}
  const days=new Set(rows.map(r=>r.created.slice(0,10)));let streak=0;let d=new Date(now());
  if(!days.has(d.toISOString().slice(0,10)))d.setUTCDate(d.getUTCDate()-1);
  while(days.has(d.toISOString().slice(0,10))){streak++;d.setUTCDate(d.getUTCDate()-1);}
  return {xp:mastered.size*10,masteredExercises:mastered.size,totalExercises:exercises.length,attempts:rows.length,streakDays:streak,dailyCompleted:new Set(rows.filter(r=>r.correct&&r.created.slice(0,10)===now().toISOString().slice(0,10)).map(r=>r.exercise)).size,lessons:lessons.map(l=>({id:l.id,total:l.exercises.length,correct:l.exercises.filter(e=>mastered.has(e.id)).length})),skills,badges:[...(mastered.size>=1?['premier-pas']:[]),...(mastered.size>=10?['dix-victoires']:[]),...(streak>=3?['trois-jours']:[])]};
 };
 const server=http.createServer(async(req,res)=>{
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  try{
   const origin=req.headers.origin;
   if(origin && !origins.includes(origin))fail(403,'Origin forbidden');
   if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
   if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, X-API-Key');res.setHeader('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');res.writeHead(204);return res.end();}
   const path=new URL(req.url,'http://localhost').pathname;
   if(req.method==='GET'&&path==='/health')return send(200,{status:'ok'});
   let body={};
   if(['POST','DELETE'].includes(req.method)){
    let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>16384)fail(413,'Body too large');}
    if(raw){if(!req.headers['content-type']?.startsWith('application/json'))fail(415,'Use application/json');try{body=JSON.parse(raw);}catch{fail(400,'Invalid JSON');}}
    if(!body || Array.isArray(body)||typeof body!=='object')fail(400,'Expected JSON object');
   }
   const service=equal(req.headers['x-api-key'],apiKey);
   if(path==='/v1/learners'&&req.method==='POST'){
    if(!service)fail(401,'Service key required');
    const {externalId,locale='en',track='foundation'}=body;
    if(typeof externalId!=='string'||!externalId.trim()||externalId.length>128||!['fr','en'].includes(locale)||!['foundation','refresher'].includes(track))fail(400,'Invalid learner profile');
    if(db.prepare('SELECT id FROM learners WHERE external_id=?').get(externalId))fail(409,'Learner exists; use token rotation');
    const id=randomUUID(),token=randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO learners VALUES(?,?,?,?,?)').run(id,externalId,locale,track,hash(token));
    return send(201,{id,locale,track,token});
   }
   const rotation=path.match(/^\/v1\/learners\/([^/]+)\/token$/);
   if(rotation&&req.method==='POST'){
    if(!service)fail(401,'Service key required');const token=randomBytes(32).toString('base64url');
    if(!db.prepare('UPDATE learners SET token_hash=? WHERE id=?').run(hash(token),rotation[1]).changes)fail(404,'Learner not found');return send(200,{token});
   }
   const token=req.headers.authorization?.replace(/^Bearer /,'');
   const learner=token&&db.prepare('SELECT * FROM learners WHERE token_hash=?').get(hash(token));
   if(!learner)fail(401,'Learner bearer token required');
   if(path==='/v1/catalog'&&req.method==='GET')return send(200,{name:'Français Quest',version:'0.1.0',lessons:lessons.map(({exercises,...l})=>({...l,exerciseCount:exercises.length})),levelNotice:'Exercise difficulty only; not an official CEFR or TCF assessment.'});
   const lesson=path.match(/^\/v1\/lessons\/([^/]+)$/);
   if(lesson&&req.method==='GET'){const l=lessons.find(l=>l.id===lesson[1]);if(!l)fail(404,'Lesson not found');return send(200,{...l,exercises:l.exercises.map(publicExercise)});}
   if(path==='/v1/me'&&req.method==='DELETE'){
    db.exec('BEGIN IMMEDIATE');try{db.prepare('DELETE FROM session_next WHERE source IN (SELECT id FROM sessions WHERE learner=?)').run(learner.id);db.prepare('DELETE FROM submissions WHERE session IN (SELECT id FROM sessions WHERE learner=?)').run(learner.id);db.prepare('DELETE FROM attempts WHERE learner=?').run(learner.id);db.prepare('DELETE FROM sessions WHERE learner=?').run(learner.id);db.prepare('DELETE FROM learners WHERE id=?').run(learner.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return send(200,{deleted:true});
   }
   if(path==='/v1/me/progress'&&req.method==='GET')return send(200,progress(learner.id));
   const reportRoute=path.match(/^\/v1\/sessions\/([^/]+)\/report$/);
   if(reportRoute&&req.method==='GET'){
    const s=db.prepare('SELECT * FROM sessions WHERE id=? AND learner=?').get(reportRoute[1],learner.id);if(!s)fail(404,'Session not found');
    const ids=JSON.parse(s.items),finals=db.prepare('SELECT * FROM attempts WHERE session=?').all(s.id);
    if(finals.length!==ids.length)return send(200,{completed:false,answered:finals.length,total:ids.length});
    const details=ids.map(id=>{const e=exercises.find(e=>e.id===id),final=finals.find(r=>r.exercise===id);let tries=db.prepare('SELECT number,answer,correct,hint_used FROM submissions WHERE session=? AND exercise=? ORDER BY number').all(s.id,id);if(!tries.length)tries=[{number:1,answer:final.answer,correct:final.correct,hint_used:0}];return {exercise:publicExercise(e),expected:e.answer,explanationTranslations:e.explanation,correct:!!final.correct,attempts:tries.map(t=>({...t,correct:!!t.correct,hintUsed:!!t.hint_used}))};});
    return send(200,{id:s.id,kind:s.kind,completed:true,total:ids.length,correct:details.filter(d=>d.correct).length,firstTry:details.filter(d=>d.attempts[0].correct).length,recovered:details.filter(d=>d.correct&&d.attempts.length===2).length,incorrect:details.filter(d=>!d.correct).length,details,nextLesson:publicLesson(nextLesson(s)),journeyTotal:lessons.length});
   }
   const nextRoute=path.match(/^\/v1\/sessions\/([^/]+)\/next$/);
   if(nextRoute&&req.method==='POST'){
    const previous=db.prepare('SELECT * FROM sessions WHERE id=? AND learner=?').get(nextRoute[1],learner.id);if(!previous)fail(404,'Session not found');
    const ids=JSON.parse(previous.items);if(db.prepare('SELECT COUNT(*) AS n FROM attempts WHERE session=?').get(previous.id).n!==ids.length)fail(409,'Finish this session before continuing');
    const linked=db.prepare('SELECT next_session FROM session_next WHERE source=?').get(previous.id);
    if(linked)return send(200,{finished:false,...sessionPayload(db.prepare('SELECT * FROM sessions WHERE id=?').get(linked.next_session))});
    const lesson=nextLesson(previous);if(!lesson)return send(200,{finished:true,message:'Last lesson completed. Your reports remain available.'});
    const next={id:randomUUID(),learner:learner.id,kind:'practice',items:JSON.stringify(lesson.exercises.map(e=>e.id)),created:now().toISOString()};
    db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(next.id,next.learner,next.kind,next.items,next.created);db.prepare('INSERT INTO session_next VALUES(?,?)').run(previous.id,next.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
    return send(201,{finished:false,...sessionPayload(next)});
   }
   const restartRoute=path.match(/^\/v1\/sessions\/([^/]+)\/restart$/);
   if(restartRoute&&req.method==='POST'){
    const previous=db.prepare('SELECT * FROM sessions WHERE id=? AND learner=?').get(restartRoute[1],learner.id);if(!previous)fail(404,'Session not found');
    const ids=JSON.parse(previous.items);if(db.prepare('SELECT COUNT(*) AS n FROM attempts WHERE session=?').get(previous.id).n!==ids.length)fail(409,'Finish this session before restarting');
    const id=randomUUID();db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(id,learner.id,previous.kind,previous.items,now().toISOString());
    return send(201,sessionPayload({id,kind:previous.kind,items:previous.items}));
   }
   if(path==='/v1/sessions'&&req.method==='POST'){
    const {kind='practice',lessonId,gameType}=body;if(!['practice','diagnostic','review','daily','game'].includes(kind))fail(400,'Invalid session kind');
    if(gameType!==undefined&&!['order','repair','pairs','listen'].includes(gameType))fail(400,'Invalid game type');
    if(lessonId!==undefined&&!lessons.some(l=>l.id===lessonId))fail(400,'Unknown lesson');
    let pool=lessonId?exercises.filter(e=>e.lessonId===lessonId):exercises;
    if(!lessonId&&['practice','daily'].includes(kind)){const seen=new Set(db.prepare('SELECT exercise FROM attempts WHERE learner=?').all(learner.id).map(a=>a.exercise));const first=lessons.find(l=>l.exercises.some(e=>!seen.has(e.id)))||lessons.at(-1);pool=first.exercises;}
    if(kind==='game')pool=pool.filter(e=>['order','repair','pairs','listen'].includes(e.type));
    if(gameType)pool=pool.filter(e=>e.type===gameType);
    const latest=db.prepare('SELECT * FROM attempts WHERE learner=? ORDER BY created,rowid').all(learner.id).reduce((m,r)=>m.set(r.exercise,r),new Map());
    if(kind==='diagnostic')pool=lessons.map(l=>l.exercises[0]);
    else if(kind==='review')pool=pool.filter(e=>latest.has(e.id)&&latest.get(e.id).due<=now().toISOString());
    else pool=[...pool].sort((a,b)=>(latest.has(a.id)?1:0)-(latest.has(b.id)?1:0));
    const selected=pool.slice(0,kind==='diagnostic'?12:kind==='game'?4:5),id=randomUUID();
    db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(id,learner.id,kind,JSON.stringify(selected.map(e=>e.id)),now().toISOString());
    return send(201,{...sessionPayload({id,kind,items:JSON.stringify(selected.map(e=>e.id))}),message:selected.length?null:'No reviews due yet.'});
   }
   const answerRoute=path.match(/^\/v1\/sessions\/([^/]+)\/answers$/);
   if(answerRoute&&req.method==='POST'){
    const s=db.prepare('SELECT * FROM sessions WHERE id=? AND learner=?').get(answerRoute[1],learner.id);if(!s)fail(404,'Session not found');
    const {exerciseId,answer,hintUsed=false}=body;
    if(typeof answer!=='string'||!answer.trim()||answer.length>500||typeof hintUsed!=='boolean'||!JSON.parse(s.items).includes(exerciseId))fail(400,'Invalid exercise or answer');
    const prior=db.prepare('SELECT * FROM attempts WHERE session=? AND exercise=?').get(s.id,exerciseId);
    if(prior)fail(409,'Exercise already answered in this session');
    const e=exercises.find(e=>e.id===exerciseId),correct=normalize(answer)===normalize(e.answer);
    const count=db.prepare('SELECT COUNT(*) AS n FROM submissions WHERE session=? AND exercise=?').get(s.id,e.id).n;
    if(count>=2)fail(409,'No attempts remaining');
    const attempt=count+1,finalized=correct||attempt===2;
    db.prepare('INSERT INTO submissions VALUES(?,?,?,?,?,?,?)').run(s.id,e.id,attempt,answer,+correct,+hintUsed,now().toISOString());
    if(!finalized)return send(200,{correct:false,finalized:false,attempt,attemptsRemaining:1,hint:e.hint||lessons.find(l=>l.id===e.lessonId).rule,xpEarned:0,completed:false,progress:progress(learner.id)});
    const priorSuccess=db.prepare('SELECT 1 FROM attempts WHERE learner=? AND exercise=? AND correct=1').get(learner.id,e.id);
    const date=now(),due=new Date(date);due.setUTCDate(due.getUTCDate()+(correct?3:1));
    db.prepare('INSERT INTO attempts VALUES(?,?,?,?,?,?,?)').run(s.id,e.id,learner.id,+correct,answer,date.toISOString(),due.toISOString());
    const completed=db.prepare('SELECT COUNT(*) AS n FROM attempts WHERE session=?').get(s.id).n===JSON.parse(s.items).length;
    return send(200,{correct,finalized:true,attempt,attemptsRemaining:0,expected:e.answer,explanation:e.explanation[learner.locale],explanationTranslations:e.explanation,xpEarned:correct&&!priorSuccess?10:0,reviewAt:due.toISOString(),completed,progress:progress(learner.id)});
   }
   fail(404,'Route not found');
  }catch(e){send(e.status||500,{error:e.status?e.message:'Internal server error'});}
 });
 return {server,db};
}
