import type { DadosRecebimento } from "../lib/recebimento";
import type { ItemCarrinho } from "../types";
import { CarrinhoDrawer } from "./CarrinhoDrawer";
import { ModalAjuda } from "./ModalAjuda";
import { ModalConfiguracoes } from "./ModalConfiguracoes";
import { AvisoFlutuante } from "./AvisoFlutuante";

// Camadas que ficam por cima da vitrine: escurecimento de fundo, sacola
// lateral, modais e o balão de aviso. Todas são efêmeras — abrem e fecham sem
// alterar a página. Ficaram juntas para o App guardar o estado da vitrine, não
// a lista de overlays.
interface PropriedadesCamadas {
  sacolaAberta: boolean;
  itens: ItemCarrinho[];
  total: number;
  nomeCliente: string;
  observacao: string;
  recebimento: DadosRecebimento;
  aoMudarRecebimento: (dados: DadosRecebimento) => void;
  configAberto: boolean;
  ajudaAberta: boolean;
  aviso: string | null;
  aoFecharSacola: () => void;
  aoMudarNome: (nome: string) => void;
  aoMudarObservacao: (observacao: string) => void;
  aoAlterarQuantidade: (produtoId: number, diferenca: number) => void;
  aoRemover: (produtoId: number) => void;
  aoFinalizar: () => void;
  aoVerCardapio: () => void;
  aoFecharConfiguracoes: () => void;
  aoSalvarConfiguracoes: () => void;
  aoFecharAjuda: () => void;
}

export function Camadas({
  sacolaAberta,
  itens,
  total,
  nomeCliente,
  observacao,
  recebimento,
  aoMudarRecebimento,
  configAberto,
  ajudaAberta,
  aviso,
  aoFecharSacola,
  aoMudarNome,
  aoMudarObservacao,
  aoAlterarQuantidade,
  aoRemover,
  aoFinalizar,
  aoVerCardapio,
  aoFecharConfiguracoes,
  aoSalvarConfiguracoes,
  aoFecharAjuda,
}: PropriedadesCamadas): JSX.Element {
  return (
    <>
      {/* Clica fora para fechar a sacola. Fica atrás do drawer (z-60 contra
          z-50) e é aria-hidden porque o botão fechar já cobre leitor de tela. */}
      {sacolaAberta && (
        <div
          className="fixed inset-0 z-[60] animate-[aparecer_0.25s_ease] bg-tinta/45 backdrop-blur-sm"
          onClick={aoFecharSacola}
          aria-hidden="true"
        />
      )}
      <CarrinhoDrawer
        aberto={sacolaAberta}
        itens={itens}
        total={total}
        nomeCliente={nomeCliente}
        observacao={observacao}
        recebimento={recebimento}
        aoMudarRecebimento={aoMudarRecebimento}
        aoMudarNome={aoMudarNome}
        aoMudarObservacao={aoMudarObservacao}
        aoAlterarQuantidade={aoAlterarQuantidade}
        aoRemover={aoRemover}
        aoFechar={aoFecharSacola}
        aoFinalizar={aoFinalizar}
        aoVerCardapio={aoVerCardapio}
      />
      <ModalConfiguracoes
        aberto={configAberto}
        aoFechar={aoFecharConfiguracoes}
        aoSalvar={aoSalvarConfiguracoes}
      />
      <ModalAjuda aberto={ajudaAberta} aoFechar={aoFecharAjuda} />
      {aviso !== null && <AvisoFlutuante texto={aviso} />}
    </>
  );
}
