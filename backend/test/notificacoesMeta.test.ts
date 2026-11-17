import test from 'node:test';
import assert from 'node:assert/strict';
import { enviarAvisoWhatsApp } from '../src/services/avisoPronto.js';

test('avisos oficiais passam somente pelo atendimento e respeitam isolamento, janela e incerteza', async () => {
 const keys=['WHATSAPP_PROVIDER','BOT_TEST_PHONE','BOT_SERVICE_URL','BOT_WEBHOOK_KEY'];
 const original=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 const originalFetch=globalThis.fetch;
 try {
  Object.assign(process.env,{WHATSAPP_PROVIDER:'meta',BOT_TEST_PHONE:'5515999998888',BOT_SERVICE_URL:'http://bot.invalid:3002',BOT_WEBHOOK_KEY:'teste-local'});
  let calls=0;
  globalThis.fetch=async(url,options)=>{
   calls++;assert.equal(String(url),'http://bot.invalid:3002/notify');
   assert.equal((options?.headers as Record<string,string>)['x-bot-key'],'teste-local');
   assert.deepEqual(JSON.parse(String(options?.body)),{telefone:'5515999998888',texto:'Pagamento confirmado'});
   return new Response(JSON.stringify({estado:'enviado'}));
  };
  await enviarAvisoWhatsApp('5515999998888','Pagamento confirmado');assert.equal(calls,1);
  await assert.rejects(()=>enviarAvisoWhatsApp('5515888887777','Não enviar'),(e: unknown)=>(e as {estado:string}).estado==='bloqueado');
  assert.equal(calls,1);
  globalThis.fetch=async()=>new Response(JSON.stringify({estado:'falha'}),{status:409});
  await assert.rejects(()=>enviarAvisoWhatsApp('5515999998888','Janela encerrada'),(e:unknown)=>(e as {estado:string}).estado==='falha');
  globalThis.fetch=async()=>{throw new Error('timeout');};
  await assert.rejects(()=>enviarAvisoWhatsApp('5515999998888','Incerteza'),(e:unknown)=>(e as {estado:string}).estado==='incerto');
  process.env.WHATSAPP_PROVIDER='invalido';
  await assert.rejects(()=>enviarAvisoWhatsApp('5515999998888','Bloquear'),(e:unknown)=>(e as {estado:string}).estado==='falha');
 } finally {
  globalThis.fetch=originalFetch;
  for(const key of keys) {if(original[key]===undefined)delete process.env[key];else process.env[key]=original[key];}
 }
});
