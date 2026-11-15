import type {Pedido} from '../types';
import {formatarMoeda} from '../lib/formatarMoeda';
import {formatarQuando} from '../lib/formatarData';
import {rotuloStatus,rotuloPagamento,TOM_ESTADO} from '../lib/pedido';
import {Estado} from './ui/Badge';
export function CartaoPedido({pedido:p,aoAbrir}:{pedido:Pedido;aoAbrir:(pedido:Pedido)=>void}):JSX.Element {
 return <li><button className="admin-order-card" aria-label={'Ver pedido #'+p.id+' de '+(p.cliente_nome??'Cliente')} onClick={()=>aoAbrir(p)}><span className="admin-order-card-top"><span className="min-w-0"><strong className="block text-sm font-medium">#{p.id} · {p.cliente_nome??'Cliente'}</strong><span className="mt-1 block text-xs text-textoSuave">{p.tipo_recebimento==='entrega'?'Entrega':'Retirada'} · {formatarQuando(p.criado_em)}</span></span><b className="flex-none font-numero text-sm font-semibold">{formatarMoeda(p.valor_total)}</b></span><span className="admin-order-card-states"><Estado tom={p.status_pagamento==='pago'?'ok':p.status_pagamento==='estornado'?'suave':'alerta'}>{rotuloPagamento(p.status_pagamento)}</Estado><Estado tom={TOM_ESTADO[p.status]??'suave'}>{rotuloStatus(p.status)}</Estado>{p.cancelamento_solicitado_em&&p.status==='pendente'?<Estado tom="perigo">Cancelamento solicitado</Estado>:null}</span><span className="mt-3 block text-xs font-semibold text-carameloForte">Ver pedido →</span></button></li>;
}
