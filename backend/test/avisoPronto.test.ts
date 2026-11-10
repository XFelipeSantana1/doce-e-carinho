import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executarAvisoPronto, FalhaAviso, type DependenciasAviso, type EstadoAviso } from '../src/services/avisoPronto.js';
function preparar(enviar: DependenciasAviso['enviar']) {
  let estado: EstadoAviso = 'pendente';
  const deps: DependenciasAviso = {
    obter: async () => ({ whatsapp: '5515000000000', aviso_pronto_estado: estado }),
    reservar: async () => { if (estado !== 'pendente') return false; estado = 'enviando'; return true; },
    registrar: async (_id, novo) => { estado = novo; },
    enviar,
  };
  return { deps, estado: () => estado };
}
test('mudanças concorrentes e chamadas repetidas enviam um único aviso', async () => {
  let envios = 0;
  const { deps, estado } = preparar(async (telefone, mensagem) => {
    envios++; assert.equal(telefone, '5515000000000'); assert.match(mensagem, /pedido #42 está pronto para retirada/);
  });
  await Promise.all([executarAvisoPronto(42, deps), executarAvisoPronto(42, deps)]);
  await executarAvisoPronto(42, deps);
  assert.equal(envios, 1); assert.equal(estado(), 'enviado');
});
test('timeout fica incerto e não causa reenvio automático', async () => {
  let envios = 0;
  const { deps, estado } = preparar(async () => { envios++; throw new Error('timeout'); });
  assert.equal((await executarAvisoPronto(42, deps)).estado, 'incerto');
  await executarAvisoPronto(42, deps);
  assert.equal(envios, 1); assert.equal(estado(), 'incerto');
});
test('falha definitiva e destinatário bloqueado permanecem visíveis', async () => {
  for (const falha of ['falha', 'bloqueado'] as const) {
    const { deps, estado } = preparar(async () => { throw new FalhaAviso(falha); });
    assert.equal((await executarAvisoPronto(42, deps)).estado, falha); assert.equal(estado(), falha);
  }
});
test('pedidos antigos sem aviso pendente não geram mensagens retroativas', async () => {
  let envios = 0;
  const { deps } = preparar(async () => { envios++; });
  deps.obter = async () => ({ whatsapp: '5515000000000', aviso_pronto_estado: null });
  assert.equal((await executarAvisoPronto(42, deps)).estado, null); assert.equal(envios, 0);
});
