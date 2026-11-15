import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAutenticacao } from '../hooks/useAutenticacao';
import { usePedidos } from '../hooks/usePedidos';
import { rotuloStatus } from '../lib/pedido';
import { EsqueletoTabela } from '../components/ui/EsqueletoTabela';
import { Botao } from '../components/ui/Botao';
import { CartaoPedido } from '../components/CartaoPedido';
import { TabelaPedidos } from '../components/TabelaPedidos';
import { DrawerPedido } from '../components/DrawerPedido';
import { CabecalhoSecao } from '../components/CabecalhoSecao';
import { PainelSecao, Indicadores } from '../components/PainelSecao';
const ABAS=['todos','pagamento','pendente','em_preparo','prontos','entregue','cancelado'];
export function Pedidos():JSX.Element {
 const {sessao,sair}=useAutenticacao();
 const {todos,filtro,definirFiltro,carregando,erro,precisaLogin,buscarNovamente,mudarStatus,concluirComCodigo,mudarPagamento}=usePedidos(sessao?.token??null);
 const [abertoId,definirAbertoId]=useState<number|null>(null),[termo,definirTermo]=useState('');
 const [params]=useSearchParams();
 useEffect(()=>{if(precisaLogin)sair();},[precisaLogin,sair]);
 useEffect(()=>{const status=params.get('status');if(status&&(ABAS.includes(status)||status==='prontos'))definirFiltro(status);const id=Number(params.get('pedido'));if(Number.isInteger(id)&&id>0)definirAbertoId(id);},[params,definirFiltro]);
 const aguardando=todos.filter(p=>p.status==='pendente'&&p.status_pagamento!=='pago');
 const prontos=todos.filter(p=>['pronto','saiu_para_entrega'].includes(p.status));
 const solicitacoes=todos.filter(p=>p.status==='pendente'&&p.cancelamento_solicitado_em);
 const contagens=useMemo(()=>{const m=new Map<string,number>();todos.forEach(p=>m.set(p.status,(m.get(p.status)??0)+1));return m;},[todos]);
 const alvo=termo.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const pedidos=todos.filter(p=>(filtro==='todos'||filtro==='pagamento'&&p.status==='pendente'&&p.status_pagamento!=='pago'||filtro==='prontos'&&['pronto','saiu_para_entrega'].includes(p.status)||p.status===filtro)&&(!alvo||(p.id+' '+(p.cliente_nome??'')).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(alvo)));
 return <div className="admin-page">
  <CabecalhoSecao titulo="Pedidos" acao={<Botao variante="secundario" onClick={buscarNovamente} carregando={carregando}>Atualizar</Botao>}/>
  <Indicadores itens={[{rotulo:'Aguardando pagamento',valor:aguardando.length,descricao:'Preparo bloqueado'},{rotulo:'Em preparo',valor:contagens.get('em_preparo')??0,descricao:'Na fila de produção'},{rotulo:'Prontos / em entrega',valor:prontos.length,descricao:'Aguardando recebimento'}]}/>
  {solicitacoes.length?<div className="admin-priority" role="alert"><div><strong>Cancelamento solicitado pelo cliente</strong><p>O preparo está bloqueado nos pedidos {solicitacoes.map(p=>'#'+p.id).join(', ')}.</p></div><button className="admin-text-link" onClick={()=>definirAbertoId(solicitacoes[0].id)}>Ver solicitação →</button></div>:null}
  <PainelSecao titulo="Lista de pedidos" descricao="Abra um pedido para conferir os itens e realizar ações com confirmação.">
   <div className="admin-toolbar"><label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-textoSuave">Buscar pedido<input className="admin-select w-full" type="search" value={termo} onChange={e=>definirTermo(e.target.value)} placeholder="Número do pedido ou nome do cliente"/></label><span className="text-xs text-textoSuave">{pedidos.length} {pedidos.length===1?'pedido':'pedidos'}</span></div>
   <div className="admin-filters" role="group" aria-label="Filtrar pedidos por etapa">{ABAS.map(aba=><button key={aba} aria-pressed={filtro===aba} onClick={()=>definirFiltro(aba)}>{aba==='todos'?'Todos':aba==='pagamento'?'Aguardando pagamento':aba==='prontos'?'Prontos / em entrega':rotuloStatus(aba)}<span>{aba==='todos'?todos.length:aba==='pagamento'?aguardando.length:aba==='prontos'?prontos.length:contagens.get(aba)??0}</span></button>)}</div>
   {carregando?<div className="admin-panel-body"><EsqueletoTabela linhas={4}/></div>:erro?<div className="admin-panel-empty"><p role="alert">{erro}</p><Botao variante="texto" onClick={buscarNovamente}>Tentar novamente</Botao></div>:!pedidos.length?<div className="admin-panel-empty"><strong>Nenhum pedido neste filtro</strong>Escolha outra etapa ou altere a busca para encontrar um pedido.</div>:<><ul className="divide-y divide-borda md:hidden">{pedidos.map(p=><CartaoPedido key={p.id} pedido={p} aoAbrir={p=>definirAbertoId(p.id)}/>)}</ul><TabelaPedidos pedidos={pedidos} aoAbrir={p=>definirAbertoId(p.id)}/></>}
  </PainelSecao>
  <DrawerPedido pedidoId={abertoId} token={sessao?.token??''} aoFechar={()=>definirAbertoId(null)} aoMudarStatus={mudarStatus} aoConcluirComCodigo={concluirComCodigo} aoMudarPagamento={mudarPagamento}/>
 </div>;
}
