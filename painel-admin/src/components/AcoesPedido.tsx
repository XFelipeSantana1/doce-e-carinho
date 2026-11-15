import { useState } from "react";
import { ArrowRight, KeyRound } from "lucide-react";
import type { DetalhePedido } from "../types";
import { proximoStatus, rotuloStatus } from "../lib/pedido";
import { Botao } from "./ui/Botao";
import { Entrada } from "./ui/Entrada";

// Rodapé fixo do drawer (5.2): avançar no fluxo e cancelar (com estorno).
// Sem próximo (entregue/cancelado) não há botão de avanço; entregue também
// esconde o cancelar — decisão visível aqui, não espalhada.
//
// "Cancelar pedido" fica à ESQUERDA como ação em texto/perigo: cancelar não
// compete em peso com o avanço, que é o trabalho do dia. Ícones saíram —
// a palavra já diz a ação; o confirmão continua morando no
// ModalConfirmacao, como antes.
//
// O passo FINAL (entregue) não é um botão: é um CÓDIGO. O cliente recebeu
// 4 dígitos no WhatsApp quando o pedido ficou pronto — o gestor digita o que
// o cliente/motoboy informou e a API só baixa se o código bater. Sem isso,
// qualquer clique concluía pedido que ainda estava nas mãos de alguém.
interface PropriedadesAcoesPedido {
  detalhe: DetalhePedido;
  agindo: boolean;
  aoAvancar: () => void;
  aoConcluir: (codigo: string) => void;
  aoCancelar: () => void;
}

export function AcoesPedido({
  detalhe,
  agindo,
  aoAvancar,
  aoConcluir,
  aoCancelar,
}: PropriedadesAcoesPedido): JSX.Element | null {
  const proximo = proximoStatus(detalhe.status, detalhe.tipo_recebimento);
  const podeCancelar = detalhe.status === "pendente";
  const bloqueado = detalhe.status_pagamento !== "pago" || Boolean(detalhe.cancelamento_solicitado_em) || (detalhe.tipo_recebimento === "entrega" && detalhe.forma_pagamento !== "pix");
  // Estado local do código: mora AQUI (e não no hook) porque só este rodapé
  // o usa; trocar de drawer descarta o rascunho, que é o desejado.
  const [codigo, definirCodigo] = useState("");
  const codigoValido = /^\d{4}$/.test(codigo);

  if (!proximo && !podeCancelar) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-borda bg-white p-4">
      {bloqueado && proximo ? <p role="status" className="w-full text-sm text-perigo">{detalhe.cancelamento_solicitado_em ? "Resolva a solicitação de cancelamento antes de avançar." : detalhe.status_pagamento !== "pago" ? "Confirme o pagamento para liberar o preparo e a conclusão." : "Entrega em domicílio exige Pix."}</p> : null}
      {podeCancelar ? (
        <Botao
          variante="perigo"
          disabled={agindo}
          onClick={aoCancelar}
          className="flex-none"
          title="Cancela e estorna o estoque"
        >
          Cancelar pedido
        </Botao>
      ) : null}
      {proximo && proximo !== "entregue" ? (
        <Botao disabled={agindo || bloqueado} onClick={aoAvancar} className="flex-1">
          {agindo ? "Salvando…" : `Avançar para ${rotuloStatus(proximo)}`}
          {/* A seta é a DIREÇÃO do fluxo (a própria ação é "avançar"): quem
              toca sabe para onde o pedido vai sem ler duas vezes. */}
          {!agindo ? <ArrowRight size={17} strokeWidth={1.5} aria-hidden="true" /> : null}
        </Botao>
      ) : null}
      {proximo === "entregue" ? (
        // Conclusão exige o código de confirmação. O botão só liga com 4
        // dígitos: o erro de "faltou código" morre no teclado, sem 409.
        <div className="flex-1 flex items-end gap-2">
          <Entrada
            rotulo="Código do cliente"
            id={`codigo-pedido-${detalhe.id}`}
            className="flex-1"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            placeholder="0000"
            value={codigo}
            disabled={agindo}
            onChange={(evento) => definirCodigo(evento.target.value.replace(/\D/g, "").slice(0, 4))}
          />
          <Botao
            disabled={agindo || bloqueado || !codigoValido}
            onClick={() => aoConcluir(codigo)}
            className="flex-none"
          >
            {agindo ? "Conferindo…" : "Concluir"}
            {/* A chave marca que esta ação é "provar que tem o código": o
                cliente recebeu, o gestor digitou, a API conferiu. */}
            {!agindo ? <KeyRound size={16} strokeWidth={1.5} aria-hidden="true" /> : null}
          </Botao>
        </div>
      ) : null}
    </div>
  );
}
