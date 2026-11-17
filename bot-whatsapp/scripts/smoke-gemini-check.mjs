import assert from 'node:assert/strict';
import {createClient} from 'redis';
const store=createClient({socket:{host:'redis'},password:'smoke-password'});await store.connect();
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const base='http://127.0.0.1:3002',phone='5515999998888',key='confeitaria:conversa:'+phone+'@c.us';
for(let i=0;i<60;i++){try{if((await fetch(base+'/health')).ok)break;}catch{}await wait(100);}
assert.equal((await (await fetch(base+'/health')).json()).ia.status,'configurado');
let counter=0;
const event=(body,from=phone)=>({event:'message',session:'default',payload:{id:'gemini-smoke-'+(++counter),from:from+'@c.us',fromMe:false,body}});
const postRaw=data=>fetch(base+'/message',{method:'POST',headers:{'Content-Type':'application/json','x-bot-key':'smoke-webhook'},body:JSON.stringify(data)});
const drain=async()=>{for(let i=0;i<240;i++){if(await store.lLen('confeitaria:waha:entrada')===0)return;await wait(25);}throw Error('Fila não esvaziou');};
const post=async data=>{const r=await postRaw(data);await drain();return r;};
assert.equal((await fetch(base+'/message',{method:'POST',body:'{}'})).status,403);
await post(event('Quero dois doces','5515888887777'));assert.equal(await store.get('smoke:gemini'),null);assert.equal(await store.lLen('smoke:out'),0);
const order=event('Quero dois doces teste');assert.equal((await post(order)).status,200);
let state=JSON.parse(await store.get(key));assert.equal(state.itens[0].quantidade,2);assert.equal(state.etapa,'produto');assert.equal(await store.get('smoke:gemini'),'1');assert.equal(await store.get('smoke:pedidos'),null);
const outputs=await store.lLen('smoke:out');await post(order);assert.equal(await store.lLen('smoke:out'),outputs);assert.equal(await store.get('smoke:gemini'),'1');
await Promise.all([postRaw(event('Na verdade, só um.')),postRaw(event('sacola'))]);await drain();
state=JSON.parse(await store.get(key));assert.equal(state.itens[0].quantidade,1);
await post(event('Pode explicar as opções?'));assert.equal(await store.get('smoke:gemini'),'1'); // limite compartilhado no Redis
for(const text of ['fechar','Maria Particular','retirada','pix']){assert.equal((await post(event(text))).status,200);}
state=JSON.parse(await store.get(key));assert.equal(state.etapa,'confirmar');assert.equal(await store.get('smoke:pedidos'),null);
const confirm=event('confirmar');await post(confirm);await post(confirm);assert.equal(await store.get('smoke:pedidos'),'1');
await post(event('PEDIDO #42'));assert.match(JSON.parse((await store.lRange('smoke:out',-1,-1))[0]).text,/em preparo/);
const acceptedBeforeTimeout=event('sacola');const beforeTimeout=await store.lLen('smoke:out');
await store.set('smoke:falhar-envio','1');await post(acceptedBeforeTimeout);await post(acceptedBeforeTimeout);assert.equal(await store.lLen('smoke:out'),beforeTimeout+1);
await post(null); // Entrada malformada não bloqueia a fila.
await post(event('atendente'));const count=await store.lLen('smoke:out');await post(event('Quero dois doces teste'));assert.equal(await store.lLen('smoke:out'),count);
assert.equal(await store.get('smoke:gemini'),'1');
await store.quit();
console.log('PASS: WAHA + Gemini simulados, HTTP autenticado, Redis, limite de IA, isolamento do cliente, sacola natural, dados cadastrais locais, confirmação explícita, deduplicação e status. Sem mensagens reais.');
