import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarRecebimento, textoRecebimento } from '../src/lib/recebimento';
import { montarMensagemPedido } from '../src/lib/mensagemWhats';
test('entrega exige Pix mesmo para dados fora da interface',()=>{assert.match(validarRecebimento({tipo:'entrega',pagamento:'dinheiro',endereco:'Rua Teste, 123'})!,/Pix/);assert.match(validarRecebimento({tipo:'entrega',pagamento:'cartao',endereco:'Rua Teste, 123'})!,/Pix/);});
test('entrega exige endereço e aceita Pix com endereço completo',()=>{assert.ok(validarRecebimento({tipo:'entrega',pagamento:'pix',endereco:'  '}));assert.equal(validarRecebimento({tipo:'entrega',pagamento:'pix',endereco:'Rua Teste, 123, Centro'}),null);});
test('retirada aceita Pix, dinheiro e cartão sem endereço',()=>{for(const pagamento of ['pix','dinheiro','cartao'] as const)assert.equal(validarRecebimento({tipo:'retirada',pagamento,endereco:''}),null);});
test('mensagem inclui escolhas, subtotal e confirmação sem prometer taxa',()=>{const p={id:1,nome:'Cone',descricao:'',preco:10,imagemUrl:null,categoria:null,ativo:true};const mensagem=montarMensagemPedido([{produto:p,quantidade:2}],'Maria','Sem granulado',{tipo:'entrega',pagamento:'pix',endereco:'Rua Teste, 123'});assert.match(mensagem,/2x Cone/);assert.match(mensagem,/Subtotal dos produtos/);assert.match(mensagem,/20,00/);assert.match(mensagem,/Nome: Maria/);assert.match(mensagem,/Endereço: Rua Teste, 123/);assert.match(mensagem,/Pagamento: Pix/);assert.match(mensagem,/sujeitos à confirmação/);});
test('retirada não transmite endereço anterior',()=>{assert.doesNotMatch(textoRecebimento({tipo:'retirada',pagamento:'cartao',endereco:'Endereço antigo'}),/Endereço antigo/);});
