// Pedidos: listagem, detalhe, mudança de status e pagamento.
// A lista vem crua do banco (DECIMAL chega string) e é normalizada aqui.

import type { DetalhePedido, Insumo, Pedido, ProdutoVendido } from "../../types";
import { requisitar } from "./base";
import { normalizarDataApi } from '../dataApi';
function recebimento(dados: Record<string, unknown>) {
  return {
    tipo_recebimento: String(dados.tipo_recebimento ?? 'retirada'),
    entrega_simulada: Boolean(Number(dados.entrega_simulada)),
    entrega_cidade: (dados.entrega_cidade as string | null) ?? null,
    entrega_endereco: (dados.entrega_endereco as string | null) ?? null,
    entrega_complemento: (dados.entrega_complemento as string | null) ?? null,
    taxa_entrega: Number(dados.taxa_entrega) || 0,
    entrega_distancia_metros: dados.entrega_distancia_metros == null ? null : Number(dados.entrega_distancia_metros),
    aviso_status_estado: (dados.aviso_status_estado as string | null) ?? null,
    aviso_pagamento_estado: (dados.aviso_pagamento_estado as string | null) ?? null,
  };
}

/** GET /api/pedidos — todos (o resumo conta por status no cliente). */
export async function listarPedidos(token: string): Promise<Pedido[]> {
  const lista = await requisitar<Array<Record<string, unknown>>>("/pedidos", token);
  return lista.map((pedido) => ({
    id: Number(pedido.id),
    aviso_pronto_estado: (pedido.aviso_pronto_estado as string | null) ?? null,
    ...recebimento(pedido),
    cliente_id: Number(pedido.cliente_id),
    cliente_nome: (pedido.cliente_nome as string | null) ?? null,
    whatsapp: String(pedido.whatsapp ?? ""),
    status: String(pedido.status ?? ""),
    forma_pagamento: (pedido.forma_pagamento as string | null) ?? null,
    status_pagamento: String(pedido.status_pagamento ?? ""),
    valor_total: Number(pedido.valor_total) || 0,
    origem: String(pedido.origem ?? ""),
    criado_em: normalizarDataApi(pedido.criado_em),
  }));
}

/**
 * GET /api/pedidos/:id — cabeçalho + itens (normaliza números do DECIMAL).
 *
 * O `signal` existe para o drawer: sem ele, abrir dois pedidos seguidos deixa
 * a resposta do primeiro chegar depois e pintar os dados do pedido errado.
 */
export async function obterPedido(
  token: string,
  id: number,
  signal?: AbortSignal,
): Promise<DetalhePedido> {
  const dados = await requisitar<Record<string, unknown>>(`/pedidos/${id}`, token, { signal });
  const brutos = (dados.itens as Array<Record<string, unknown>>) ?? [];
  return {
    id: Number(dados.id),
    aviso_pronto_estado: (dados.aviso_pronto_estado as string | null) ?? null,
    ...recebimento(dados),
    cliente_id: Number(dados.cliente_id),
    cliente_nome: (dados.cliente_nome as string | null) ?? null,
    whatsapp: String(dados.whatsapp ?? ""),
    status: String(dados.status ?? ""),
    forma_pagamento: (dados.forma_pagamento as string | null) ?? null,
    status_pagamento: String(dados.status_pagamento ?? ""),
    valor_total: Number(dados.valor_total) || 0,
    origem: String(dados.origem ?? ""),
    criado_em: normalizarDataApi(dados.criado_em),
    itens: brutos.map((item) => ({
      id: Number(item.id),
      produto_id: Number(item.produto_id),
      produto_nome: String(item.produto_nome ?? ""),
      quantidade: Number(item.quantidade) || 0,
      preco_unitario: Number(item.preco_unitario) || 0,
      subtotal: Number(item.subtotal) || 0,
    })),
  };
}

/** PATCH /api/pedidos/:id/status — avança ou cancela (cancelar estorna). */
export async function definirStatusPedido(
  token: string,
  id: number,
  status: string,
): Promise<void> {
  await requisitar(`/pedidos/${id}/status`, token, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

/** PATCH /api/pedidos/:id/pagamento — marca como pago/pendente/estornado. */
export async function definirPagamentoPedido(
  token: string,
  id: number,
  status_pagamento: string,
): Promise<void> {
  await requisitar(`/pedidos/${id}/pagamento`, token, {
    method: "PATCH",
    body: JSON.stringify({ status_pagamento }),
  });
}

/** GET /api/insumos/baixo-estoque — alerta de reposição. */
export async function listarBaixoEstoque(token: string): Promise<Insumo[]> {
  const lista = await requisitar<Array<Record<string, unknown>>>("/insumos/baixo-estoque", token);
  return lista.map((insumo) => ({
    id: Number(insumo.id),
    nome: String(insumo.nome ?? ""),
    unidade_medida: String(insumo.unidade_medida ?? ""),
    quantidade_atual: Number(insumo.quantidade_atual) || 0,
    quantidade_minima: Number(insumo.quantidade_minima) || 0,
    custo_unitario: Number(insumo.custo_unitario) || 0,
  }));
}

export async function listarMaisVendidos(token: string): Promise<ProdutoVendido[]> {
  const lista = await requisitar<Array<Record<string, unknown>>>(
    "/produtos/admin/mais-vendidos",
    token,
  );
  return lista.map((linha) => ({
    id: Number(linha.id),
    nome: String(linha.nome ?? ""),
    total_vendido: Number(linha.total_vendido) || 0,
  }));
}
