import {test} from 'node:test';
import assert from 'node:assert/strict';
import {responder} from '../src/conversa.mjs';
const produtos=[{id:3,nome:'Cone brigadeiro gourmet',preco:'12.50'}];
test('cardápio informa quantidade atual, esgotados e produtos sem ficha sem inventar estoque',async()=>{
 const services={catalogo:async()=>[
  {...produtos[0],quantidade_disponivel:'3'},
  {id:4,nome:'Trufa',preco:6,quantidade_disponivel:0},
  {id:5,nome:'Especial',preco:10,quantidade_disponivel:null},
 ]};
 const result=await responder({etapa:'concluido',itens:[],pedido:{id:1}},'estoque',services);
 assert.match(result.text,/3 unidades disponíveis/);assert.match(result.text,/esgotado/);assert.match(result.text,/quantidade sob consulta/);
 assert.equal(result.state.etapa,'concluido');
});
test('quantidade é conferida novamente ao adicionar e considera unidades já na sacola',async()=>{
 let quantidade=3;const services={catalogo:async()=>[{...produtos[0],quantidade_disponivel:quantidade}]};
 let {state}=await responder(null,'cardapio',services);
 ({state}=await responder(state,'3',services));
 const tooMany=await responder(state,'4',services);assert.equal(tooMany.state.itens.length,0);assert.match(tooMany.text,/3 unidades/);
 ({state}=await responder(state,'2',services));({state}=await responder(state,'3',services));
 const combined=await responder(state,'2',services);assert.equal(combined.state.itens[0].quantidade,2);
 quantidade=0;const soldOut=await responder(state,'1',services);assert.equal(soldOut.state.etapa,'produto');assert.equal(soldOut.state.itens[0].quantidade,2);
});
test('conversa só registra após confirmação explícita e reutiliza chave após timeout',async()=>{
 let state=null, calls=0; const keys=[];
 const services={telefone:'5515000000000',catalogo:async()=>produtos,salvar:async s=>{state=s;},criar:async body=>{calls++;keys.push(body.chave_idempotencia);if(calls===1)throw new Error('timeout');return {id:42,valor_total:25};}};
 const say=async text=>{const result=await responder(state,text,services);state=result.state;return result;};
 await say('oi');await say('1');await say('3');await say('2');await say('fechar');await say('Cliente teste');await say('1');await say('pix');
 assert.equal(calls,0);assert.equal(state.etapa,'confirmar');
 await say('confirmar');assert.equal(state.etapa,'incerto');
 await say('cancelar');assert.equal(state.etapa,'incerto');
 await say('confirmar');assert.equal(state.etapa,'concluido');assert.equal(keys[0],keys[1]);
 await say('confirmar');assert.equal(calls,2);
});
test('entrega confirma endereço e total antes de registrar o pedido',async()=>{
 let state=null,criado;
 const services={telefone:'5515000000000',catalogo:async()=>produtos,salvar:async()=>{},cotar:async dados=>{
  assert.equal(dados.cidade,'Cerquilho');return {token:'cotacao-assinada',endereco:'Rua Exemplo, 123, Cerquilho',taxa_entrega:11.8,distancia_metros:6000};
 },criar:async body=>{criado=body;return {id:10,valor_total:24.3};}};
 const say=async text=>{const result=await responder(state,text,services);state=result.state;return result;};
 await say('1');await say('3');await say('1');await say('fechar');await say('Cliente');await say('2');
 await say('Sorocaba');assert.equal(state.etapa,'cidade');await say('3');await say('Rua Exemplo, 123, Centro');
 const quote=await say('sem');assert.equal(state.etapa,'validar_endereco');assert.match(quote.text,/11,80/);assert.equal(criado,undefined);
 await say('1');const resumo=await say('pix');assert.match(resumo.text,/24,30/);assert.equal(criado,undefined);
 await say('confirmar');assert.equal(criado.tipo_recebimento,'entrega');assert.equal(criado.cotacao_entrega,'cotacao-assinada');
 assert.equal(state.etapa,'concluido');
});
test('mapas indisponíveis permitem retirada sem confirmar entrega ou inventar taxa',async()=>{
 const state={etapa:'complemento',cidade:'Tietê',endereco:'Rua Exemplo, 123',itens:[],tipo:'entrega'};
 const result=await responder(state,'sem',{telefone:'5515000000000',cotar:async()=>{throw new Error('Sem serviço');}});
 assert.equal(result.state.etapa,'entrega_indisponivel');assert.equal(result.state.cotacao,undefined);
 const retirada=await responder(result.state,'1',{});assert.equal(retirada.state.tipo,'retirada');assert.equal(retirada.state.etapa,'pagamento');
});
test('cotação compacta mostra taxa e total sem atribuir distância fictícia ao endereço',async()=>{
  const state={etapa:'complemento',tipo:'entrega',cidade:'Tietê',endereco:'Rua Exemplo, 123',itens:[{id:3,nome:'Cone',preco:12.5,quantidade:1}]};
  const services={telefone:'5515000000000',catalogo:async()=>produtos,cotar:async()=>({simulada:true,token:'demo',endereco:'Rua Exemplo, 123, Tietê',distancia_metros:3000,taxa_entrega:9.5})};
  const quote=await responder(state,'sem',services);assert.match(quote.text,/9,50/);assert.doesNotMatch(quote.text,/simulad|demonstra|Google Maps|\bkm\b/i);
  const accepted=await responder(quote.state,'1',services);
  const summary=await responder(accepted.state,'pix',services);assert.doesNotMatch(summary.text,/simulad|demonstra/i);assert.match(summary.text,/22,00/);
});
test('quantidade inválida não adiciona itens e atendimento humano pausa respostas',async()=>{
 const services={catalogo:async()=>produtos};
 let {state}=await responder(null,'1',services);({state}=await responder(state,'3',services));
 const invalid=await responder(state,'-2',services);assert.equal(invalid.state.itens.length,0);assert.equal(invalid.state.etapa,'quantidade');
 const human=await responder(state,'atendente',services);assert.equal(human.state.etapa,'humano');assert.equal((await responder(human.state,'oi',services)).text,null);
});
test('pedido da vitrine usa preços da API e observações vão para atendimento humano',async()=>{
 const services={catalogo:async()=>produtos};
 const text='Olá! Quero fazer um pedido\n• 2x Cone brigadeiro gourmet — R$ 0,01\nTotal: R$ 0,01';
 const result=await responder(null,text,services);assert.equal(result.state.itens[0].preco,12.5);
 const custom=await responder(null,text+'\nObs: sem granulado',services);assert.equal(custom.state.etapa,'humano');
});
