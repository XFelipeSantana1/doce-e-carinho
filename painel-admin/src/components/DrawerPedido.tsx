import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import type { DetalhePedido } from "../types";
import { ErroApi, obterPedido } from "../lib/api";
import { proximoStatus, rotuloStatus } from "../lib/pedido";
import { STATUS_PEDIDO } from "../types";
import { ItensPedido } from "./ItensPedido";
import { AcoesPedido } from "./AcoesPedido";
import { CabecalhoDrawer } from "./CabecalhoDrawer";
import { ModalConfirmacao } from "./ModalConfirmacao";
import { requisitar } from "../lib/api/base";
import { Botao } from "./ui/Botao";
import { AvisoWhatsApp } from './AvisoWhatsApp';

// Drawer lateral do pedido (5.2): painel branco à direita no desktop
// (rounded-l-card, border-l, shadow-flutuante), tela cheia no celular.
// Busca o detalhe ao abrir e coordena as ações (cada uma trava clique duplo
// e mostra erro sem fechar o drawer).
interface PropriedadesDrawerPedido {
  pedidoId: number | null;
  token: string;
  aoFechar: () => void;
  aoMudarStatus: (id: number, status: string, statusAtual: string) => Promise<void>;
  aoConcluirComCodigo: (id: number, codigo: string) => Promise<void>;
  aoMudarPagamento: (id: number, status: string) => Promise<void>;
}

// Os passos que o fluxo mostra em texto. "cancelado" fica fora: terminador,
// não passo — quem cancela lê o Estado "Cancelado" no cabeçalho.
const FLUXO_VISIVEL = STATUS_PEDIDO.filter((status) => status !== "cancelado");

export function DrawerPedido({
  pedidoId,
  token,
  aoFechar,
  aoMudarStatus,
  aoConcluirComCodigo,
  aoMudarPagamento,
}: PropriedadesDrawerPedido): JSX.Element | null {
  const [detalhe, definirDetalhe] = useState<DetalhePedido | null>(null);
  const [carregando, definirCarregando] = useState(false);
  const [erro, definirErro] = useState<string | null>(null);
  const [agindo, definirAgindo] = useState(false);
  const emAcao = useRef(false);
  const dialogo = useRef<HTMLElement>(null);
  const [confirmacao, definirConfirmacao] = useState<{ titulo: string; mensagem: string; executar: () => Promise<void> } | null>(null);
  useEffect(() => { definirConfirmacao(null); definirDetalhe(null); }, [pedidoId]);
  useEffect(() => {
    if (pedidoId === null || agindo || confirmacao) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      void obterPedido(token, pedidoId, controller.signal).then(definirDetalhe).catch(() => {});
    }, 10000);
    return () => { window.clearInterval(timer); controller.abort(); };
  }, [pedidoId, token, agindo, confirmacao]);

  // Busca o detalhe quando um pedido é selecionado (efeito por seleção).
  //
  // O `AbortController` não é decoração: abrir o pedido #5 e logo o #6 fazia a
  // primeira consulta voltar depois e o drawer pintar os dados do #5 com o
  // título "Pedido #6". O cleanup do efeito roda antes do próximo efeito, mas
  // o fetch já tinha disparado — quem precisa se descartar é a própria
  // resposta, e abortar é o jeito de dizer isso ao navegador.
  useEffect(() => {
    if (pedidoId === null) {
      definirDetalhe(null);
      definirErro(null);
      definirCarregando(false);
      return;
    }
    const cancelamento = new AbortController();
    async function buscar(): Promise<void> {
      definirCarregando(true);
      definirErro(null);
      try {
        definirDetalhe(await obterPedido(token, pedidoId as number, cancelamento.signal));
      } catch (falha) {
        if (cancelamento.signal.aborted) return;
        definirErro(falha instanceof Error ? falha.message : "Não foi possível abrir o pedido.");
      } finally {
        if (!cancelamento.signal.aborted) definirCarregando(false);
      }
    }
    buscar();
    return () => cancelamento.abort();
  }, [pedidoId, token]);

  useEffect(() => {
    if (pedidoId === null) return;
    function aoTeclar(evento: KeyboardEvent): void {
      if (evento.key === "Escape") { evento.preventDefault(); if (emAcao.current) return; if (confirmacao) definirConfirmacao(null); else aoFechar(); }
      if (evento.key === 'Tab' && !confirmacao) {
        const focaveis = Array.from(dialogo.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], textarea:not(:disabled)') ?? []).filter(el => el.getClientRects().length > 0);
        const primeiro = focaveis[0], ultimo = focaveis[focaveis.length - 1];
        if (!primeiro) { evento.preventDefault(); return; }
        if (evento.shiftKey && (document.activeElement === primeiro || document.activeElement === dialogo.current)) { evento.preventDefault(); ultimo.focus(); }
        else if (!evento.shiftKey && (document.activeElement === ultimo || document.activeElement === dialogo.current)) { evento.preventDefault(); primeiro.focus(); }
      }
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [pedidoId, aoFechar, confirmacao, agindo]);

  useEffect(() => {
    if (pedidoId === null) return;
    const anterior = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => dialogo.current?.focus());
    return () => { cancelAnimationFrame(frame); document.body.style.overflow = overflow; anterior?.focus(); };
  }, [pedidoId]);

  if (pedidoId === null) return null;

  async function agir(
    acao: () => Promise<void>,
    recarregar: (detalhe: DetalhePedido) => DetalhePedido,
  ): Promise<void> {
    if (emAcao.current) return;
    emAcao.current = true;
    definirAgindo(true);
    definirErro(null);
    try {
      await acao();
      definirDetalhe((atual) => (atual ? recarregar(atual) : atual));
      try { definirDetalhe(await obterPedido(token, pedidoId as number)); }
      catch { definirErro('A alteração foi salva, mas não consegui atualizar os detalhes. Feche e abra o pedido novamente.'); }
    } catch (falha) {
      definirErro(falha instanceof ErroApi ? falha.message : "A ação falhou. Tente de novo.");
    } finally {
      emAcao.current = false;
      definirAgindo(false);
    }
  }

  return createPortal(
    <>
    <div className="admin-order-backdrop" aria-hidden="true" onClick={() => { if (!emAcao.current) aoFechar(); }} />
    <aside
      ref={dialogo}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby={"pedido-titulo-" + pedidoId}
      className="admin-order-drawer"
    >
      <CabecalhoDrawer
        pedidoId={pedidoId}
        status={detalhe?.status ?? null}
        aoFechar={() => { if (!agindo) aoFechar(); }}
      />

      <div className="admin-drawer-body">
        {carregando ? (
          <p className="flex items-center gap-2 py-10 text-sm text-textoSuave">
            <Loader2 size={18} strokeWidth={1.5} className="motion-safe:animate-spin" aria-hidden="true" /> Abrindo pedido…
          </p>
        ) : erro && !detalhe ? (
          <p role="alert" className="rounded-campo bg-areia px-3 py-2 text-sm font-semibold text-carameloForte">
            {erro}
          </p>
        ) : detalhe ? (
          <>
            {/* Fluxo em UMA linha de texto: onde o pedido está nessas quatro
                etapas, sem bolinhas nem caixinhas. O atual é semibold + traço
                caramelo; o resto é textoSuave — a cor é do marcador de estado,
                não de enfeite. */}
            <div
              aria-label="Fluxo do pedido"
              className="admin-detail-flow text-xs"
            ><h3>Produção e recebimento</h3><div className="admin-flow-steps">
              {FLUXO_VISIVEL.filter(status => status !== 'saiu_para_entrega' || detalhe.tipo_recebimento === 'entrega').map((status, indice) => (
                <span key={status} className="flex items-center gap-x-1.5">
                  {indice > 0 ? (
                    <span aria-hidden="true" className="text-textoSuave">
                      →
                    </span>
                  ) : null}
                  <span
                    className={status === detalhe.status ? 'admin-step is-current' : 'admin-step'}
                  >
                    {rotuloStatus(status)}
                    {status === detalhe.status ? (
                      <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-caramelo" />
                    ) : null}
                  </span>
                </span>
              ))}</div>
            </div>
            {detalhe.status === 'pendente' && detalhe.cancelamento_solicitado_em ? (
              <div role="alert" className="rounded-campo border border-perigo p-3 text-sm">
                <b>Cliente solicitou cancelamento</b>
                <p>Converse com o cliente e cancele o pedido ou confirme que ele deseja mantê-lo. O preparo está bloqueado.</p>
                <Botao variante="secundario" disabled={agindo} onClick={() => definirConfirmacao({
                  titulo: 'Manter pedido #' + detalhe.id,
                  mensagem: 'Confirma que conversou com o cliente e ele deseja manter o pedido? Isso remove a solicitação de cancelamento.',
                  executar: () => agir(async () => { await requisitar('/pedidos/' + detalhe.id + '/manter', token, { method:'PATCH' }); }, atual => ({ ...atual, cancelamento_solicitado_em:null })),
                })}>Cliente deseja manter</Botao>
              </div>
            ) : null}
            {detalhe.status === 'cancelado' && detalhe.status_pagamento === 'pago' ? <p role="alert" className="text-sm text-perigo">Reembolso pendente: marque Estornado somente após devolver o valor ao cliente.</p> : null}
            <ItensPedido
              detalhe={detalhe}
              desabilitado={agindo}
              aoTrocarPagamento={(valor) => definirConfirmacao({
                titulo: valor === 'pago' ? 'Confirmar recebimento do pagamento' : valor === 'estornado' ? 'Confirmar reembolso realizado' : 'Voltar pagamento para a receber',
                mensagem: valor === 'pago' ? 'Confirma que recebeu o pagamento do pedido #' + detalhe.id + '? Na demonstração, esta é a aprovação manual que libera o preparo.' : valor === 'estornado' ? 'Confirma que o valor já foi devolvido ao cliente? Esta ação apenas registra o estorno.' : 'O preparo ficará bloqueado até uma nova confirmação de pagamento.',
                executar: () => agir(() => aoMudarPagamento(detalhe.id, valor), atual => ({ ...atual, status_pagamento: valor })),
              })}
            />
            <AvisoWhatsApp estado={detalhe.aviso_status_estado ?? (detalhe.status === 'pronto' ? detalhe.aviso_pronto_estado : null)} />
            {detalhe.status_pagamento === 'pago' ? <AvisoWhatsApp estado={detalhe.aviso_pagamento_estado} pagamento /> : null}
            {erro ? (
              <p role="alert" className="rounded-campo bg-areia px-3 py-2 text-sm font-semibold text-carameloForte">
                {erro}
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      {detalhe && !carregando ? (
        <AcoesPedido
          detalhe={detalhe}
          agindo={agindo}
          key={detalhe.id}
          aoAvancar={() => {
            const proximo = proximoStatus(detalhe.status, detalhe.tipo_recebimento);
            if (proximo) definirConfirmacao({
              titulo: 'Avançar pedido #' + detalhe.id,
              mensagem: 'Confirma a mudança de ' + rotuloStatus(detalhe.status) + ' para ' + rotuloStatus(proximo) + '? O cliente poderá receber um aviso. Confira antes de continuar.',
              executar: () => agir(() => aoMudarStatus(detalhe.id, proximo, detalhe.status), atual => ({ ...atual, status:proximo })),
            });
          }}
          aoConcluir={codigo => definirConfirmacao({
            titulo: detalhe.tipo_recebimento === 'entrega' ? 'Confirmar entrega recebida' : 'Confirmar retirada do cliente',
            mensagem: 'Confirma que o cliente recebeu o pedido #' + detalhe.id + ' e informou este código? O sistema validará o código antes de concluir.',
            executar: () => agir(() => aoConcluirComCodigo(detalhe.id, codigo), atual => ({ ...atual, status:'entregue' })),
          })}
          aoCancelar={() => definirConfirmacao({
            titulo: 'Cancelar pedido #' + detalhe.id,
            mensagem: 'O preparo ainda não começou. Confirma o cancelamento? O estoque será devolvido. Se o pedido estiver pago, será necessário efetuar e registrar o reembolso.',
            executar: () => agir(() => aoMudarStatus(detalhe.id, 'cancelado', detalhe.status), atual => ({ ...atual, status:'cancelado' })),
          })}
        />
      ) : null}
    </aside>
      {confirmacao ? <ModalConfirmacao
        titulo={confirmacao.titulo}
        mensagem={confirmacao.mensagem}
        textoConfirmar="Sim, confirmar"
        processando={agindo}
        aoFechar={() => { if (!agindo) definirConfirmacao(null); }}
        aoConfirmar={() => { if (!emAcao.current) { const executar = confirmacao.executar; definirConfirmacao(null); void executar(); } }}
      /> : null}
    </>, document.body
  );
}
