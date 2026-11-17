interface Props {
    aoComoFunciona: () => void;
}
export function Abertura({ aoComoFunciona }: Props): JSX.Element {
    return <section className="loja-abertura mx-auto max-w-6xl px-5"><div><p className="text-sm font-semibold text-carameloForte">Feito à mão, escolhido por você</p><h1 className="font-display font-bold">Um carinho em forma de doce.</h1><p className="mt-3 max-w-lg text-textoSuave">Encontre seu favorito, monte sua sacola e combine o pedido com a gente pelo WhatsApp.</p><div className="mt-5 flex flex-wrap items-center gap-4"><a href="#cardapio" className="loja-acao">Explorar cardápio</a><button onClick={aoComoFunciona} className="min-h-11 text-sm font-semibold underline underline-offset-4">Como pedir</button></div></div><div className="loja-foto-abertura"><img src="/fotos/brigadeiro.jpg" alt="Brigadeiros artesanais" width="900" height="600" fetchPriority="high"/></div></section>;
}
