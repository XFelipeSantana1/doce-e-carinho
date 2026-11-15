import type { Produto } from "../types";
import { CardProduto } from "./CardProduto";

// Categorias usam a mesma grade e o mesmo tamanho de cartão, inclusive com poucos itens.
interface PropriedadesGrupoCategoria {
  categoria: string;
  numero: string;
  itens: Produto[];
  quantidades: Record<number, number>;
  espacamentoTopo: string;
  identificador: string;
  aoAdicionar: (produtoId: number) => void;
  aoAlterarQuantidade: (produtoId: number, diferenca: number) => void;
  /** Lixeira: tira o produto TODO da sacola em um toque. */
  aoRemover: (produtoId: number) => void;
}

export function GrupoCategoria({
  categoria,
  numero,
  itens,
  quantidades,
  espacamentoTopo,
  identificador,
  aoAdicionar,
  aoAlterarQuantidade,
  aoRemover,
}: PropriedadesGrupoCategoria): JSX.Element {
  return (
    <section
      id={identificador}
      className={espacamentoTopo}
      // Desconto de cabeçalho + abas fixas pela variável (igual ao main):
      // número chutado pousava o título atrás da barra.
      style={{ scrollMarginTop: "calc(var(--altura-cabecalho, 67px) + 60px)" }}
    >
      <div className="mb-4 flex items-baseline gap-3">
        {/* Numeração editorial ("01 — Doces"): cara de cardápio impresso, em
            Manrope com tracking aberto — técnica, não decorativa. Semibold
            tabular: número que cresce sem pular um pixel. */}
        <span
          className="font-numero text-xs font-semibold tracking-[0.25em] text-carameloForte tabular-nums"
          aria-hidden="true"
        >
          {numero}
        </span>
        <h3 className="font-display text-2xl font-bold tracking-tight text-tinta text-balance md:text-3xl">
          {categoria}
        </h3>
        <span className="h-px min-w-6 flex-1 bg-borda" aria-hidden="true" />
      </div>
      {/* Celular = lista em 1 coluna com hairlines (`divide-y`); a partir de
          sm os hairlines saem e volta a grade de cartões com vão. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
        {itens.map((produto) => (
          <div
            key={produto.id}
            className="min-w-0 h-full"
          >
            <CardProduto
              produto={produto}
              quantidadeNaSacola={quantidades[produto.id] ?? 0}
              aoAdicionar={aoAdicionar}
              aoAlterarQuantidade={aoAlterarQuantidade}
              aoRemover={aoRemover}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
