import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { assinaturaValida, mensagensMeta, montarMensagemMeta, interpretarEscolha, enviarMeta } from '../src/meta.mjs';
import { verificarWebhook, receberWebhook } from '../src/meta-webhook.mjs';
import { responder } from '../src/conversa.mjs';

const phone = '5515999998888';
const env = { META_PHONE_NUMBER_ID:'1234', BOT_TEST_PHONE:phone, META_APP_SECRET:'segredo-de-teste', META_ACCESS_TOKEN:'token-teste', META_API_VERSION:'v27.0' };
const webhook = messages => ({ object:'whatsapp_business_account', entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:'1234'},messages}}]}] });
const message = { id:'wamid.teste',from:phone,timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body:'oi'} };

test('verificação do webhook exige token correto e devolve apenas o desafio', () => {
  const url=new URL('https://example.invalid/webhook/meta?hub.mode=subscribe&hub.verify_token=teste&hub.challenge=123');
  assert.equal(verificarWebhook(url,'teste'),'123');
  assert.equal(verificarWebhook(url,'outro'),null);
  assert.equal(verificarWebhook(url,''),null);
});

test('assinatura é validada sobre os bytes originais antes de interpretar JSON', () => {
  const raw=Buffer.from(JSON.stringify(webhook([message])));
  const signature='sha256='+createHmac('sha256',env.META_APP_SECRET).update(raw).digest('hex');
  assert.equal(assinaturaValida(raw,signature,env.META_APP_SECRET),true);
  assert.equal(receberWebhook(raw,signature,env).messages.length,1);
  assert.equal(receberWebhook(Buffer.concat([raw,Buffer.from(' ')]),signature,env).status,401);
  assert.equal(receberWebhook(raw,undefined,env).status,401);
  assert.equal(receberWebhook(raw,'sha256=zz',env).status,401);
  const invalid=Buffer.from('{');
  assert.equal(receberWebhook(invalid,'sha256='+createHmac('sha256',env.META_APP_SECRET).update(invalid).digest('hex'),env).status,400);
});

test('só aceita cliente de teste e phone_number_id configurado; status e BSUID não autorizam respostas', () => {
  const body=webhook([message,{...message,id:'outra',from:'5515888887777'},{...message,id:'sem-numero',from:undefined,from_user_id:'US.1'}]);
  assert.deepEqual(mensagensMeta(body,'1234',phone).map(m=>m.id),['wamid.teste']);
  assert.equal(mensagensMeta(body,'9999',phone).length,0);
  assert.equal(mensagensMeta({object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:'1234'},statuses:[{status:'read'}]}}]}]},'1234',phone).length,0);
  assert.equal(mensagensMeta(null,'1234',phone).length,0);
  assert.equal(mensagensMeta(body,'1234',phone.slice(0,4)+phone.slice(5)).length,1);
});

test('botões e listas usam IDs vinculados à mensagem atual; títulos recebidos não são comandos', () => {
  const result={text:'Escolha',opcoes:[{title:'Retirar na loja',value:'retirada'},{title:'Receber em casa',value:'entrega'}]};
  const payload=montarMensagemMeta(phone,result,'atual');
  assert.equal(payload.interactive.type,'button');
  const id=payload.interactive.action.buttons[1].reply.id;
  assert.deepEqual(interpretarEscolha(id,{token:'atual',result}),{text:'entrega'});
  assert.equal(interpretarEscolha(id,{token:'outro',result}),null);
  assert.equal(interpretarEscolha('atual:option:90',{token:'atual',result}),null);
  const event=webhook([{...message,type:'interactive',interactive:{type:'button_reply',button_reply:{id,title:'confirmar'}}}]);
  assert.equal(mensagensMeta(event,'1234',phone)[0].choice,id);
  assert.equal(mensagensMeta(event,'1234',phone)[0].text,'');
});

test('cardápio é paginado sem omitir produtos e respeita limites da API', () => {
  const result={text:'Cardápio grande'.repeat(200),textoInterativo:'Escolha um produto.',opcoes:Array.from({length:19},(_,i)=>({title:i+' — '+ 'Produto longo '.repeat(4),value:String(i),description:'Descrição '.repeat(20)}))};
  const seen=[];
  for(let page=0;page<3;page++) {
    const payload=montarMensagemMeta(phone,result,'t',page);
    const rows=payload.interactive.action.sections[0].rows;
    assert.ok(rows.length<=10);
    assert.ok(payload.interactive.body.text.length<=1024);
    for(const row of rows) {
      assert.ok(Array.from(row.title).length<=24);
      if(row.description)assert.ok(Array.from(row.description).length<=72);
      const selected=interpretarEscolha(row.id,{token:'t',result});
      if(selected.text!==undefined)seen.push(Number(selected.text));
    }
  }
  assert.deepEqual(seen,Array.from({length:19},(_,i)=>i));
  assert.equal(interpretarEscolha('t:page:99',{token:'t',result}),null);
});

test('envio fica restrito ao cliente e nunca tenta outro provedor após timeout', async () => {
  let calls=0;
  const payload={to:phone,type:'text',text:{body:'Teste'},messaging_product:'whatsapp'};
  const fake=async(url,options)=>{
    calls++;assert.equal(url,'https://graph.facebook.com/v27.0/1234/messages');
    assert.equal(options.headers.Authorization,'Bearer token-teste');
    return new Response(JSON.stringify({messages:[{id:'wamid.out'}]}));
  };
  await enviarMeta(payload,env,fake);assert.equal(calls,1);
  await assert.rejects(()=>enviarMeta({...payload,to:'5515888887777'},env,fake));assert.equal(calls,1);
  await assert.rejects(()=>enviarMeta(payload,env,async()=>{throw new Error('timeout');}),e=>e.estado==='incerto');
  await assert.rejects(()=>enviarMeta(payload,env,async()=>new Response('{}',{status:400})),e=>e.estado==='falha');
  await assert.rejects(()=>enviarMeta(payload,env,async()=>new Response('{}',{status:500})),e=>e.estado==='incerto');
});

test('pedido completo por escolhas estruturadas só é criado após clicar em confirmar', async () => {
  let state=null, created=0;
  const services={telefone:phone,catalogo:async()=>[{id:7,nome:'Doce',preco:5,quantidade_disponivel:10}],salvar:async()=>{},criar:async()=>{created++;return{id:42,valor_total:10};}};
  const say=async text=>{const result=await responder(state,text,services);state=result.state;return result;};
  const click=async(result,value)=>{
    const index=result.opcoes.findIndex(o=>o.value===value);assert.ok(index>=0);
    return say(interpretarEscolha(`t:option:${index}`,{token:'t',result}).text);
  };
  let r=await say('oi');r=await click(r,'cardapio');
  assert.equal(montarMensagemMeta(phone,r,'t').interactive.type,'list');
  r=await click(r,'7');r=await say('2');r=await click(r,'fechar');r=await say('Cliente');
  assert.match(r.text,/Não aceitamos cartão ou dinheiro na entrega/);
  r=await click(r,'retirada');r=await click(r,'pix');
  assert.equal(created,0);r=await click(r,'confirmar');assert.equal(created,1);
  assert.equal(r.state.pedido.id,42);assert.match(r.text,/aguardando pagamento/);
});
