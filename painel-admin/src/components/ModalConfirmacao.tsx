import { useEffect, useRef } from "react";
import { Botao } from "./ui/Botao";

// Confirmação com a cara do painel (substitui confirm()/alert() nativos):
// título, explicação do impacto e botões claros. Perigo usa terracota.
interface PropriedadesModalConfirmacao {
  titulo: string;
  mensagem: string;
  textoConfirmar?: string;
  processando?: boolean;
  erro?: string | null;
  aoFechar: () => void;
  aoConfirmar: () => void;
}

export function ModalConfirmacao({
  titulo,
  mensagem,
  textoConfirmar = "Confirmar",
  processando = false,
  erro = null,
  aoFechar,
  aoConfirmar,
}: PropriedadesModalConfirmacao): JSX.Element {
  const dialogo = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    dialogo.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => anterior?.focus();
  }, []);
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-tinta/50 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-label={titulo}
      ref={dialogo}
      onKeyDown={evento => {
        if (evento.key !== 'Tab') return;
        const botoes = dialogo.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        if (!botoes?.length) return;
        const primeiro = botoes[0], ultimo = botoes[botoes.length - 1];
        if (evento.shiftKey && document.activeElement === primeiro) { evento.preventDefault(); ultimo.focus(); }
        else if (!evento.shiftKey && document.activeElement === ultimo) { evento.preventDefault(); primeiro.focus(); }
      }}
      onClick={() => { if (!processando) aoFechar(); }}
    >
      <div
        className="w-full max-w-sm rounded-card bg-white p-6 text-tinta shadow-flutuante"
        onClick={(evento) => evento.stopPropagation()}
      >
        <h3 className="text-base font-semibold">{titulo}</h3>
        <p className="mt-1 text-sm text-textoSuave">{mensagem}</p>
        {erro ? (
          <p role="alert" className="mt-3 text-sm text-perigo">
            Erro: {erro}
          </p>
        ) : null}
        {/* 5.8: coluna no celular com o DESTRAIVO em cima (é ele que importa);
            à direita no desktop. */}
        <div className="mt-5 flex flex-col-reverse gap-2 md:flex-row md:justify-end">
          <Botao
            variante="secundario"
            onClick={aoFechar}
            disabled={processando}
            className="w-full md:w-auto"
          >
            Voltar
          </Botao>
          <Botao
            variante="destrutivo"
            onClick={aoConfirmar}
            disabled={processando}
            className="w-full md:w-auto"
          >
            {processando ? "Aguarde…" : textoConfirmar}
          </Botao>
        </div>
      </div>
    </div>
  );
}
