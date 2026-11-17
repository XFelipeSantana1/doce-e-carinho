import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import express from 'express';
import jwt from 'jsonwebtoken';
import 'express-async-errors';

test('fluxo HTTP de pedidos com banco MySQL isolado', async t => {
 dotenv.config();
 const rootEnv=dotenv.parse(await readFile('../.env'));
 const db='doce_test_'+randomUUID().replaceAll('-','');
 const admin=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:'root',password:rootEnv.MYSQL_ROOT_PASSWORD,multipleStatements:true});
 let pool: mysql.Pool | undefined;
 let server: ReturnType<ReturnType<typeof express>['listen']> | undefined;
 try {
  await admin.query((await readFile('seed/schema.sql','utf8')).replaceAll('confeitaria_db',db));
  process.env.DB_NAME=db;process.env.DB_USER='root';process.env.DB_PASSWORD=rootEnv.MYSQL_ROOT_PASSWORD;
  process.env.JWT_SECRET='segredo-exclusivo-do-teste-integracao-123456';
  process.env.BOT_API_KEY='chave-exclusiva-de-teste-integracao';
  process.env.WAHA_URL=''; // Nenhuma mensagem é enviada por testes.
  process.env.ENTREGA_MODO='demonstracao';
  pool=(await import('../../src/config/db.js')).default;
  const pedidos=(await import('../../src/routes/pedidoRoutes.js')).default;
  const bot=(await import('../../src/routes/botRoutes.js')).default;
  const {validarApiKeyBot}=await import('../../src/middleware/apiKeyBot.js');
  const {cotarEntrega}=await import('../../src/services/entregaService.js');
  const app=express();app.use(express.json());app.use('/pedidos',pedidos);app.use('/bot',validarApiKeyBot,bot);
  app.use((err:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{console.error(err instanceof Error?err.message:'erro');res.status(500).json({erro:'Falha no teste'});});
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server!.once('listening',resolve));
  const address=server.address();assert.ok(address && typeof address!=='string');
  const base='http://127.0.0.1:'+address.port;
  const token=jwt.sign({id:1,email:'teste@example.invalid',cargo:'admin'},process.env.JWT_SECRET);
  await pool.query("INSERT INTO usuarios (id,nome,email,senha_hash,cargo) VALUES (1,'Teste','teste@example.invalid','teste','admin')");
  await pool.query("INSERT INTO produtos (id,nome,preco) VALUES (1,'Doce teste',5)");
  await pool.query("INSERT INTO insumos (id,nome,unidade_medida,quantidade_atual) VALUES (1,'Ingrediente teste','unidade',1000)");
  await pool.query('INSERT INTO produto_insumo (produto_id,insumo_id,quantidade_necessaria) VALUES (1,1,2)');
  const call=async(path:string,body?:unknown,method='POST',auth=true)=>{
   const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+token,'x-api-key':process.env.BOT_API_KEY!}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
   return {status:response.status,body:await response.json()};
  };
  const criar=async(tipo='retirada',forma='pix')=>{
   const cotacao=tipo==='entrega'?await cotarEntrega({whatsapp:'5515000000000',cidade:'Tietê',endereco:'Rua Teste, 123, Centro'}):null;
   return call('/bot/pedidos',{whatsapp:'5515000000000',nome_cliente:'Teste',tipo_recebimento:tipo,forma_pagamento:forma,itens:[{produto_id:1,quantidade:1}],cotacao_entrega:cotacao?.token,chave_idempotencia:randomUUID()});
  };
  const status=(id:number,atual:string,novo:string)=>call('/pedidos/'+id+'/status',{status:novo,status_atual:atual},'PATCH');
  const pagar=(id:number)=>call('/pedidos/'+id+'/pagamento',{status_pagamento:'pago'},'PATCH');
  const codigo=async(id:number)=>{const [rows]=await pool!.query<mysql.RowDataPacket[]>('SELECT codigo_entrega FROM pedidos WHERE id=?',[id]);return rows[0].codigo_entrega as string;};
  await t.test('consulta do bot vincula pedido ao cliente autorizado e não expõe código ou cadastro',async()=>{
   process.env.BOT_TEST_PHONE='5515000000000';
   const novo=await criar();assert.equal(novo.status,201);const id=novo.body.id;
   const own=await call('/bot/pedidos/'+id+'?whatsapp=5515000000000',undefined,'GET');
   assert.equal(own.status,200);
   assert.deepEqual(Object.keys(own.body).sort(),['id','status','status_pagamento','tipo_recebimento']);
   assert.equal((await call('/bot/pedidos/'+id+'?whatsapp=5515111111111',undefined,'GET')).status,403);
   assert.equal((await call('/bot/pedidos/'+id+'?whatsapp=5515000000000',undefined,'GET',false)).status,401);
   await pool!.query("INSERT INTO clientes (nome,whatsapp) VALUES ('Outro cliente','5515111111111')");
   const [other]=await pool!.query<mysql.RowDataPacket[]>("SELECT id FROM clientes WHERE whatsapp='5515111111111'");
   await pool!.query('UPDATE pedidos SET cliente_id=? WHERE id=?',[other[0].id,id]);
   assert.equal((await call('/bot/pedidos/'+id+'?whatsapp=5515000000000',undefined,'GET')).status,404);
  });
  await t.test('rotas exigem autenticação e entrega recusa dinheiro/cartão antes da cotação',async()=>{
   assert.equal((await call('/pedidos',undefined,'GET',false)).status,401);
   for(const forma of ['dinheiro','cartao']) assert.equal((await criar('entrega',forma)).status,400);
  });
  await t.test('mesma chave não duplica pedido ou baixa e preço divergente é recusado',async()=>{
   const chave=randomUUID();
   const body={whatsapp:'5515000000000',nome_cliente:'Teste',tipo_recebimento:'retirada',forma_pagamento:'pix',itens:[{produto_id:1,quantidade:1}],chave_idempotencia:chave,valor_produtos_confirmado:5};
   const primeiro=await call('/bot/pedidos',body);assert.equal(primeiro.status,201);
   const repetido=await call('/bot/pedidos',body);assert.equal(repetido.status,200);assert.equal(repetido.body.id,primeiro.body.id);
   const [movimentos]=await pool!.query<mysql.RowDataPacket[]>('SELECT COUNT(*) AS n FROM movimentacoes_estoque WHERE pedido_id=?',[primeiro.body.id]);assert.equal(Number(movimentos[0].n),1);
   const divergente=await call('/bot/pedidos',{...body,chave_idempotencia:randomUUID(),valor_produtos_confirmado:4});assert.equal(divergente.status,409);
  });
  await t.test('soma consumo de ingrediente compartilhado e desfaz pedido sem estoque suficiente',async()=>{
   await pool!.query("INSERT INTO produtos (id,nome,preco) VALUES (2,'Outro doce teste',6)");
   await pool!.query('INSERT INTO produto_insumo (produto_id,insumo_id,quantidade_necessaria) VALUES (2,1,2)');
   const [antes]=await pool!.query<mysql.RowDataPacket[]>('SELECT quantidade_atual FROM insumos WHERE id=1');
   await pool!.query('UPDATE insumos SET quantidade_atual=3 WHERE id=1');
   try {
    const r=await call('/bot/pedidos',{whatsapp:'5515000000000',tipo_recebimento:'retirada',forma_pagamento:'pix',itens:[{produto_id:1,quantidade:1},{produto_id:2,quantidade:1}],chave_idempotencia:randomUUID()});assert.equal(r.status,409);assert.match(r.body.erro,/Estoque insuficiente/);
    const [saldo]=await pool!.query<mysql.RowDataPacket[]>('SELECT quantidade_atual FROM insumos WHERE id=1');assert.equal(Number(saldo[0].quantidade_atual),3);
   } finally {await pool!.query('UPDATE insumos SET quantidade_atual=? WHERE id=1',[antes[0].quantidade_atual]);}
  });
  await t.test('retirada: pagamento bloqueia preparo, código incorreto não conclui, correto é consumido',async()=>{
   const novo=await criar('retirada','dinheiro');assert.equal(novo.status,201);const id=novo.body.id;
   assert.equal((await status(id,'pendente','em_preparo')).status,409);
   assert.equal((await pagar(id)).status,200);
   assert.equal((await status(id,'pendente','pronto')).status,409);
   assert.equal((await status(id,'pendente','em_preparo')).status,200);
   assert.equal((await status(id,'pendente','pronto')).status,409);
   assert.equal((await status(id,'em_preparo','cancelado')).status,409);
   assert.equal((await call('/pedidos/'+id+'/pagamento',{status_pagamento:'pendente'},'PATCH')).status,409);
   assert.equal((await status(id,'em_preparo','pronto')).status,200);
   const code=await codigo(id);assert.match(code,/^\d{4}$/);
   const detalhe=await call('/pedidos/'+id,undefined,'GET');assert.equal(detalhe.body.codigo_entrega,undefined);
   assert.equal((await status(id,'pronto','entregue')).status,409);
   assert.equal((await call('/pedidos/'+id+'/entregar',{codigo:'0000'},'PATCH')).status,409);
   assert.equal((await call('/pedidos/'+id+'/entregar',{codigo:code},'PATCH')).status,200);
   assert.equal(await codigo(id),null);
   assert.equal((await call('/pedidos/'+id+'/entregar',{codigo:code},'PATCH')).status,409);
  });
  await t.test('solicitação do cliente bloqueia preparo; gestão pode manter ou cancelar',async()=>{
   const novo=await criar();const id=novo.body.id;await pagar(id);
   assert.equal((await call('/bot/pedidos/'+id+'/cancelamento',{whatsapp:'5515111111111'})).status,404);
   assert.equal((await call('/bot/pedidos/'+id+'/cancelamento',{whatsapp:'5515000000000'})).status,200);
   assert.equal((await status(id,'pendente','em_preparo')).status,409);
   assert.equal((await call('/pedidos/'+id+'/manter',{},'PATCH')).status,200);
   assert.equal((await status(id,'pendente','em_preparo')).status,200);
   assert.equal((await call('/bot/pedidos/'+id+'/cancelamento',{whatsapp:'5515000000000'})).status,409);
   const [saldoAntes] = await pool!.query<mysql.RowDataPacket[]>('SELECT quantidade_atual FROM insumos WHERE id=1');
   const outro=await criar();await pagar(outro.body.id);
   assert.equal((await status(outro.body.id,'pendente','cancelado')).status,200);
   const [saldoDepois] = await pool!.query<mysql.RowDataPacket[]>('SELECT quantidade_atual FROM insumos WHERE id=1');
   assert.equal(Number(saldoDepois[0].quantidade_atual),Number(saldoAntes[0].quantidade_atual));
   const detalhe=await call('/pedidos/'+outro.body.id,undefined,'GET');assert.equal(detalhe.body.status_pagamento,'pago');
   assert.equal((await call('/pedidos/'+outro.body.id+'/pagamento',{status_pagamento:'estornado'},'PATCH')).status,200);
  });
  await t.test('cancelamento e início concorrentes não são aceitos juntos',async()=>{
   const novo=await criar();const id=novo.body.id;await pagar(id);
   const [cancelamento,inicio]=await Promise.all([call('/bot/pedidos/'+id+'/cancelamento',{whatsapp:'5515000000000'}),status(id,'pendente','em_preparo')]);
   assert.deepEqual([cancelamento.status,inicio.status].sort(),[200,409]);
  });
  await t.test('entrega: código existe em pronto, exige saída e bloqueia tentativas repetidas',async()=>{
   const novo=await criar('entrega');assert.equal(novo.status,201);const id=novo.body.id;
   await pagar(id);await status(id,'pendente','em_preparo');await status(id,'em_preparo','pronto');const code=await codigo(id);
   assert.equal((await call('/pedidos/'+id+'/entregar',{codigo:code},'PATCH')).status,409);
   assert.equal((await status(id,'pronto','saiu_para_entrega')).status,200);
   for(let i=0;i<5;i++) assert.equal((await call('/pedidos/'+id+'/entregar',{codigo:'0000'},'PATCH')).status,409);
   assert.equal((await call('/pedidos/'+id+'/entregar',{codigo:code},'PATCH')).status,429);
   await pool!.query('UPDATE pedidos SET codigo_bloqueado_ate=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE id=?',[id]);
   assert.equal((await call('/pedidos/'+id+'/entregar',{codigo:code},'PATCH')).status,200);
  });
 } finally {
  if(server) await new Promise<void>((resolve,reject)=>server!.close(error=>error?reject(error):resolve()));
  if(pool) await pool.end();
  await admin.query('DROP DATABASE IF EXISTS '+db);await admin.end();
 }
});
