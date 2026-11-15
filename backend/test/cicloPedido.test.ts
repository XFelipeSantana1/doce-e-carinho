import { test } from 'node:test';
import assert from 'node:assert/strict';
import { podeMudar, motivoBloqueioPagamento, pagamentoPermitido } from '../src/lib/cicloPedido.js';
test('pagamento confirmado é obrigatório para preparo e conclusão em todas as formas', () => {
 for (const forma of ['pix','cartao','dinheiro',null]) for (const destino of ['em_preparo','pronto','saiu_para_entrega','entregue']) {
  assert.ok(motivoBloqueioPagamento(destino,forma,'pendente'));
  assert.ok(motivoBloqueioPagamento(destino,forma,'estornado'));
  assert.equal(motivoBloqueioPagamento(destino,forma,'pago'),null);
 }
});
test('não pula preparo, não cancela após começar e não reabre estados finais', () => {
 assert.equal(podeMudar('pendente','pronto'),false);
 assert.equal(podeMudar('pendente','cancelado'),true);
 for (const estado of ['em_preparo','pronto','saiu_para_entrega','entregue','cancelado']) assert.equal(podeMudar(estado,'cancelado'),false);
 assert.equal(podeMudar('entregue','pronto'),false);
});
test('entrega aceita somente Pix e retirada aceita Pix, dinheiro e cartão', () => {
 for (const forma of ['pix','cartao','dinheiro']) assert.equal(pagamentoPermitido('retirada',forma),true);
 assert.equal(pagamentoPermitido('entrega','pix'),true);
 for (const forma of ['cartao','dinheiro','outro',null,undefined]) assert.equal(pagamentoPermitido('entrega',forma),false);
});
