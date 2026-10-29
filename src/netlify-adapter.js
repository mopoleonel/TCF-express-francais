import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {Readable} from 'node:stream';
import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import {createApp} from './app.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const same=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y);};
const accountId=externalId=>{const hex=hash('francais-quest:'+externalId);return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;};
const reply=(status,data,headers={})=>new Response(status===204?null:JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});

// Reuse the exact Node API without binding a port in a serverless invocation.
async function dispatch(app,{path,method,headers,body}){
 const req=Readable.from(body?[Buffer.from(body)]:[]);Object.assign(req,{url:path,method,headers});
 const responseHeaders={};let status=200,payload='';
 const res={setHeader(name,value){responseHeaders[name]=value;},writeHead(code,values={}){status=code;Object.assign(responseHeaders,values);},end(data){payload=data||'';}};
 await app.server.listeners('request')[0](req,res);
 return {status,headers:responseHeaders,body:payload};
}

/** A separate SQLite snapshot per learner; Blobs is the durable source of truth.
 * Conditional writes prevent simultaneous function instances from losing an answer.
 * The temporary SQLite file is discarded after every invocation.
 */
export function createNetlifyHandler({store,apiKey='',demoRegistration=true,allowedOrigins=[]}={}){
 if(!store)throw new Error('A persistent store is required');
 const engineKey=apiKey.length>=24?apiKey:randomBytes(32).toString('hex');
 return async function handle(request){
  let directory,app;
  const url=new URL(request.url),path=url.pathname.replace(/^\/\.netlify\/functions\/api(?=\/|$)/,'')||'/';
  const origin=request.headers.get('origin'),origins=[url.origin,...allowedOrigins],cors=origin&&origins.includes(origin)?{'Access-Control-Allow-Origin':origin,Vary:'Origin'}:{};
  const finish=(status,data)=>reply(status,data,cors);
  try{
   if(origin&&!origins.includes(origin))return finish(403,{error:'Origin forbidden'});
   if(request.method==='OPTIONS')return reply(204,null,{...cors,'Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type, X-API-Key'});
   if(path==='/health'&&request.method==='GET')return finish(200,{status:'ok',storage:'netlify-blobs'});
   const method=request.method;
   if(!['GET','POST','DELETE'].includes(method))return finish(405,{error:'Method not allowed'});
   // Read incrementally, with the same 16 KiB ceiling as the local API.
   let raw='';if(request.body){const reader=request.body.getReader();let bytes=0;const parts=[];while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>16384){await reader.cancel();return finish(413,{error:'Body too large'});}parts.push(Buffer.from(value));}raw=Buffer.concat(parts).toString('utf8');}
   let body={};if(raw){if(!request.headers.get('content-type')?.startsWith('application/json'))return finish(415,{error:'Use application/json'});try{body=JSON.parse(raw);}catch{return finish(400,{error:'Invalid JSON'});}if(!body||Array.isArray(body)||typeof body!=='object')return finish(400,{error:'Expected JSON object'});}
   const bootstrap=path==='/demo/register'&&method==='POST',create=path==='/v1/learners'&&method==='POST',rotation=path.match(/^\/v1\/learners\/([^/]+)\/token$/);
   const service=apiKey.length>=24&&same(request.headers.get('x-api-key'),apiKey);
   if(create||rotation){if(!service)return finish(401,{error:'Service key required'});}
   if(bootstrap){if(!demoRegistration)return finish(403,{error:'Demo registration is disabled'});if(origin!==url.origin)return finish(403,{error:'Same-origin registration required'});}
   const token=request.headers.get('authorization')?.replace(/^Bearer /,''),tokenId=token?.split('.')[0];
   let id;
   if(bootstrap||create){
    const {externalId,locale='en',track='foundation'}=body;
    if((create&&(typeof externalId!=='string'||!externalId.trim()||externalId.length>128))||!['fr','en'].includes(locale)||!['foundation','refresher'].includes(track))return finish(400,{error:'Invalid learner profile'});
    id=create?accountId(externalId):randomUUID();
   }else if(rotation){id=rotation[1];if(!uuid.test(id))return finish(404,{error:'Learner not found'});}
   else{if(!token||!uuid.test(tokenId||'')||!/^[-A-Za-z0-9_]{43}$/.test(token.slice(37)))return finish(401,{error:'Learner bearer token required'});id=tokenId;}
   directory=await mkdtemp(join(tmpdir(),'quest-netlify-'));const file=join(directory,'learner.sqlite'),key='learners/'+id;
   const headers=Object.fromEntries(request.headers.entries());
   for(let retry=0;retry<5;retry++){
    const saved=await store.getWithMetadata(key,{type:'arrayBuffer',consistency:'strong'});
    if(bootstrap||create){if(saved&&!saved.metadata?.deleted)return finish(409,{error:'Learner exists; use token rotation'});}
    else if(!saved||saved.metadata?.deleted)return finish(rotation?404:401,{error:rotation?'Learner not found':'Learner bearer token required'});
    if(saved&&!saved.metadata?.deleted)await writeFile(file,Buffer.from(saved.data));
    app=createApp({dbPath:file,apiKey:engineKey,origins});
    let response;
    if(bootstrap||create){
     const fullToken=id+'.'+randomBytes(32).toString('base64url'),{locale='en',track='foundation'}=body;
     app.db.prepare('INSERT INTO learners VALUES(?,?,?,?,?)').run(id,create?body.externalId:id,locale,track,hash(fullToken));
     response={status:201,body:JSON.stringify({id,locale,track,token:fullToken}),headers:{}};
    }else if(rotation&&method==='POST'){
     const fullToken=id+'.'+randomBytes(32).toString('base64url');
     const changed=app.db.prepare('UPDATE learners SET token_hash=? WHERE id=?').run(hash(fullToken),id).changes;
     response={status:changed?200:404,body:JSON.stringify(changed?{token:fullToken}:{error:'Learner not found'}),headers:{}};
    }else response=await dispatch(app,{path:url.search?path+url.search:path,method,headers,body:raw});
    app.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');app.db.close();app=null;
    if(response.status>=400||method==='GET')return new Response(response.body,{status:response.status,headers:{...response.headers,...cors,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
    const snapshot=await readFile(file);
    const deleted=method==='DELETE'&&path==='/v1/me';
    const {modified}=await store.set(key,snapshot,{...(saved?{onlyIfMatch:saved.etag}:{onlyIfNew:true}),metadata:{schema:1,deleted}});
    if(modified)return new Response(response.body,{status:response.status,headers:{...response.headers,...cors,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
    // Another instance saved first. Load the latest snapshot and replay validation.
    // WAL is checkpointed and closed before replacing the file on the next iteration.
   }
   return finish(409,{error:'Concurrent update; please retry'});
  }catch(error){console.error('Quest function failure:',error.name);return finish(503,{error:'Progress storage temporarily unavailable. Please retry.'});}
  finally{
   if(app){try{app.db.close();}catch{}}
   if(directory&&resolve(directory).startsWith(resolve(tmpdir())+sep))await rm(directory,{recursive:true,force:true});
  }
 };
}
