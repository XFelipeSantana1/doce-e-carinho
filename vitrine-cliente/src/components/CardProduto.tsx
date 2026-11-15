import { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Plus, Minus } from "lucide-react";
import type { Produto } from "../types";
import { estaDisponivel } from "../lib/disponibilidade";
import { imagemParaProduto } from "../lib/aparenciaProduto";
import { formatarMoeda } from "../lib/formatarMoeda";
import { useDialogo } from "../hooks/useDialogo";
interface Props {
    produto: Produto;
    quantidadeNaSacola: number;
    aoAdicionar: (id: number) => void;
    aoAlterarQuantidade: (id: number, n: number) => void;
    aoRemover: (id: number) => void;
}
export function CardProduto({ produto, quantidadeNaSacola, aoAdicionar, aoAlterarQuantidade }: Props): JSX.Element {
    const [aberto, setAberto] = useState(false), [quantidade, setQuantidade] = useState(1), [falha, setFalha] = useState(false);
    const fechar = useCallback(() => setAberto(false), []);
    const ref = useDialogo(aberto, fechar);
    const disponivel = estaDisponivel(produto), imagem = imagemParaProduto(produto);
    const limite = produto.quantidadeDisponivel === undefined ? 99 : Math.max(0, produto.quantidadeDisponivel - quantidadeNaSacola);
    const foto = <>{imagem && !falha ? <img src={imagem} alt={produto.nome} loading="lazy" onError={() => setFalha(true)}/> : <span className="font-display text-textoSuave">{produto.nome}</span>}</>;
    function abrir() { setQuantidade(1); setAberto(true); }
    return <><article className="loja-produto"><button className="loja-produto-foto" onClick={abrir} aria-label={"Ver detalhes de " + produto.nome}>{foto}{!disponivel && <span className="loja-etiqueta">Indisponível</span>}</button><div className="loja-produto-corpo"><button onClick={abrir} className="text-left"><h3 className="font-display text-xl font-semibold">{produto.nome}</h3></button><p className="loja-descricao">{produto.descricao}</p><button onClick={abrir} className="loja-detalhes">Ver detalhes →</button><div className="loja-produto-preco"><b className="font-numero text-lg text-carameloForte">{formatarMoeda(produto.preco)}</b><span className="text-xs text-textoSuave">{quantidadeNaSacola > 0 ? quantidadeNaSacola + " na sacola" : "por unidade"}</span></div><button className="loja-acao w-full" disabled={!disponivel || limite <= 0} onClick={() => aoAdicionar(produto.id)} aria-label={"Adicionar " + produto.nome + " à sacola"}><Plus size={17}/>{!disponivel ? "Indisponível" : limite <= 0 ? "Limite na sacola" : "Adicionar"}</button></div></article>{aberto && createPortal(<div className="loja-modal-fundo" onClick={fechar}><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={produto.nome} className="loja-modal-produto" onClick={e => e.stopPropagation()}><button className="loja-fechar" onClick={fechar} aria-label="Fechar detalhes"><X size={20}/></button><div className="loja-modal-foto">{foto}</div><div className="p-5 sm:p-7"><p className="text-xs font-semibold text-carameloForte">{produto.categoria ?? "Da nossa confeitaria"}</p><h2 className="mt-2 font-display text-3xl font-bold">{produto.nome}</h2><p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-textoSuave">{produto.descricao}</p><p className="mt-4 font-numero text-xl font-semibold">{formatarMoeda(produto.preco)} <span className="text-xs font-normal text-textoSuave">por unidade</span></p><div className="mt-6 flex flex-wrap items-center gap-3"><div className="loja-quantidade"><button aria-label="Diminuir quantidade" disabled={quantidade <= 1} onClick={() => setQuantidade(n => n - 1)}><Minus size={17}/></button><output aria-label="Quantidade">{quantidade}</output><button aria-label="Aumentar quantidade" disabled={quantidade >= limite} onClick={() => setQuantidade(n => n + 1)}><Plus size={17}/></button></div><button className="loja-acao flex-1" disabled={!disponivel || limite <= 0} onClick={() => { aoAlterarQuantidade(produto.id, Math.min(quantidade, limite)); fechar(); }}>{!disponivel ? "Indisponível" : limite <= 0 ? "Limite na sacola" : "Adicionar · " + formatarMoeda(produto.preco * Math.min(quantidade, limite))}</button></div></div></div></div>, document.body)}</>;
}
