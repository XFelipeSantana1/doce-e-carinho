import { useEffect, useRef } from "react";
export function useDialogo(aberto: boolean, fechar: () => void) {
    const ref = useRef<HTMLDivElement>(null);
    const fecharAtual = useRef(fechar);
    fecharAtual.current = fechar;
    useEffect(() => {
        if (!aberto)
            return;
        const anterior = document.activeElement as HTMLElement | null;
        const overflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        ref.current?.focus();
        function teclado(e: KeyboardEvent) {
            if (e.key === "Escape") {
                e.preventDefault();
                fecharAtual.current();
            }
            if (e.key !== "Tab")
                return;
            const campos = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, textarea, a[href], [tabindex="0"]') ?? []).filter(el => el.getClientRects().length > 0);
            const primeiro = campos[0], ultimo = campos[campos.length - 1];
            if (!primeiro) {
                e.preventDefault();
                return;
            }
            if (e.shiftKey && (document.activeElement === primeiro || document.activeElement === ref.current)) {
                e.preventDefault();
                ultimo.focus();
            }
            else if (!e.shiftKey && (document.activeElement === ultimo || document.activeElement === ref.current)) {
                e.preventDefault();
                primeiro.focus();
            }
        }
        document.addEventListener("keydown", teclado);
        return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", teclado); anterior?.focus(); };
    }, [aberto]);
    return ref;
}
