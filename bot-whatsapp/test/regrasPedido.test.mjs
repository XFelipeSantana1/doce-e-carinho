import {test} from 'node:test';
import assert from 'node:assert/strict';
import {responder} from '../src/conversa.mjs';
const base={etapa:'pagamento',tipo:'entrega',nome:'Cliente',itens:[{id:1,nome:'Doce',preco:5,quantidade:1}],cotacao:{taxa_entrega:1,endereco:'Rua Teste, 1',token:'teste'}};
const services={catalogo:async()=>[{id:1,nome:'Doce',preco:5}]};
test('bot não oferece nem aceita cartão ou dinheiro na entrega',async()=>{
 for(const valor of ['2','3','cartao','dinheiro']) {
  const result=await responder(base,valor,services);
  assert.equal(result.state.etapa,'pagamento');assert.equal(result.state.pagamento,undefined);
  assert.match(result.text,/somente por Pix/);assert.doesNotMatch(result.text,/2 — Cartão|3 — Dinheiro/);
 }
 assert.equal((await responder(base,'pix',services)).state.etapa,'confirmar');
});
test('retirada mantém cartão e dinheiro como opções',async()=>{
 for(const valor of ['cartao','dinheiro']) assert.equal((await responder({...base,tipo:'retirada'},valor,services)).state.pagamento,valor);
});
test('cancelar pedido confirmado solicita à loja sem apagar a referência do pedido',async()=>{
 let chamado;
 const state={etapa:'concluido',itens:[],pedido:{id:42}};
 const result=await responder(state,'cancelar',{cancelar:async id=>{chamado=id;}});
 assert.equal(chamado,42);assert.equal(result.state.pedido.id,42);assert.match(result.text,/preparo está bloqueado/);
});
test('cancelamento por número funciona após reiniciar conversa e informa recusa após preparo',async()=>{
 const result=await responder(null,'CANCELAR PEDIDO #42',{cancelar:async id=>{assert.equal(id,42);throw {publicMessage:'O pedido já entrou em preparo. Fale com a loja.'};}});
 assert.match(result.text,/já entrou em preparo/);
});
