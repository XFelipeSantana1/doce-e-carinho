import http from 'node:http';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import { responder } from './conversa.mjs';
import { clienteAutorizado } from './remetente.mjs';

for(const name of ['REDIS_PASSWORD','BOT_API_KEY','WAHA_API_KEY','BOT_WEBHOOK_KEY','BOT_TEST_PHONE']) {
  if(!process.env[name]) throw new Error(`Configure ${name}`);
}
const redis=createClient({socket:{host:'redis',port:6379},password:process.env.REDIS_PASSWORD});
redis.on('error',()=>console.error('Falha de conexão com Redis'));
await redis.connect();
const base=process.env.BACKEND_URL || 'http://host.docker.internal:3000/api';
const stateKey=chat=>'confeitaria:conversa:'+chat;
const save=(chat,state)=>redis.set(stateKey(chat),JSON.stringify(state),{EX:86400});
async function api(url,options={}) {
  const response=await fetch(url,{...options,signal:AbortSignal.timeout(35000)});
  const body=await response.json();
  if(!response.ok){const error=new Error('API indisponível');error.status=response.status;error.publicMessage=body.erro || 'Revise os itens.';throw error;}
  return body;
}
async function send(chat,text){return api('http://waha:3000/api/sendText',{method:'POST',headers:{'Content-Type':'application/json','X-Api-Key':process.env.WAHA_API_KEY},body:JSON.stringify({session:'default',chatId:chat,text})});}
async function processar(event) {
  const p=event.payload;
  if(event.event!=='message' || event.session!=='default' || !p || p.fromMe!==false || typeof p.from!=='string' || !p.id)return {ignorado:true};
  if(!await clienteAutorizado(p.from,process.env.BOT_TEST_PHONE,lid=>api('http://waha:3000/api/default/lids/'+encodeURIComponent(lid),{headers:{'X-Api-Key':process.env.WAHA_API_KEY}})))return {ignorado:true};
  const chat=process.env.BOT_TEST_PHONE+'@c.us', destino=p.from, lock='confeitaria:lock:'+chat, token=randomUUID();
  if(!await redis.set(lock,token,{NX:true,EX:180})){const error=new Error('Atendimento ocupado');error.status=503;throw error;}
  try {
    const messageKey='confeitaria:mensagem:'+p.id;
    const previous=await redis.get(messageKey);
    if(previous){const delivery=JSON.parse(previous);if(!delivery.sent && delivery.text){await send(destino,delivery.text);await redis.set(messageKey,JSON.stringify({...delivery,sent:true}),{EX:172800});}return {repetida:true};}
    const raw=await redis.get(stateKey(chat)),state=raw?JSON.parse(raw):null;
    const services={telefone:process.env.BOT_TEST_PHONE,salvar:s=>save(chat,s),
      catalogo:()=>api(base+'/bot/produtos',{headers:{'x-api-key':process.env.BOT_API_KEY}}),
      cotar:body=>api(base+'/bot/entrega/cotar',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':process.env.BOT_API_KEY},body:JSON.stringify(body)}),
      cancelar:id=>api(base+'/bot/pedidos/'+id+'/cancelamento',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':process.env.BOT_API_KEY},body:JSON.stringify({whatsapp:process.env.BOT_TEST_PHONE})}),
      criar:body=>api(base+'/bot/pedidos',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':process.env.BOT_API_KEY},body:JSON.stringify(body)})};
    const result=typeof p.body==='string'&&p.body.trim() ? await responder(state,p.body.trim(),services) : {state,text:'Por enquanto consigo atender por texto. Escreva MENU para começar.'};
    if(result.state)await save(chat,result.state);
    await redis.set(messageKey,JSON.stringify({text:result.text,sent:false}),{EX:172800});
    if(result.text)await send(destino,result.text);
    await redis.set(messageKey,JSON.stringify({text:result.text,sent:true}),{EX:172800});
    console.log('Mensagem atendida; etapa:',result.state?.etapa || 'sem estado');
    return {ok:true};
  } finally {
    await redis.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",{keys:[lock],arguments:[token]});
  }
}
http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');
  if(req.method==='GET' && req.url==='/health'){res.end(JSON.stringify({status:redis.isReady?'ok':'indisponivel',modo:'teste restrito'}));return;}
  const supplied=Buffer.from(String(req.headers['x-bot-key']||'')),expected=Buffer.from(process.env.BOT_WEBHOOK_KEY);
  if(req.method!=='POST'||req.url!=='/message'||supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){res.writeHead(403);res.end('{}');return;}
  try {
    let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>65536){res.writeHead(413);res.end('{}');return;}}
    let event;try{event=JSON.parse(body);}catch{res.writeHead(400);res.end('{}');return;}
    res.end(JSON.stringify(await processar(event)));
  }catch(error){console.error('Erro no atendimento:',error.status||'rede');res.writeHead(503);res.end(JSON.stringify({erro:'Não foi possível atender agora'}));}
}).listen(3002,'0.0.0.0',()=>console.log('Atendimento ativo; respostas limitadas ao cliente de teste.'));
