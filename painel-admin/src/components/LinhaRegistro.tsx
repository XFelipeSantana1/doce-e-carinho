import type { Registro } from '../types';
import { rotuloStatus, rotuloPagamento } from '../lib/pedido';
import { formatarMoeda } from '../lib/formatarMoeda';
import { Estado } from './ui/Badge';
const CAMPOS:Record<string,string>={status:'Etapa do pedido',status_pagamento:'Pagamento',preco:'Preço',ativo:'Visibilidade',nome:'Nome',quantidade_atual:'Estoque disponível',quantidade_minima:'Estoque mínimo',custo_unitario:'Custo por unidade',imagem_url:'Imagem',categoria_id:'Categoria',descricao:'Descrição'};
function texto(campo:string,valor:unknown):string {
 if(valor===null||valor===undefined||valor==='')return 'Não informado';
 if(campo==='ativo')return Number(valor)?'Visível':'Oculto';
 if(campo==='status')return rotuloStatus(String(valor));
 if(campo==='status_pagamento')return rotuloPagamento(String(valor));
 if(['preco','custo_unitario'].includes(campo))return formatarMoeda(Number(valor));
 return typeof valor==='object'?JSON.stringify(valor):String(valor);
}
export function LinhaRegistro({registro}:{registro:Registro}):JSX.Element {
 const campos=[...new Set([...Object.keys(registro.antes??{}),...Object.keys(registro.depois??{})])];
 const mudancas=campos.filter(campo=>JSON.stringify(registro.antes?.[campo]??null)!==JSON.stringify(registro.depois?.[campo]??null));
 const data=new Date(registro.criado_em);
 const hora=Number.isNaN(data.getTime())?'—':data.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
 return <li className="admin-log border-b border-borda last:border-0"><details><summary><time className="w-12 flex-none text-xs text-textoSuave" dateTime={registro.criado_em}>{hora}</time><span className="admin-log-description">{registro.descricao}<small>por {registro.usuario_nome}</small></span><Estado>{mudancas.length?mudancas.length+' '+(mudancas.length===1?'alteração':'alterações'):'Ver registro'}</Estado></summary><div className="admin-log-diff">{mudancas.length?mudancas.map(campo=><div key={campo}><label>{CAMPOS[campo]??campo.replace(/_/g,' ')}</label><del className="text-textoSuave">{texto(campo,registro.antes?.[campo])}</del><span aria-hidden="true">→</span><strong className="font-medium">{texto(campo,registro.depois?.[campo])}</strong></div>):<p className="text-xs text-textoSuave">Esta atividade não possui valores anteriores e atuais registrados.</p>}</div></details></li>;
}
