import { useCallback } from "react";
import { MessageCircle, X } from "lucide-react";
import type { ItemCarrinho } from "../types";
import type { DadosRecebimento } from "../lib/recebimento";
import { validarRecebimento } from "../lib/recebimento";
import { formatarMoeda } from "../lib/formatarMoeda";
import { ItemSacola } from "./ItemSacola";
import { RecebimentoPedido } from "./RecebimentoPedido";
import { useDialogo } from "../hooks/useDialogo";
interface Props {
    aberto: boolean;
    itens: ItemCarrinho[];
    total: number;
    nomeCliente: string;
    observacao: string;
    recebimento: DadosRecebimento;
    aoMudarRecebimento: (dados: DadosRecebimento) => void;
    aoMudarNome: (nome: string) => void;
    aoMudarObservacao: (texto: string) => void;
    aoAlterarQuantidade: (id: number, n: number) => void;
    aoRemover: (id: number) => void;
    aoFechar: () => void;
    aoFinalizar: () => void;
    aoVerCardapio: () => void;
}
export function CarrinhoDrawer(p: Props): JSX.Element | null {
    const fechar = useCallback(() => p.aoFechar(), [p.aoFechar]);
    const ref = useDialogo(p.aberto, fechar);
    if (!p.aberto)
        return null;
    const unidades = p.itens.reduce((s, i) => s + i.quantidade, 0), erro = validarRecebimento(p.recebimento);
    return <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Sacola de pedidos" className="loja-sacola"><header className="loja-sacola-cabecalho"><div><p className="text-xs font-semibold text-carameloForte">Confira antes de enviar</p><h2 className="font-display text-2xl font-bold">Sua sacola</h2><p className="mt-1 text-sm text-textoSuave">{unidades} {unidades === 1 ? 'item escolhido' : 'itens escolhidos'}</p></div><button onClick={p.aoFechar} aria-label="Fechar sacola" className="loja-icone"><X size={20}/></button></header><div className="loja-sacola-conteudo">{p.itens.length === 0 ? <div className="py-12 text-center"><h3 className="font-display text-2xl font-bold">Seu próximo favorito está no cardápio</h3><p className="mt-3 text-sm text-textoSuave">Escolha um doce para começar sua sacola.</p><button className="loja-acao mt-5" onClick={p.aoVerCardapio}>Explorar cardápio</button></div> : <><section className="loja-grupo"><h4>1. Seus doces</h4><div className="divide-y divide-borda">{p.itens.map(item => <ItemSacola key={item.produto.id} item={item} aoAlterarQuantidade={p.aoAlterarQuantidade} aoRemover={p.aoRemover}/>)}</div><button onClick={p.aoVerCardapio} className="loja-detalhes min-h-11">+ Escolher mais doces</button></section><RecebimentoPedido dados={p.recebimento} aoMudar={p.aoMudarRecebimento}/><section className="loja-grupo"><h4>Seus dados</h4><label className="loja-campo">Seu nome<input value={p.nomeCliente} onChange={e => p.aoMudarNome(e.target.value)} placeholder="Como podemos chamar você?" autoComplete="name"/></label><label className="loja-campo mt-3">Observações <span className="font-normal">(opcional)</span><textarea value={p.observacao} onChange={e => p.aoMudarObservacao(e.target.value)} placeholder="Algum detalhe sobre o pedido?" rows={2}/></label></section></>}</div>{p.itens.length > 0 && <footer className="loja-sacola-rodape"><div className="flex items-baseline justify-between gap-3"><span className="text-sm text-textoSuave">Subtotal dos produtos</span><b className="font-numero text-2xl">{formatarMoeda(p.total)}</b></div><p className="mt-1 text-xs text-textoSuave">{p.recebimento.tipo === 'entrega' ? 'Taxa de entrega a confirmar na conversa.' : 'Retirada na loja, sem taxa de entrega.'}</p>{erro && <p className="mt-2 text-xs text-carameloForte" role="status">{erro}</p>}<button className="loja-acao loja-whats mt-3 w-full" onClick={p.aoFinalizar} disabled={!!erro}><MessageCircle size={19}/>Continuar no WhatsApp</button><p className="mt-2 text-center text-xs text-textoSuave">A mensagem vai pronta. Envie para confirmar com a loja.</p></footer>}</div>;
}
