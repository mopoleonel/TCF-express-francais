import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createNetlifyHandler} from '../src/netlify-adapter.js';
import {exercises} from '../src/content.js';

// Models strongly consistent reads and the SDK's atomic ETag preconditions.
class Store{
 records=new Map();revision=0;conflicts=0;
 async getWithMetadata(key){const r=this.records.get(key);return r?{data:Uint8Array.from(r.data).buffer,etag:r.etag,metadata:{...r.metadata}}:null;}
 async set(key,data,options){const old=this.records.get(key);if((options.onlyIfNew&&old)||(options.onlyIfMatch&&options.onlyIfMatch!==old?.etag)){this.conflicts++;return {modified:false};}const etag='"'+(++this.revision)+'"';this.records.set(key,{data:Buffer.from(data),etag,metadata:{...options.metadata}});return {modified:true,etag};}
}
const site='https://quest-test.netlify.app',apiKey='netlify-test-service-key-123456789';
function client(store,options={}){
 return async(path,method='GET',body,token,service=false)=>{
  // A new handler simulates a cold function instance for every HTTP request.
  const handler=createNetlifyHandler({store,apiKey,...options});
  const r=await handler(new Request(site+path,{method,headers:{Origin:site,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(service?{'X-API-Key':apiKey}:{})},body:body!==undefined?JSON.stringify(body):undefined}));
  return {status:r.status,data:r.status===204?null:await r.json(),headers:r.headers};
 };
}
test('Netlify cold instances retain accounts, sessions, attempts, reports and the next lesson',async()=>{
 const store=new Store(),req=client(store);
 const a=(await req('/demo/register','POST')).data,b=(await req('/demo/register','POST')).data;
 assert.match(a.token,/^[a-f0-9-]{36}\.[\w-]{43}$/);
 let s=(await req('/v1/sessions','POST',{lessonId:'relatifs'},a.token)).data;
 assert.equal((await req(`/v1/sessions/${s.id}/answers`,'POST',{exerciseId:s.exercises[0].id,answer:'qui'},b.token)).status,404);
 for(const e of s.exercises){const source=exercises.find(x=>x.id===e.id);const r=await req(`/v1/sessions/${s.id}/answers`,'POST',{exerciseId:e.id,answer:source.answer},a.token);assert.equal(r.status,200);assert.equal(r.data.correct,true);}
 assert.equal((await req('/v1/me/progress','GET',undefined,a.token)).data.xp,30);
 assert.equal((await req('/v1/me/progress','GET',undefined,b.token)).data.xp,0);
 const report=(await req(`/v1/sessions/${s.id}/report`,'GET',undefined,a.token)).data;assert.equal(report.correct,3);assert.equal(report.nextLesson.id,'subjonctif');
 const next=(await req(`/v1/sessions/${s.id}/next`,'POST',{},a.token)).data;assert.equal(next.lesson.id,'subjonctif');
 assert.equal((await req(`/v1/sessions/${s.id}/next`,'POST',{},a.token)).data.id,next.id);
 assert.equal((await req('/.netlify/functions/api/v1/catalog','GET',undefined,a.token)).data.lessons.length,12);
 const bytes=store.records.get('learners/'+a.id).data;assert.equal(bytes.toString('ascii',0,15),'SQLite format 3');
});
test('simultaneous answers do not overwrite progress or bypass the two-try limit',async()=>{
 const store=new Store(),req=client(store),a=(await req('/demo/register','POST')).data;
 const s=(await req('/v1/sessions','POST',{lessonId:'etre-avoir'},a.token)).data;
 const send=(e,answer)=>req(`/v1/sessions/${s.id}/answers`,'POST',{exerciseId:e.id,answer},a.token);
 const [first,second]=await Promise.all(s.exercises.slice(0,2).map(e=>send(e,exercises.find(x=>x.id===e.id).answer)));
 assert.equal(first.status,200);assert.equal(second.status,200);assert.equal((await req('/v1/me/progress','GET',undefined,a.token)).data.xp,20);assert.ok(store.conflicts>0);
 const e=s.exercises[2];const wrong=await send(e,'incorrect');assert.equal(wrong.data.attemptsRemaining,1);assert.equal('expected' in wrong.data,false);
 const results=await Promise.all([send(e,'incorrect'),send(e,'incorrect')]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
});
test('service creation is unique, rotation revokes old tokens, deletion cannot revive old data',async()=>{
 const store=new Store(),req=client(store);
 const requests=await Promise.all([req('/v1/learners','POST',{externalId:'site-user-1'},undefined,true),req('/v1/learners','POST',{externalId:'site-user-1'},undefined,true)]);
 assert.deepEqual(requests.map(r=>r.status).sort(),[201,409]);const a=requests.find(r=>r.status===201).data;
 const rotated=(await req(`/v1/learners/${a.id}/token`,'POST',{},undefined,true)).data;
 assert.equal((await req('/v1/catalog','GET',undefined,a.token)).status,401);assert.equal((await req('/v1/catalog','GET',undefined,rotated.token)).status,200);
 assert.equal((await req('/v1/me','DELETE',{},rotated.token)).data.deleted,true);
 assert.equal((await req('/v1/me/progress','GET',undefined,rotated.token)).status,401);
 assert.equal(store.records.get('learners/'+a.id).metadata.deleted,true);
 const fresh=(await req('/v1/learners','POST',{externalId:'site-user-1'},undefined,true)).data;assert.equal(fresh.id,a.id);assert.notEqual(fresh.token,rotated.token);assert.equal((await req('/v1/me/progress','GET',undefined,fresh.token)).data.xp,0);
});
test('Netlify registration and input validation preserve origin and service boundaries',async()=>{
 const store=new Store(),handler=createNetlifyHandler({store,apiKey});
 assert.equal((await handler(new Request(site+'/demo/register',{method:'POST',headers:{Origin:'https://other.example'}}))).status,403);
 assert.equal((await handler(new Request(site+'/demo/register',{method:'POST'}))).status,403);
 assert.equal((await client(store,{demoRegistration:false})('/demo/register','POST')).status,403);
 assert.equal((await client(store)('/v1/learners','POST',{externalId:'bad'})).status,401);
 assert.equal((await handler(new Request(site+'/demo/register',{method:'POST',headers:{Origin:site,'Content-Type':'application/json'},body:JSON.stringify({padding:'x'.repeat(17000)})}))).status,413);
 assert.equal((await client(store)('/v1/catalog','GET',undefined,'wrong-token')).status,401);
 assert.equal((await client(store)('/health')).data.storage,'netlify-blobs');
});
