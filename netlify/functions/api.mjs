import {getStore} from '@netlify/blobs';
import {createNetlifyHandler} from '../../src/netlify-adapter.js';

export default async function handler(request,context){
 try{
  const name=process.env.QUEST_STORE||(context?.deploy?.context==='production'?'francais-quest-production-v1':'francais-quest-preview-v1');
  const store=getStore({name,consistency:'strong'});
  return await createNetlifyHandler({store,apiKey:process.env.API_KEY||'',demoRegistration:process.env.DEMO_REGISTRATION!=='false',allowedOrigins:(process.env.ALLOWED_ORIGINS||'https://tcf-express.com,https://www.tcf-express.com').split(',').filter(Boolean),registrationLimit:Number(process.env.REGISTRATION_LIMIT||40)})(request);
 }catch(error){console.error('Netlify storage configuration:',error.name);return Response.json({error:'Netlify storage is not available for this deployment.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
