import {mkdirSync} from 'node:fs';
import {createApp} from './app.js';
mkdirSync('data',{recursive:true});
const {server,db}=createApp({dbPath:process.env.DB_PATH||'data/quest.sqlite',apiKey:process.env.API_KEY,origins:(process.env.ALLOWED_ORIGINS||'https://tcf-express.com,https://www.tcf-express.com').split(',')});
server.listen(Number(process.env.PORT||8080),process.env.HOST||'127.0.0.1',()=>console.log('Français Quest API listening'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
