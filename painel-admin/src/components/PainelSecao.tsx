import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
export function PainelSecao({titulo,descricao,acao,children,className=''}:{titulo:string;descricao?:string;acao?:ReactNode;children:ReactNode;className?:string}):JSX.Element {
 return <section className={'admin-panel '+className}><header className="admin-panel-heading"><div><h2>{titulo}</h2>{descricao?<p>{descricao}</p>:null}</div>{acao}</header>{children}</section>;
}
export function Indicadores({itens}:{itens:{rotulo:string;valor:string|number;descricao:string;para?:string}[]}):JSX.Element {
 return <div className="admin-indicators">{itens.map(item=>{const conteudo=<><span>{item.rotulo}</span><strong>{item.valor}</strong><small>{item.descricao}</small></>;return item.para?<Link key={item.rotulo} to={item.para} className="admin-indicator">{conteudo}</Link>:<div key={item.rotulo} className="admin-indicator">{conteudo}</div>;})}</div>;
}
