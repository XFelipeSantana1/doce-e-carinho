import pool from "../config/db.js";
import { randomInt } from "node:crypto";
import { Request, Response } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { ehFinal, motivoBloqueioPagamento, pagamentoPermitido, podeMudar, rotulo, STATUS_VALIDOS } from "../lib/cicloPedido.js";
import { registrar } from "../services/registroService.js";
import type { RequisicaoAutenticada } from "../middleware/auth.js";
import { notificarStatusPedido } from '../services/avisoPronto.js';
import { validarCotacao, ErroEntrega, type CotacaoEntrega } from '../services/entregaService.js';

class ErroNegocio extends Error {}

/** Consulta mínima do cliente do bot: nunca expõe código, endereço ou outros clientes. */
export async function consultarViaBot(req: Request, res: Response) {
  const id = Number(req.params.id);
  const whatsapp = req.query.whatsapp;
  if (!Number.isSafeInteger(id) || id <= 0 || typeof whatsapp !== 'string' || !/^\d{10,15}$/.test(whatsapp)) {
    return res.status(400).json({ erro: 'Informe o pedido e o telefone.' });
  }
  if (!process.env.BOT_TEST_PHONE || whatsapp !== process.env.BOT_TEST_PHONE) {
    return res.status(403).json({ erro: 'Consulta restrita ao cliente de teste.' });
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT p.id,p.status,p.status_pagamento,p.tipo_recebimento
     FROM pedidos p JOIN clientes c ON c.id=p.cliente_id WHERE p.id=? AND c.whatsapp=?`, [id,whatsapp]);
  if (!rows[0]) return res.status(404).json({ erro: 'Pedido não encontrado para este telefone.' });
  return res.json(rows[0]);
}

/** Produto lendo preço e nome na mesma consulta do pedido. */
interface LinhaProduto extends RowDataPacket {
  id: number;
  nome: string;
  preco: number;
}

interface LinhaReceita extends RowDataPacket {
  insumo_id: number;
  quantidade_necessaria: number;
}

interface LinhaEstoque extends RowDataPacket {
  quantidade_atual: number;
}

interface LinhaStatus extends RowDataPacket {
  status: string;
  status_pagamento: string;
  forma_pagamento: string | null;
  tipo_recebimento: string;
  codigo_entrega: string | null;
  cancelamento_solicitado_em: Date | null;
  codigo_tentativas: number;
  codigo_bloqueado_ate: Date | null;
}

/** Soma por insumo no estorno: volta string (SUM de DECIMAL), Number() no uso. */
interface LinhaUso extends RowDataPacket {
  insumo_id: number;
  quantidade: number | string;
}

/** Item já validado, na forma em que entra no INSERT. */
interface ItemPronto {
  produto_id: number;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
}

// GET /api/pedidos?status=pendente -> painel
export async function listar(req: Request, res: Response) {
  // ?status=x&status=y chega como array. Fica só o primeiro valor, e só se for
  // texto: passar o array inteiro ao driver gerava SQL que ninguém revisou.
  const bruto = req.query.status;
  const status = Array.isArray(bruto) ? bruto[0] : bruto;

  let sql = `
    SELECT pe.*, c.nome AS cliente_nome, c.whatsapp,
      (SELECT a.estado FROM avisos_pedido a WHERE a.pedido_id=pe.id AND a.status=pe.status) AS aviso_status_estado,
      (SELECT a.estado FROM avisos_pedido a WHERE a.pedido_id=pe.id AND a.status='pagamento_confirmado') AS aviso_pagamento_estado
    FROM pedidos pe
    JOIN clientes c ON c.id = pe.cliente_id
  `;
  const params: (string | number)[] = [];

  if (typeof status === "string" && status !== "") {
    sql += " WHERE pe.status = ?";
    params.push(status);
  }
  sql += " ORDER BY pe.criado_em DESC";

  const [rows] = await pool.query(sql, params);
  res.json((rows as RowDataPacket[]).map(({ codigo_entrega: _codigo, codigo_tentativas: _tentativas, codigo_bloqueado_ate: _bloqueio, ...pedido }) => pedido));
}

export async function buscarPorId(req: Request, res: Response) {
  const id = Number(req.params.id);

  const [pedidoRows] = await pool.query<RowDataPacket[]>(
    `SELECT pe.*, c.nome AS cliente_nome, c.whatsapp,
      (SELECT a.estado FROM avisos_pedido a WHERE a.pedido_id=pe.id AND a.status=pe.status) AS aviso_status_estado,
      (SELECT a.estado FROM avisos_pedido a WHERE a.pedido_id=pe.id AND a.status='pagamento_confirmado') AS aviso_pagamento_estado
     FROM pedidos pe JOIN clientes c ON c.id = pe.cliente_id
     WHERE pe.id = ?`,
    [id]
  );
  if (!pedidoRows[0]) return res.status(404).json({ erro: "Pedido não encontrado." });

  const [itens] = await pool.query(
    `SELECT ip.*, p.nome AS produto_nome
     FROM itens_pedido ip JOIN produtos p ON p.id = ip.produto_id
     WHERE ip.pedido_id = ?`,
    [id]
  );

  const { codigo_entrega: _codigo, codigo_tentativas: _tentativas, codigo_bloqueado_ate: _bloqueio, ...pedido } = pedidoRows[0];
  res.json({ ...pedido, itens });
}

// POST /api/bot/pedidos - chamado pelo bot (menu fixo, Nível 2)
// Body: { whatsapp, nome_cliente, forma_pagamento, itens: [{ produto_id, quantidade }] }
//
// Tudo roda em UMA transação: só confirma o pedido se houver estoque
// suficiente de TODOS os insumos envolvidos - é isso que impede o
// "furo de estoque" mesmo com pedidos simultâneos.
export async function criarViaBot(req: Request, res: Response) {
  const { whatsapp, nome_cliente, forma_pagamento, itens, chave_idempotencia } = req.body;
  if (chave_idempotencia !== undefined && (typeof chave_idempotencia !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(chave_idempotencia))) {
    return res.status(400).json({ erro: 'Chave de confirmação inválida.' });
  }
  if (chave_idempotencia) {
    const [existentes] = await pool.query<RowDataPacket[]>(
      'SELECT id, valor_total, status FROM pedidos WHERE chave_bot = ? AND cliente_id IN (SELECT id FROM clientes WHERE whatsapp = ?)',
      [chave_idempotencia, whatsapp],
    );
    if (existentes[0]) return res.status(200).json(existentes[0]);
  }

  if (!whatsapp || !Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ erro: "whatsapp e itens são obrigatórios." });
  }
  const tipoRecebimento = req.body.tipo_recebimento ?? 'retirada';
  if (!['retirada', 'entrega'].includes(tipoRecebimento)) return res.status(400).json({ erro: 'Escolha retirada ou entrega.' });
  if (!pagamentoPermitido(tipoRecebimento, forma_pagamento)) {
    return res.status(400).json({ erro: tipoRecebimento === 'entrega'
      ? 'Entrega em domicílio aceita somente Pix, confirmado antes do preparo.'
      : 'Escolha Pix, cartão ou dinheiro para retirada.' });
  }
  let entrega: CotacaoEntrega | null = null;
  if (tipoRecebimento === 'entrega') {
    try { entrega = validarCotacao(req.body.cotacao_entrega, whatsapp); }
    catch (error) { return res.status(409).json({ erro: error instanceof ErroEntrega ? error.message : 'Cotação inválida.' }); }
  }

  // Validação dura de cada item ANTES de abrir a transação: sem ela,
  // quantidade 0 criava pedido vazio e quantidade negativa AUMENTAVA o
  // estoque (a baixa subtrai o valor, e menos com menos dá mais).
  const itensNormalizados = itens.map((item) => ({
    produto_id: Number(item?.produto_id),
    quantidade: Number(item?.quantidade),
  }));
  const itemInvalido = itensNormalizados.some(
    (item) =>
      !Number.isInteger(item.produto_id) ||
      item.produto_id <= 0 ||
      !Number.isInteger(item.quantidade) ||
      item.quantidade <= 0,
  );
  if (itemInvalido) {
    return res.status(400).json({
      erro: "Cada item precisa de produto_id e quantidade inteira maior que zero.",
    });
  }

  const conexao = await pool.getConnection();
  try {
    await conexao.beginTransaction();

    // 1. Garante que o cliente existe.
    // INSERT ... ON DUPLICATE KEY UPDATE + LAST_INSERT_ID: dois pedidos do
    // mesmo whatsapp novo, ao mesmo tempo, não podem colidir no
    // índice único (viraria 500). O SELECT seguido de INSERT tinha essa
    // corrida; aqui o próprio banco resolve e devolve o id.
    const [resultado] = await conexao.query<ResultSetHeader>(
      `INSERT INTO clientes (nome, whatsapp) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
      [nome_cliente || null, whatsapp]
    );
    const clienteId = resultado.insertId;

    // 2. Para cada item: busca preço + ficha técnica, e TRAVA a linha
    //    do insumo (FOR UPDATE) para evitar corrida entre pedidos
    //    simultâneos disputando o mesmo insumo escasso.
    let valorTotal = 0;
    const itensParaInserir: ItemPronto[] = [];
    const baixasDeEstoque: { insumo_id: number; quantidade: number }[] = [];
    const reservadoNoPedido = new Map<number, number>();

    for (const item of itensNormalizados) {
      const [produtoRows] = await conexao.query<LinhaProduto[]>(
        "SELECT id, nome, preco FROM produtos WHERE id = ? AND ativo = TRUE",
        [item.produto_id]
      );
      const produto = produtoRows[0];
      if (!produto) {
        throw new ErroNegocio(`Produto ${item.produto_id} não encontrado ou inativo.`);
      }

      const subtotal = produto.preco * item.quantidade;
      valorTotal += subtotal;
      itensParaInserir.push({
        produto_id: produto.id,
        quantidade: item.quantidade,
        preco_unitario: produto.preco,
        subtotal,
      });

      const [receita] = await conexao.query<LinhaReceita[]>(
        "SELECT insumo_id, quantidade_necessaria FROM produto_insumo WHERE produto_id = ?",
        [produto.id]
      );

      for (const ingrediente of receita) {
        const necessario = ingrediente.quantidade_necessaria * item.quantidade;

        const [insumoRows] = await conexao.query<LinhaEstoque[]>(
          "SELECT quantidade_atual FROM insumos WHERE id = ? FOR UPDATE",
          [ingrediente.insumo_id]
        );
        const disponivel = insumoRows[0]?.quantidade_atual ?? 0;

        const acumulado = (reservadoNoPedido.get(ingrediente.insumo_id) ?? 0) + necessario;
        if (disponivel < acumulado) {
          throw new ErroNegocio(`Estoque insuficiente para o produto "${produto.nome}".`);
        }

        reservadoNoPedido.set(ingrediente.insumo_id, acumulado);
        baixasDeEstoque.push({ insumo_id: ingrediente.insumo_id, quantidade: necessario });
      }
    }

    if (req.body.valor_produtos_confirmado !== undefined &&
        Math.round(Number(req.body.valor_produtos_confirmado) * 100) !== Math.round(valorTotal * 100)) {
      throw new ErroNegocio('Os preços dos produtos mudaram. Confira o resumo novamente antes de confirmar.');
    }
    valorTotal = Math.round((valorTotal + (entrega?.taxa_entrega ?? 0)) * 100) / 100;

    // 3. Cria o pedido (forma de pagamento validada: é enum no banco,
    // então string arbitrária viraria 500 do MySQL em vez de 400).
    const formasValidas = ["pix", "cartao", "dinheiro", "outro"];
    if (forma_pagamento !== undefined && forma_pagamento !== null && !formasValidas.includes(forma_pagamento)) {
      await conexao.rollback();
      return res.status(400).json({ erro: "Forma de pagamento inválida. Use: pix, cartao, dinheiro ou outro." });
    }
    const [pedidoResult] = await conexao.query<ResultSetHeader>(
      `INSERT INTO pedidos (cliente_id, status, forma_pagamento, valor_total, origem, chave_bot,
        tipo_recebimento, entrega_cidade, entrega_endereco, entrega_complemento, taxa_entrega, entrega_distancia_metros, entrega_simulada)
       VALUES (?, 'pendente', ?, ?, 'whatsapp', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [clienteId, forma_pagamento || null, valorTotal, chave_idempotencia || null,
        tipoRecebimento, entrega?.cidade ?? null, entrega?.endereco ?? null, entrega?.complemento ?? null,
        entrega?.taxa_entrega ?? 0, entrega?.distancia_metros ?? null, entrega?.simulada ? 1 : 0]
    );
    const pedidoId = pedidoResult.insertId;

    // 4. Insere os itens
    for (const item of itensParaInserir) {
      await conexao.query(
        `INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario, subtotal)
         VALUES (?, ?, ?, ?, ?)`,
        [pedidoId, item.produto_id, item.quantidade, item.preco_unitario, item.subtotal]
      );
    }

    // 5. Debita estoque e registra a movimentação (auditoria)
    for (const baixa of baixasDeEstoque) {
      await conexao.query(
        "UPDATE insumos SET quantidade_atual = quantidade_atual - ? WHERE id = ?",
        [baixa.quantidade, baixa.insumo_id]
      );
      await conexao.query(
        `INSERT INTO movimentacoes_estoque (insumo_id, tipo, quantidade, pedido_id, observacao)
         VALUES (?, 'saida', ?, ?, 'Baixa automática por venda')`,
        [baixa.insumo_id, baixa.quantidade, pedidoId]
      );
    }

    await conexao.commit();
    res.status(201).json({ id: pedidoId, valor_total: valorTotal, status: "pendente" });
  } catch (err) {
    await conexao.rollback();
    if (err instanceof ErroNegocio) {
      return res.status(409).json({ erro: err.message });
    }
    throw err;
  } finally {
    conexao.release();
  }
}

// PATCH /api/pedidos/:id/status -> painel
// Regras: cancelado é estado final (não sai de lá) e cancelar ESTORNA o
// estoque debitado na venda (baixa reversa auditada). Sem isso, cancelar
// sumia com o pedido e o insumo ficava debitado para sempre.
//
// Pix não confirmado trava em_preparo/pronto/saiu_para_entrega (lib/cicloPedido).
// Ao entrar em "pronto" o pedido ganha um código de 4 dígitos: é o que o
// cliente apresenta na retirada (ou repassa ao motoboy) e o gestor digita
// no painel para concluir — sem código, não há baixa (ver confirmarEntrega).
// Concluir por este endpoint está BLOQUEADO: só o código entrega.

/** O código é validado junto do ID do pedido; não precisa ser globalmente único. */
function gerarCodigoEntrega(): string { return String(randomInt(1000, 10000)); }

export async function atualizarStatus(req: RequisicaoAutenticada, res: Response) {
  const id = Number(req.params.id);
  const { status } = req.body;

  if (!STATUS_VALIDOS.includes(status)) {
    return res.status(400).json({ erro: "Status inválido." });
  }

  const conexao = await pool.getConnection();
  try {
    await conexao.beginTransaction();

    const [pedidoRows] = await conexao.query<LinhaStatus[]>(
      "SELECT status, status_pagamento, forma_pagamento, tipo_recebimento, codigo_entrega, cancelamento_solicitado_em, codigo_tentativas, codigo_bloqueado_ate FROM pedidos WHERE id = ? FOR UPDATE",
      [id]
    );
    if (!pedidoRows[0]) {
      await conexao.rollback();
      return res.status(404).json({ erro: "Pedido não encontrado." });
    }
    const statusAnterior = pedidoRows[0].status;

    if (statusAnterior === status) {
      await conexao.rollback();
      return res.json({ id, status, notificacao_whatsapp: await notificarStatusPedido(id, status) });
    }

    if (req.body.status_atual !== statusAnterior) {
      await conexao.rollback();
      return res.status(409).json({ erro: 'O pedido mudou em outra tela. Atualize antes de confirmar a etapa.' });
    }
    if (status !== 'cancelado' && pedidoRows[0].cancelamento_solicitado_em) {
      await conexao.rollback();
      return res.status(409).json({ erro: 'Há uma solicitação de cancelamento. Resolva com o cliente antes de iniciar o preparo.' });
    }
    if (status !== 'cancelado' && pedidoRows[0].tipo_recebimento === 'entrega' && pedidoRows[0].forma_pagamento !== 'pix') {
      await conexao.rollback();
      return res.status(409).json({ erro: 'Entrega em domicílio exige pagamento por Pix. Este pedido precisa ser revisto pela gestão.' });
    }

    // A regra mora na API (lib/cicloPedido): a tela esconder o botão não
    // impede a chamada. Sem esta checagem dava para devolver ao estoque uma
    // encomenda já entregue, ou andar para trás no fluxo.
    if (!podeMudar(statusAnterior, status)) {
      await conexao.rollback();
      const motivo = ehFinal(statusAnterior)
        ? `Pedido ${rotulo(statusAnterior)} é o fim do fluxo e não muda mais.`
        : `Não dá para ir de "${rotulo(statusAnterior)}" para "${rotulo(status)}".`;
      return res.status(409).json({ erro: motivo });
    }

    // Concluir exige o CÓDIGO, não um clique: quem tem o pedido em mãos é
    // quem recebeu o código no WhatsApp. Direto, só cancelar/estornar.
    if (status === "entregue") {
      await conexao.rollback();
      return res.status(409).json({
        erro: "Para concluir o pedido, informe o código de confirmação que o cliente recebeu (campo Código no pedido).",
      });
    }

    // Pix é pré-pago: sem confirmação, a produção não começa.
    const bloqueio = motivoBloqueioPagamento(status, pedidoRows[0].forma_pagamento, pedidoRows[0].status_pagamento);
    if (bloqueio) {
      await conexao.rollback();
      return res.status(409).json({ erro: bloqueio });
    }

    // O reembolso financeiro precisa ser realizado e registrado pela gestão.
    const tipo = pedidoRows[0].tipo_recebimento;
    if ((status === 'saiu_para_entrega' && tipo !== 'entrega') || (statusAnterior === 'pronto' && status === 'entregue' && tipo === 'entrega')) {
      await conexao.rollback();
      return res.status(409).json({ erro: 'Use o fluxo de retirada ou entrega correspondente ao pedido.' });
    }


    // Entrando em "pronto", o pedido ganha o código de confirmação (se ainda
    // não tem). Gerar AQUI, dentro da transação e da mesma travada que muda
    // o status: código sem status pronto não significa nada.
    let codigoNovo: string | null = null;
    if (status === "pronto" && !pedidoRows[0].codigo_entrega) {
      codigoNovo = gerarCodigoEntrega();
    }

    await conexao.query(
      "UPDATE pedidos SET status = ?, aviso_pronto_estado = IF(? = 'pronto', COALESCE(aviso_pronto_estado, 'pendente'), aviso_pronto_estado), codigo_entrega = COALESCE(?, codigo_entrega) WHERE id = ?",
      [status, status, codigoNovo, id]
    );
    if (status === 'cancelado') await conexao.query('UPDATE pedidos SET cancelamento_solicitado_em=NULL WHERE id=?', [id]);
    await conexao.query("INSERT INTO avisos_pedido (pedido_id,status,estado) VALUES (?,?,'pendente') ON DUPLICATE KEY UPDATE pedido_id=pedido_id", [id, status]);

    // Entrou em cancelado vindo de outro estado: devolve cada insumo usado
    // pelos itens (agrupado por insumo) e registra a devolução.
    if (status === "cancelado" && statusAnterior !== "cancelado") {
      // Lê as movimentações de SAÍDA do pedido, e não a ficha técnica atual:
      // a baixa foi o que de fato saiu do estoque. Se o gestor editar a
      // receita depois da venda, reconstituir pelo JOIN devolvia quantidade
      // errada (ou nada) e o insumo sumia do estoque para sempre.
      const [usos] = await conexao.query<LinhaUso[]>(
        `SELECT insumo_id, SUM(quantidade) AS quantidade
         FROM movimentacoes_estoque
         WHERE pedido_id = ? AND tipo = 'saida'
         GROUP BY insumo_id`,
        [id]
      );
      for (const uso of usos) {
        await conexao.query(
          "UPDATE insumos SET quantidade_atual = quantidade_atual + ? WHERE id = ?",
          [uso.quantidade, uso.insumo_id]
        );
        await conexao.query(
          `INSERT INTO movimentacoes_estoque (insumo_id, tipo, quantidade, pedido_id, observacao)
           VALUES (?, 'entrada', ?, ?, 'Estorno por cancelamento do pedido')`,
          [uso.insumo_id, uso.quantidade, id]
        );
      }
    }


    await conexao.commit();

    // Auditoria depois do commit: se falhasse antes, o status já teria mudado
    // sem registro. O inverso (log de algo que não mudou) é bem menos grave.
    await registrar(req, {
      acao: "atualizar",
      tabela: "pedidos",
      registroId: id,
      descricao: `Moveu o pedido #${id} de "${rotulo(statusAnterior)}" para "${rotulo(status)}"`,
      antes: { status: statusAnterior, status_pagamento: pedidoRows[0].status_pagamento },
      depois: {
        status,
        status_pagamento: pedidoRows[0].status_pagamento,
      },
    });

    const notificacao = await notificarStatusPedido(id, status);
    res.json({
      id,
      status,
      status_pagamento: pedidoRows[0].status_pagamento,
      notificacao_whatsapp: notificacao,
    });
  } catch (err) {
    await conexao.rollback();
    throw err;
  } finally {
    conexao.release();
  }
}

// PATCH /api/pedidos/:id/entregar -> painel
// Conclusão do pedido por CÓDIGO de confirmação: quem tem o pedido em mãos é
// quem recebeu o código no WhatsApp (quando o pedido ficou "pronto"). O gestor
// digita o que o cliente/motoboy informou; acertou, baixa; errou, nada muda.
// Por aqui — e não por um clique em /status — é que o pedido termina.
export async function confirmarEntrega(req: RequisicaoAutenticada, res: Response) {
  const id = Number(req.params.id);
  const { codigo } = req.body;

  // Formato antes de tocar no banco: qualquer coisa que não seja 4 dígitos
  // nunca é código válido, então nem vale a consulta.
  if (typeof codigo !== "string" || !/^\d{4}$/.test(codigo)) {
    return res.status(400).json({ erro: "Informe o código de confirmação de 4 dígitos." });
  }

  const conexao = await pool.getConnection();
  try {
    await conexao.beginTransaction();

    const [rows] = await conexao.query<LinhaStatus[]>(
      "SELECT status, status_pagamento, forma_pagamento, tipo_recebimento, codigo_entrega, cancelamento_solicitado_em, codigo_tentativas, codigo_bloqueado_ate FROM pedidos WHERE id = ? FOR UPDATE",
      [id]
    );
    const pedido = rows[0];
    if (!pedido) {
      await conexao.rollback();
      return res.status(404).json({ erro: "Pedido não encontrado." });
    }

    if (!podeMudar(pedido.status, "entregue")) {
      await conexao.rollback();
      const motivo = ehFinal(pedido.status)
        ? `Pedido ${rotulo(pedido.status)} é o fim do fluxo e não muda mais.`
        : `Só é possível concluir um pedido que esteja "pronto" (retirada) ou "saiu para entrega".`;
      return res.status(409).json({ erro: motivo });
    }

    // Entrega em "pronto" significa motoboy que ainda não saiu: o cliente
    // confirmaria recebimento de um pedido que nunca chegou. Passa primeiro
    // por "saiu_para_entrega" (que manda o código ao cliente).
    if (pedido.tipo_recebimento === "entrega" && pedido.status === "pronto") {
      await conexao.rollback();
      return res.status(409).json({ erro: 'O pedido ainda não saiu para entrega. Avance para "saiu para entrega" primeiro.' });
    }

    if (!pedido.codigo_entrega) {
      await conexao.rollback();
      return res.status(409).json({ erro: "Este pedido não tem código de confirmação. Avance o fluxo até 'pronto' para gerar." });
    }

    if (pedido.codigo_bloqueado_ate && new Date(pedido.codigo_bloqueado_ate).getTime() > Date.now()) {
      await conexao.rollback();
      return res.status(429).json({ erro: 'Muitas tentativas. Aguarde 5 minutos e confira o código com o cliente.' });
    }
    if (pedido.codigo_entrega !== codigo) {
      const tentativas = pedido.codigo_bloqueado_ate ? 1 : Number(pedido.codigo_tentativas || 0) + 1;
      await conexao.query('UPDATE pedidos SET codigo_tentativas=?, codigo_bloqueado_ate=IF(? >= 5, DATE_ADD(NOW(), INTERVAL 5 MINUTE), NULL) WHERE id=?', [tentativas, tentativas, id]);
      await conexao.commit();
      // 409 com mensagem genérica de propósito: não revelar se o pedido
      // existe/como está para quem digita códigos errado várias vezes.
      await registrar(req, {
        acao: "atualizar",
        tabela: "pedidos",
        registroId: id,
        descricao: `Tentativa de conclusão do pedido #${id} com código INCORRETO`,
      });
      return res.status(409).json({ erro: "Código de confirmação incorreto. Confira com o cliente." });
    }

    const bloqueioPagamento = motivoBloqueioPagamento('entregue', pedido.forma_pagamento, pedido.status_pagamento);
    if (bloqueioPagamento || (pedido.tipo_recebimento === 'entrega' && pedido.forma_pagamento !== 'pix')) {
      await conexao.rollback();
      return res.status(409).json({ erro: bloqueioPagamento || 'Entrega em domicílio exige Pix.' });
    }
    await conexao.query("UPDATE pedidos SET status = 'entregue', codigo_entrega = NULL, codigo_tentativas = 0, codigo_bloqueado_ate = NULL WHERE id = ?", [id]);
    await conexao.query(
      "INSERT INTO avisos_pedido (pedido_id,status,estado) VALUES (?,'entregue','pendente') ON DUPLICATE KEY UPDATE pedido_id=pedido_id",
      [id]
    );
    await conexao.commit();
  } catch (error) {
    await conexao.rollback();
    throw error;
  } finally {
    conexao.release();
  }

  await registrar(req, {
    acao: "atualizar",
    tabela: "pedidos",
    registroId: id,
    descricao: `Concluiu o pedido #${id} com código de confirmação validado`,
    antes: { status: "pronto/saiu_para_entrega" },
    depois: { status: "entregue" },
  });

  const notificacao = await notificarStatusPedido(id, "entregue");
  res.json({ id, status: "entregue", notificacao_whatsapp: notificacao });
}

export async function atualizarPagamento(req: RequisicaoAutenticada, res: Response) {
  const id = Number(req.params.id);
  const { status_pagamento } = req.body;

  const validos = ["pendente", "pago", "estornado"];
  if (!validos.includes(status_pagamento)) {
    return res.status(400).json({ erro: "Status de pagamento inválido. Use: pendente, pago ou estornado." });
  }

  const conexao = await pool.getConnection();
  let anterior: LinhaStatus | undefined;
  let mudou = false;
  try {
    await conexao.beginTransaction();
    const [rows] = await conexao.query<LinhaStatus[]>(
      'SELECT status, status_pagamento FROM pedidos WHERE id = ? FOR UPDATE', [id]);
    anterior = rows[0];
    if (!anterior) { await conexao.rollback(); return res.status(404).json({ erro: 'Pedido não encontrado.' }); }
    if (status_pagamento === 'estornado' && (anterior.status !== 'cancelado' || anterior.status_pagamento !== 'pago')) {
      await conexao.rollback(); return res.status(409).json({ erro: 'Confirme o estorno somente após cancelar um pedido pago e efetuar o reembolso.' });
    }
    if (status_pagamento === 'pendente' && anterior.status !== 'pendente') {
      await conexao.rollback(); return res.status(409).json({ erro: 'Não é possível remover a confirmação de pagamento após iniciar o preparo.' });
    }
    if (anterior.status === 'cancelado' && status_pagamento !== 'estornado') {
      await conexao.rollback(); return res.status(409).json({ erro: 'Pedido cancelado só aceita pagamento estornado.' });
    }
    mudou = anterior.status_pagamento !== status_pagamento;
    if (mudou) {
      await conexao.query('UPDATE pedidos SET status_pagamento = ? WHERE id = ?', [status_pagamento, id]);
      if (status_pagamento === 'pago') {
        await conexao.query("INSERT INTO avisos_pedido (pedido_id,status,estado) VALUES (?,'pagamento_confirmado','pendente') ON DUPLICATE KEY UPDATE pedido_id=pedido_id", [id]);
      }
    }
    await conexao.commit();
  } catch (error) { await conexao.rollback(); throw error; }
  finally { conexao.release(); }
  if (mudou) await registrar(req, {
    acao: 'atualizar', tabela: 'pedidos', registroId: id,
    descricao: `Pagamento do pedido #${id}: ${anterior?.status_pagamento} → ${status_pagamento}`,
    antes: { status_pagamento: anterior?.status_pagamento }, depois: { status_pagamento },
  });
  const notificacao = status_pagamento === 'pago' ? await notificarStatusPedido(id, 'pagamento_confirmado') : null;
  res.json({ id, status_pagamento, notificacao_whatsapp: notificacao });
}

export async function solicitarCancelamento(req: Request, res: Response) {
  const id = Number(req.params.id), whatsapp = req.body.whatsapp;
  if (!Number.isInteger(id) || id <= 0 || typeof whatsapp !== 'string') return res.status(400).json({ erro: 'Pedido inválido.' });
  const conexao = await pool.getConnection();
  try {
    await conexao.beginTransaction();
    const [rows] = await conexao.query<RowDataPacket[]>('SELECT p.status FROM pedidos p JOIN clientes c ON c.id=p.cliente_id WHERE p.id=? AND c.whatsapp=? FOR UPDATE', [id, whatsapp]);
    if (!rows[0]) { await conexao.rollback(); return res.status(404).json({ erro: 'Pedido não encontrado para este cliente.' }); }
    if (rows[0].status !== 'pendente') { await conexao.rollback(); return res.status(409).json({ erro: 'O pedido já entrou em preparo ou foi finalizado. Fale com a loja para avaliar a situação; não houve cancelamento automático.' }); }
    await conexao.query('UPDATE pedidos SET cancelamento_solicitado_em=COALESCE(cancelamento_solicitado_em,NOW()) WHERE id=?', [id]);
    await conexao.commit();
  } catch (erro) { await conexao.rollback(); throw erro; } finally { conexao.release(); }
  await registrar(req, { acao:'atualizar', tabela:'pedidos', registroId:id, descricao:'Cliente solicitou cancelamento antes do preparo' });
  res.json({ id, solicitado:true });
}

export async function manterPedido(req: RequisicaoAutenticada, res: Response) {
  const id = Number(req.params.id);
  const [resultado] = await pool.query<ResultSetHeader>("UPDATE pedidos SET cancelamento_solicitado_em=NULL WHERE id=? AND status='pendente' AND cancelamento_solicitado_em IS NOT NULL", [id]);
  if (!resultado.affectedRows) return res.status(409).json({ erro:'A solicitação já foi resolvida. Atualize o pedido.' });
  await registrar(req, { acao:'atualizar', tabela:'pedidos', registroId:id, descricao:'Gestão manteve o pedido após tratar a solicitação de cancelamento com o cliente' });
  res.json({ id, solicitado:false });
}
