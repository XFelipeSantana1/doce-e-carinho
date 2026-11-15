import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAutenticacao } from '../hooks/useAutenticacao';
import { useResumo } from '../hooks/useResumo';
import { Botao } from '../components/ui/Botao';
import { Estado } from '../components/ui/Badge';
import { PainelSecao, Indicadores } from '../components/PainelSecao';
import { CabecalhoSecao } from '../components/CabecalhoSecao';
import { GraficoVendas } from '../components/GraficoVendas';
import { ListaMaisVendidos } from '../components/ListaMaisVendidos';
import { UltimosPedidos } from '../components/UltimosPedidos';
import { formatarMoeda } from '../lib/formatarMoeda';
import { rotuloStatus, TOM_ESTADO } from '../lib/pedido';
import { PERIODOS, usePeriodo, vendasPorDia } from '../lib/periodo';
export function Resumo():JSX.Element {
 const {sessao,sair}=useAutenticacao();
 const {pedidos,baixoEstoque,maisVendidos,carregando,erro,precisaLogin,buscarNovamente}=useResumo(sessao?.token??null);
 const [periodo,definirPeriodo]=usePeriodo();
 useEffect(()=>{if(precisaLogin)sair();},[precisaLogin,sair]);
 const dias=useMemo(()=>vendasPorDia(pedidos,periodo),[pedidos,periodo]);
 const total=dias.reduce((s,d)=>s+d.total,0),quantidade=dias.reduce((s,d)=>s+d.quantidade,0);
 const melhor=dias.length?dias.reduce((a,b)=>a.total>b.total?a:b).rotulo:'—';
 const aguardando=pedidos.filter(p=>p.status==='pendente'&&p.status_pagamento!=='pago');
 const preparo=pedidos.filter(p=>p.status==='em_preparo');
 const prontos=pedidos.filter(p=>['pronto','saiu_para_entrega'].includes(p.status));
 const ativos=pedidos.filter(p=>!['entregue','cancelado'].includes(p.status));
 const solicitacoes=pedidos.filter(p=>p.status==='pendente'&&p.cancelamento_solicitado_em);
 return <div className="admin-page">
  <CabecalhoSecao titulo="Visão geral" descricao="Acompanhe o que precisa de atenção na confeitaria." acao={<span className="text-xs text-textoSuave">{new Date().toLocaleDateString('pt-BR',{day:'numeric',month:'long',weekday:'long'})}</span>}/>
  {carregando?<div className="admin-panel admin-panel-empty" role="status">Atualizando a visão geral…</div>:erro?<div className="admin-panel admin-panel-empty"><p role="alert">{erro}</p><Botao variante="texto" onClick={buscarNovamente}>Tentar novamente</Botao></div>:<>
   <Indicadores itens={[{rotulo:'Aguardando pagamento',valor:aguardando.length,descricao:'Preparo ainda bloqueado',para:'/painel/pedidos?status=pagamento'},{rotulo:'Em preparo',valor:preparo.length,descricao:'Na fila de produção',para:'/painel/pedidos?status=em_preparo'},{rotulo:'Prontos / em entrega',valor:prontos.length,descricao:'Aguardando recebimento',para:'/painel/pedidos?status=prontos'}]}/>
   {solicitacoes.length?<div className="admin-priority" role="alert"><div><strong>{solicitacoes.length} {solicitacoes.length===1?'solicitação de cancelamento':'solicitações de cancelamento'}</strong><p>Confira com o cliente antes de liberar o preparo.</p></div><Link className="admin-text-link" to={'/painel/pedidos?pedido='+solicitacoes[0].id}>Resolver solicitação →</Link></div>:null}
   <div className="admin-dashboard-grid">
    <PainelSecao titulo="Fila de trabalho" descricao="Pedidos em andamento, com pagamento e produção separados." acao={<Link className="admin-text-link" to="/painel/pedidos">Ver todos →</Link>}>
     {ativos.length?ativos.slice(0,5).map(p=><Link key={p.id} to={'/painel/pedidos?pedido='+p.id} className="admin-summary-row"><div><strong>#{p.id} · {p.cliente_nome??'Cliente'}</strong><small>{p.tipo_recebimento==='entrega'?'Entrega':'Retirada'} · {formatarMoeda(p.valor_total)}</small></div><div className="flex flex-wrap justify-end gap-1"><Estado tom={p.status_pagamento==='pago'?'ok':'alerta'}>{p.status_pagamento==='pago'?'Pago':'A receber'}</Estado><Estado tom={TOM_ESTADO[p.status]??'suave'}>{rotuloStatus(p.status)}</Estado></div></Link>):<div className="admin-panel-empty"><strong>Nenhum pedido em andamento</strong>Os novos pedidos aparecerão aqui, da confirmação ao recebimento.</div>}
    </PainelSecao>
    <PainelSecao titulo="Reposição de estoque" descricao={baixoEstoque.length+' insumos no limite ou abaixo do mínimo.'} acao={<Link className="admin-text-link" to="/painel/insumos">Ver insumos →</Link>}>
     {baixoEstoque.length?baixoEstoque.slice(0,4).map(i=><div className="admin-summary-row" key={i.id}><div><strong>{i.nome}</strong><small>Mínimo: {i.quantidade_minima} {i.unidade_medida}</small></div><Estado tom="alerta">{i.quantidade_atual} {i.unidade_medida} disponíveis</Estado></div>):<div className="admin-panel-empty"><strong>Estoque dentro dos limites</strong>Nenhum ingrediente precisa de reposição neste momento.</div>}
    </PainelSecao>
   </div>
   <PainelSecao titulo="Vendas no período" descricao="Resultado comercial separado da fila de produção." acao={<div className="admin-period-control flex flex-wrap gap-1" role="group" aria-label="Filtrar vendas por período">{PERIODOS.map(p=><button key={p.valor} onClick={()=>definirPeriodo(p.valor)} aria-pressed={periodo===p.valor}>{p.rotulo}</button>)}</div>}>
    <div className="admin-money-strip"><div><span>Valor das vendas</span><strong>{formatarMoeda(total)}</strong></div><div><span>Pedidos no período</span><strong>{quantidade}</strong></div><div><span>Melhor dia de vendas</span><strong>{total>0?melhor:'—'}</strong></div></div>
    <div className="admin-panel-body">{dias.length===1?<div className="admin-single-sale"><span>{dias[0].rotulo}</span><strong>{formatarMoeda(dias[0].total)}</strong></div>:<GraficoVendas dias={dias}/>}</div>
   </PainelSecao>
   <div className="admin-dashboard-grid"><PainelSecao titulo="Últimos pedidos" descricao="Acesse diretamente o pedido que deseja conferir."><div className="admin-panel-body"><UltimosPedidos pedidos={pedidos}/></div></PainelSecao><PainelSecao titulo="Mais vendidos" descricao="Produtos com mais unidades vendidas."><div className="admin-panel-body"><ListaMaisVendidos itens={maisVendidos}/></div></PainelSecao></div>
  </>}
 </div>;
}
