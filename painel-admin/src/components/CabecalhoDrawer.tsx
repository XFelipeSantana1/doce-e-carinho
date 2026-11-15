import {X} from 'lucide-react';
import {rotuloStatus,TOM_ESTADO} from '../lib/pedido';
import {Estado} from './ui/Badge';
export function CabecalhoDrawer({pedidoId,status,aoFechar}:{pedidoId:number;status:string|null;aoFechar:()=>void}):JSX.Element {
 return <header className="admin-order-header"><div><p>Detalhes do pedido</p><h2 id={'pedido-titulo-'+pedidoId}>Pedido #{pedidoId}</h2>{status?<Estado tom={TOM_ESTADO[status]??'suave'} className="mt-3">{rotuloStatus(status)}</Estado>:null}</div><button className="admin-order-close" onClick={aoFechar} aria-label="Fechar pedido e voltar à lista"><X size={20} strokeWidth={1.5} aria-hidden="true"/></button></header>;
}
