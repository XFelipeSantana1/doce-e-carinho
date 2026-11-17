import { criarFilaCliente } from './fila-cliente.mjs';
import http from 'node:http';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import { responderComIA } from './atendimento-ia.mjs';
import { geminiConfigurado, interpretarGemini, reservarChamadaGemini, MODELO_GEMINI } from './gemini.mjs';
import { clienteAutorizado, canonical } from './remetente.mjs';
import { montarMensagemMeta, interpretarEscolha, enviarMeta, FalhaMeta } from './meta.mjs';
import { receberWebhook, verificarWebhook } from './meta-webhook.mjs';

const provider = process.env.WHATSAPP_PROVIDER || 'waha';
if (!['waha', 'meta'].includes(provider)) throw new Error('WHATSAPP_PROVIDER inválido');

for(const name of ['REDIS_PASSWORD','BOT_API_KEY','BOT_WEBHOOK_KEY','BOT_TEST_PHONE', ...(provider === 'waha' ? ['WAHA_API_KEY'] : ['META_ACCESS_TOKEN','META_PHONE_NUMBER_ID','META_API_VERSION','META_APP_SECRET','META_VERIFY_TOKEN'])]) {
  if(!process.env[name]) throw new Error(`Configure ${name}`);
}
if (!/^\d{10,15}$/.test(process.env.BOT_TEST_PHONE)) throw new Error('BOT_TEST_PHONE inválido');
if (provider === 'meta' && (!/^\d+$/.test(process.env.META_PHONE_NUMBER_ID) || !/^v\d+\.\d+$/.test(process.env.META_API_VERSION))) throw new Error('Configuração Meta inválida');
const redis=createClient({socket:{host:process.env.REDIS_HOST || 'redis',port:6379},password:process.env.REDIS_PASSWORD});
redis.on('error',()=>console.error('Falha de conexão com Redis'));
await redis.connect();
const interpretar = geminiConfigurado() ? (texto,state,produtos)=>interpretarGemini(texto,state,produtos,{
  reservar:()=>reservarChamadaGemini(redis),
  pausar:()=>redis.set('confeitaria:gemini:pausa','1',{EX:60}),
}) : null;
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
const filaCliente=criarFilaCliente();
const processar=(event,metaMessage=null)=>filaCliente(canonical(process.env.BOT_TEST_PHONE),()=>processarMensagem(event,metaMessage));
async function processarMensagem(event, metaMessage = null) {
  const p=event?.payload;
  if(event?.event!=='message' || event.session!=='default' || !p || p.fromMe!==false || typeof p.from!=='string' || typeof p.id!=='string' || !p.id || p.id.length>256)return {ignorado:true};
  if(metaMessage ? canonical(p.from) !== canonical(process.env.BOT_TEST_PHONE) : !await clienteAutorizado(p.from,process.env.BOT_TEST_PHONE,lid=>api('http://waha:3000/api/default/lids/'+encodeURIComponent(lid),{headers:{'X-Api-Key':process.env.WAHA_API_KEY}})))return {ignorado:true};
  const chat=process.env.BOT_TEST_PHONE+'@c.us', destino=p.from, lock='confeitaria:lock:'+chat, token=randomUUID();
  if(!await redis.set(lock,token,{NX:true,EX:180})){const error=new Error('Atendimento ocupado');error.status=503;throw error;}
  try {
    const messageKey='confeitaria:mensagem:'+chat+':'+p.id;
    const previous=await redis.get(messageKey);
    if(previous)return {repetida:true}; // Entrega incerta não é reenviada: pode já ter sido aceita pelo provedor.
    const raw=await redis.get(stateKey(chat)),state=raw?JSON.parse(raw):null;
    let input = p.body;
    let pageResult = null, page = 0;
    if (metaMessage) {
      const age = Date.now() / 1000 - metaMessage.timestamp;
      if (!Number.isFinite(age) || age < -300 || age >= 86400) return {ignorado:true};
      // Guardar a hora real da mensagem; reentregas não renovam a janela.
      const windowKey = 'confeitaria:meta:janela:' + canonical(process.env.BOT_TEST_PHONE);
      const last = Number(await redis.get(windowKey) || 0);
      if (metaMessage.timestamp > last) await redis.set(windowKey, String(metaMessage.timestamp), {EX:86400});
      if (metaMessage.choice) {
        const selected = interpretarEscolha(metaMessage.choice, state?._metaUi);
        if (!selected) return {ignorado:true, motivo:'opcao_expirada'};
        if (selected.page !== undefined) { pageResult = state._metaUi.result; page = selected.page; }
        else input = selected.text;
      }
    }
    const services={telefone:process.env.BOT_TEST_PHONE,salvar:s=>save(chat,s),
      consultar:id=>api(base+'/bot/pedidos/'+id+'?whatsapp='+encodeURIComponent(process.env.BOT_TEST_PHONE),{headers:{'x-api-key':process.env.BOT_API_KEY}}),
      catalogo:()=>api(base+'/bot/produtos',{headers:{'x-api-key':process.env.BOT_API_KEY}}),
      cotar:body=>api(base+'/bot/entrega/cotar',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':process.env.BOT_API_KEY},body:JSON.stringify(body)}),
      cancelar:id=>api(base+'/bot/pedidos/'+id+'/cancelamento',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':process.env.BOT_API_KEY},body:JSON.stringify({whatsapp:process.env.BOT_TEST_PHONE})}),
      criar:body=>api(base+'/bot/pedidos',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':process.env.BOT_API_KEY},body:JSON.stringify(body)})};
    const result=pageResult ? {...pageResult, state} : typeof input==='string'&&input.trim() ? await responderComIA(state,input.trim(),services,interpretar) : {state,text:state?.etapa==='humano'?null:'Por enquanto consigo atender por texto. Escreva MENU para começar.'};
    if (metaMessage && result.text) {
      const uiToken = randomUUID();
      const {state: _state, ...presentation} = result;
      if (result.state) result.state._metaUi = { token: uiToken, result: presentation };
      // Persistir a decisão e a entrega ANTES de tentar enviar. Em timeout, não reenviar às cegas.
      const transaction = redis.multi();
      if (result.state) transaction.set(stateKey(chat),JSON.stringify(result.state),{EX:86400});
      transaction.set(messageKey, JSON.stringify({sent:false, estado:'enviando'}), {EX:172800});
      await transaction.exec();
      try {
        await enviarMeta(montarMensagemMeta(metaMessage.from, result, uiToken, page));
        await redis.set(messageKey, JSON.stringify({sent:true}), {EX:172800});
      } catch (error) {
        await redis.set(messageKey, JSON.stringify({sent:false, estado:error instanceof FalhaMeta ? error.estado : 'incerto'}), {EX:172800});
        console.error('Cloud API: envio exige conferência; nenhuma repetição automática.');
      }
      return {ok:true};
    }
    const transaction=redis.multi();
    if(result.state)transaction.set(stateKey(chat),JSON.stringify(result.state),{EX:86400});
    transaction.set(messageKey,JSON.stringify({sent:false,estado:'enviando'}),{EX:172800});
    await transaction.exec();
    try {
      if(result.text)await send(destino,result.text);
      await redis.set(messageKey,JSON.stringify({sent:true}),{EX:172800});
    } catch {
      await redis.set(messageKey,JSON.stringify({sent:false,estado:'incerto'}),{EX:172800});
      console.error('WAHA: entrega incerta; conferir antes de reenviar manualmente.');
    }
    console.log('Mensagem atendida; etapa:',result.state?.etapa || 'sem estado');
    return {ok:true};
  } finally {
    await redis.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",{keys:[lock],arguments:[token]});
  }
}
// Fila persistida no Redis: responder ao webhook rapidamente e processar depois.
// Uma instância de atendimento; o lock da conversa e a deduplicação também protegem reentregas.
let working = false;
async function consumirEntrada() {
  if (working) return;
  working = true;
  const queue = 'confeitaria:'+provider+':entrada';
  let item;
  try {
    item = await redis.lIndex(queue, 0);
    if (!item) return;
    const m = JSON.parse(item);
    if(provider==='meta')await processar({event:'message',session:'default',payload:{id:'meta:'+m.id,from:m.from+'@c.us',fromMe:false,body:m.text}}, m);
    else await processar(m);
    await redis.eval("if redis.call('lindex',KEYS[1],0) == ARGV[1] then redis.call('hdel',KEYS[2],ARGV[1]); return redis.call('lpop',KEYS[1]) else return nil end", {keys:[queue,queue+':tentativas'],arguments:[item]});
  } catch {
    // Falhas de processamento têm no máximo três tentativas por entrada; Redis fora do ar não conta.
    if(item) {
      try {
        const attempts=await redis.hIncrBy(queue+':tentativas',item,1);
        if(attempts>=3){await redis.multi().rPush(queue+':falhas',item).lTrim(queue+':falhas',-100,-1).expire(queue+':falhas',86400).lPop(queue).hDel(queue+':tentativas',item).exec();}
      } catch { /* Mantém a entrada quando o armazenamento está indisponível. */ }
    }
    console.error('Mensagem não processada; consultar fila de falhas se não houver retomada.');
  }
  finally { working = false; }
}
setInterval(consumirEntrada, 500).unref();

async function lerCorpo(req) {
  const chunks=[]; let size=0;
  for await (const chunk of req) { size += chunk.length; if (size > 262144) { const e=new Error('Corpo grande'); e.status=413; throw e; } chunks.push(chunk); }
  return Buffer.concat(chunks);
}

http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');
  if(req.method==='GET' && req.url==='/health'){res.end(JSON.stringify({status:redis.isReady?'ok':'indisponivel',modo:'teste restrito',provider,ia:{provedor:'gemini',status:interpretar?'configurado':process.env.GEMINI_ENABLED==='true'?'aguardando_chave':'desativado',modelo:process.env.GEMINI_MODEL||MODELO_GEMINI}}));return;}
  const url = new URL(req.url, 'http://localhost');
  try {
    if (provider === 'meta' && url.pathname === '/webhook/meta') {
      if (req.method === 'GET') {
        const challenge = verificarWebhook(url, process.env.META_VERIFY_TOKEN);
        res.writeHead(challenge === null ? 403 : 200, {'Content-Type':'text/plain'}); res.end(challenge || ''); return;
      }
      if (req.method !== 'POST') {res.writeHead(405);res.end('{}');return;}
      const result = receberWebhook(await lerCorpo(req), req.headers['x-hub-signature-256'], process.env);
      if (result.status === 200 && result.messages.length) await redis.rPush('confeitaria:meta:entrada', result.messages.map(m=>JSON.stringify(m)));
      res.writeHead(result.status); res.end('{}'); return;
    }
    const supplied=Buffer.from(String(req.headers['x-bot-key']||'')),expected=Buffer.from(process.env.BOT_WEBHOOK_KEY);
    if(req.method!=='POST' || supplied.length!==expected.length || !timingSafeEqual(supplied,expected)) {res.writeHead(403);res.end('{}');return;}
    if (provider === 'meta' && url.pathname === '/notify') {
      let body; try {body=JSON.parse((await lerCorpo(req)).toString('utf8'));} catch {res.writeHead(400);res.end('{}');return;}
      if (typeof body.telefone !== 'string' || !/^\d{10,15}$/.test(body.telefone) || canonical(body.telefone) !== canonical(process.env.BOT_TEST_PHONE)) {res.writeHead(403);res.end(JSON.stringify({estado:'bloqueado'}));return;}
      if (typeof body.texto !== 'string' || !body.texto.trim() || body.texto.length > 4096) {res.writeHead(400);res.end(JSON.stringify({estado:'falha'}));return;}
      const last = Number(await redis.get('confeitaria:meta:janela:'+canonical(body.telefone)) || 0);
      if (!last || Date.now()/1000-last >= 86400) {res.writeHead(409);res.end(JSON.stringify({estado:'falha',erro:'Janela de 24 horas encerrada. O cliente precisa enviar uma mensagem ou usar um template aprovado.'}));return;}
      try {
        await enviarMeta({messaging_product:'whatsapp',to:body.telefone,type:'text',text:{body:body.texto,preview_url:false}});
        res.end(JSON.stringify({estado:'enviado'}));
      } catch (error) {res.writeHead(502);res.end(JSON.stringify({estado:error instanceof FalhaMeta ? error.estado : 'incerto'}));}
      return;
    }
    if (provider !== 'waha' || url.pathname !== '/message') {res.writeHead(403);res.end('{}');return;}
    let event;try{event=JSON.parse((await lerCorpo(req)).toString('utf8'));}catch{res.writeHead(400);res.end('{}');return;}
    await redis.rPush('confeitaria:waha:entrada',JSON.stringify(event));
    res.end(JSON.stringify({recebida:true}));
  }catch(error){console.error('Erro no atendimento:',error.status||'rede');res.writeHead(error.status===413?413:503);res.end(JSON.stringify({erro:'Não foi possível atender agora'}));}
}).listen(3002,'0.0.0.0',()=>console.log('Atendimento ativo; respostas limitadas ao cliente de teste; provedor:',provider));
