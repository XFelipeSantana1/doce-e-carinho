import type { ReactNode } from 'react';
const DESCRICOES:Record<string,string>={Pedidos:'Confira pagamento, produção e recebimento em cada pedido.',Produtos:'Organize o catálogo, os preços e a visibilidade na vitrine.',Insumos:'Acompanhe o estoque e identifique o que precisa de reposição.',Histórico:'Confira quem fez cada alteração e o que mudou.'};
export function CabecalhoSecao({titulo,acao,descricao}:{titulo:string;acao?:ReactNode;descricao?:string}):JSX.Element {
 return <header className="admin-page-heading"><div><h1>{titulo}</h1>{(descricao??DESCRICOES[titulo])?<p>{descricao??DESCRICOES[titulo]}</p>:null}</div>{acao?<div className="admin-page-actions">{acao}</div>:null}</header>;
}
