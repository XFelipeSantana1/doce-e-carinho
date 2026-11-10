import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarDataApi } from '../src/lib/dataApi';
import { pedidosDoPeriodo } from '../src/lib/periodo';
import type { Pedido } from '../src/types';
test('data ISO da API mantém o instante e nunca recebe um segundo Z',()=>{
  assert.equal(normalizarDataApi('2026-11-01T21:05:21Z'),'2026-11-01T21:05:21.000Z');
  assert.equal(normalizarDataApi('2026-11-01T18:05:21-03:00'),'2026-11-01T21:05:21.000Z');
  assert.equal(normalizarDataApi('2026-11-01T21:05:21.123Z'),'2026-11-01T21:05:21.123Z');
  assert.equal(normalizarDataApi(null),'');
});
test('Hoje inclui pedidos de hoje e exclui o último segundo de ontem',()=>{
  const agora=new Date(2026,10,1,18,0,0);
  const pedido=(id:number,data:Date)=>({id,criado_em:normalizarDataApi(data.toISOString())} as Pedido);
  const hoje=pedidosDoPeriodo([
    pedido(1,new Date(2026,9,31,23,59,59)),
    pedido(2,new Date(2026,10,1,0,0,0)),
    pedido(3,new Date(2026,10,1,18,0,0)),
  ],'hoje',agora);
  assert.deepEqual(hoje.map(p=>p.id),[2,3]);
});
test('formato SQL legado mantém o horário local, inclusive milissegundos',()=>{
  const data=new Date(normalizarDataApi('2026-11-01 18:05:21.123'));
  assert.equal(data.getHours(),18);assert.equal(data.getMilliseconds(),123);
});
