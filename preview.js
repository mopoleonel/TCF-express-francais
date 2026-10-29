// Local-only demo host. Never expose this registration route on a public server.
import http from 'node:http';
import {readFileSync,mkdirSync,readdirSync} from 'node:fs';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {createApp} from './src/app.js';
mkdirSync('data',{recursive:true});
const port=Number(process.env.PREVIEW_PORT||8081);
const origin=`http://127.0.0.1:${port}`,hosts=[`127.0.0.1:${port}`,`localhost:${port}`],origins=hosts.map(h=>'http://'+h);
const app=createApp({dbPath:'data/preview.sqlite',apiKey:randomBytes(32).toString('hex'),origins});
const assets={'/':['public/index.html','text/html; charset=utf-8'],'/app.js':['public/app.js','text/javascript; charset=utf-8'],'/oral.js':['public/oral.js','text/javascript; charset=utf-8'],'/oral-content.js':['public/oral-content.js','text/javascript; charset=utf-8'],'/assets/leo-avatar.png':['public/assets/leo-avatar.png','image/png'],'/style.css':['public/style.css','text/css; charset=utf-8']};
assets['/audio/manifest.json']=['public/audio/manifest.json','application/json; charset=utf-8'];
assets['/theme.css']=['public/theme.css','text/css; charset=utf-8'];
assets['/audio-young/manifest.json']=['public/audio-young/manifest.json','application/json; charset=utf-8'];
for(const file of readdirSync(new URL('public/audio-young/',import.meta.url)))if(/^[a-f0-9]{16}\.wav$/.test(file))assets['/audio-young/'+file]=['public/audio-young/'+file,'audio/wav'];
for(const file of readdirSync(new URL('public/audio/',import.meta.url)))if(/^[a-f0-9]{16}\.wav$/.test(file))assets['/audio/'+file]=['public/audio/'+file,'audio/wav'];
http.createServer((req,res)=>{
 if(!hosts.includes(req.headers.host)){res.writeHead(403);return res.end();}
 if(req.url==='/demo/register'&&req.method==='POST'){
  if(req.headers.origin!=='http://'+req.headers.host){res.writeHead(403);return res.end();}
  const id=randomUUID(),token=randomBytes(32).toString('base64url');
  app.db.prepare('INSERT INTO learners VALUES(?,?,?,?,?)').run(id,id,'en','foundation',createHash('sha256').update(token).digest('hex'));
  res.writeHead(201,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({id,token}));
 }
 if(assets[req.url]&&req.method==='GET'){
  const [file,type]=assets[req.url];res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});return res.end(readFileSync(new URL(file,import.meta.url)));
 }
 app.server.emit('request',req,res);
}).listen(port,'127.0.0.1',()=>console.log(`Local: ${origin}`));
