import { useEffect, useMemo, useState } from "react";
import { estaDisponivel } from "../lib/disponibilidade";
import type { ItemCarrinho, Produto } from "../types";
import { calcularTotal, contarUnidades } from "../lib/mensagemWhats";

// Chave da sacola no navegador — a sacola sobrevive ao F5, o que é
// importante numa vitrine (a pessoa pode fechar e voltar sem perder nada).
const CHAVE_SACOLA = "cg_sacola";

type MapaQuantidade = Record<number, number>;

// Lê o mapa salvo; formato inválido cai para sacola vazia em vez de quebrar.
function lerSacolaSalva(): MapaQuantidade {
  try {
    const texto = localStorage.getItem(CHAVE_SACOLA);
    if (!texto) return {};
    const analisado: unknown = JSON.parse(texto);
    return typeof analisado === "object" && analisado !== null
      ? (analisado as MapaQuantidade)
      : {};
  } catch {
    return {};
  }
}

// Toda a lógica da sacola isolada aqui: os componentes só chamam ações e
// leem valores prontos, sem manipular mapa de quantidades na tela.
export function useCarrinho(produtos: Produto[]): {
  itens: ItemCarrinho[];
  adicionar: (produtoId: number) => void;
  adicionarVarios: (produtoId: number, quantidade: number) => void;
  remover: (produtoId: number) => void;
  alterarQuantidade: (produtoId: number, diferenca: number) => void;
  limpar: () => void;
  total: number;
  unidades: number;
  quantidades: Record<number, number>;
} {
  const [mapa, definirMapa] = useState<MapaQuantidade>(lerSacolaSalva);

  // Persiste a cada mudança (efeito separado do estado para não misturar
  // regra de negócio com efeito colateral de armazenamento).
  useEffect(() => {
    localStorage.setItem(CHAVE_SACOLA, JSON.stringify(mapa));
  }, [mapa]);

  // Resolve os ids para objetos completos; item de produto que sumiu do
  // cardápio é ignorado em vez de quebrar a sacola.
  const itens = useMemo<ItemCarrinho[]>(
    () =>
      Object.entries(mapa)
        .map(([id, quantidade]) => {
          const produto = produtos.find((item) => item.id === Number(id));
          return produto && Number.isInteger(quantidade) && quantidade > 0 ? { produto, quantidade } : null;
        })
        .filter((item): item is ItemCarrinho => item !== null),
    [mapa, produtos],
  );

  function adicionar(produtoId: number): void {
    adicionarVarios(produtoId, 1);
  }

  // Entrada com quantidade escolhida (tela de confirmação do card).
  function adicionarVarios(produtoId: number, quantidade: number): void {
    const produto = produtos.find(item => item.id === produtoId);
    if (!produto || !estaDisponivel(produto) || !Number.isInteger(quantidade) || quantidade <= 0) return;
    definirMapa((anterior) => ({
      ...anterior,
      [produtoId]: Math.min(produto.quantidadeDisponivel ?? 999, (Number.isInteger(anterior[produtoId]) ? anterior[produtoId] : 0) + quantidade),
    }));
  }

  function remover(produtoId: number): void {
    definirMapa((anterior) => {
      const copia = { ...anterior };
      delete copia[produtoId];
      return copia;
    });
  }

  // Soma ou subtrai; zerou, remove o item (sacola nunca guarda quantidade 0).
  function alterarQuantidade(produtoId: number, diferenca: number): void {
    const produto = produtos.find(item => item.id === produtoId);
    if (!produto || !Number.isInteger(diferenca) || (diferenca > 0 && !estaDisponivel(produto))) return;
    definirMapa((anterior) => {
      const nova = Math.min(produto.quantidadeDisponivel ?? 999, (anterior[produtoId] ?? 0) + diferenca);
      if (nova <= 0) {
        const copia = { ...anterior };
        delete copia[produtoId];
        return copia;
      }
      return { ...anterior, [produtoId]: nova };
    });
  }

  function limpar(): void {
    definirMapa({});
  }

  return {
    itens,
    adicionar,
    adicionarVarios,
    remover,
    alterarQuantidade,
    limpar,
    total: calcularTotal(itens),
    unidades: contarUnidades(itens),
    quantidades: Object.fromEntries(
      itens.map((item) => [item.produto.id, item.quantidade]),
    ),
  };
}
