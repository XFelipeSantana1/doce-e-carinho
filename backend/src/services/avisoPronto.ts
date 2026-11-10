import pool from '../config/db.js';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

export type EstadoAviso = 'pendente' | 'enviando' | 'enviado' | 'falha' | 'incerto' | 'bloqueado';
interface Aviso extends RowDataPacket { whatsapp: string; aviso_pronto_estado: EstadoAviso | null; }
export interface DependenciasAviso {
  obter: (id: number) => Promise<{ whatsapp: string; aviso_pronto_estado: EstadoAviso | null } | undefined>;
  reservar: (id: number) => Promise<boolean>;
  registrar: (id: number, estado: EstadoAviso) => Promise<void>;
  enviar: (telefone: string, texto: string) => Promise<void>;
}
export class FalhaAviso extends Error {
  constructor(public estado: 'falha' | 'incerto' | 'bloqueado') { super(estado); }
}
export async function executarAvisoPronto(id: number, deps: DependenciasAviso): Promise<{ estado: EstadoAviso | null }> {
  const aviso = await deps.obter(id);
  if (!aviso || !aviso.aviso_pronto_estado) return { estado: null };
  if (aviso.aviso_pronto_estado !== 'pendente') return { estado: aviso.aviso_pronto_estado };
  if (!await deps.reservar(id)) return { estado: (await deps.obter(id))?.aviso_pronto_estado ?? 'incerto' };
  try {
    await deps.enviar(aviso.whatsapp, `Seu pedido #${id} está pronto para retirada! 🧁\nEntre em contato por aqui para combinar a retirada. Obrigado por escolher a Doce & Carinho!`);
    await deps.registrar(id, 'enviado');
    return { estado: 'enviado' };
  } catch (error) {
    // Timeout pode significar que a mensagem foi enviada. Nunca repetir às cegas.
    const estado = error instanceof FalhaAviso ? error.estado : 'incerto';
    await deps.registrar(id, estado);
    return { estado };
  }
}
const canonical = (telefone: string): string => {
  const digits = telefone.replace(/\D/g, '');
  return digits.startsWith('55') && digits.length === 13 ? digits.slice(0, 4) + digits.slice(5) : digits;
};
const reais: DependenciasAviso = {
  async obter(id) {
    const [rows] = await pool.query<Aviso[]>(
      'SELECT c.whatsapp, p.aviso_pronto_estado FROM pedidos p JOIN clientes c ON c.id = p.cliente_id WHERE p.id = ?', [id]);
    return rows[0];
  },
  async reservar(id) {
    const [result] = await pool.query<ResultSetHeader>(
      "UPDATE pedidos SET aviso_pronto_estado = 'enviando' WHERE id = ? AND status = 'pronto' AND aviso_pronto_estado = 'pendente'", [id]);
    return result.affectedRows === 1;
  },
  async registrar(id, estado) {
    await pool.query("UPDATE pedidos SET aviso_pronto_estado = ?, aviso_pronto_enviado_em = IF(? = 'enviado', CURRENT_TIMESTAMP, aviso_pronto_enviado_em) WHERE id = ?", [estado, estado, id]);
  },
  async enviar(telefone, texto) {
    const base = process.env.WAHA_URL;
    const key = process.env.WAHA_API_KEY;
    const autorizado = process.env.BOT_TEST_PHONE;
    if (!base || !key || !autorizado) throw new FalhaAviso('falha');
    if (canonical(telefone) !== canonical(autorizado)) throw new FalhaAviso('bloqueado');
    if (!/^\d{10,15}$/.test(telefone)) throw new FalhaAviso('falha');
    const headers = { 'X-Api-Key': key, 'Content-Type': 'application/json' };
    // Resolver o contato antes do envio trata números brasileiros e identificadores LID.
    let chatId: string;
    try {
      const check = await fetch(`${base}/api/contacts/check-exists?session=default&phone=${encodeURIComponent(telefone)}`, { headers, signal: AbortSignal.timeout(8000) });
      if (!check.ok) throw new FalhaAviso('falha');
      const contato = await check.json() as { numberExists?: boolean; chatId?: string };
      if (!contato.numberExists || !contato.chatId) throw new FalhaAviso('falha');
      chatId = contato.chatId;
    } catch { throw new FalhaAviso('falha'); } // Nenhum envio foi tentado ainda.
    const response = await fetch(`${base}/api/sendText`, { method: 'POST', headers,
      body: JSON.stringify({ session: 'default', chatId, text: texto }), signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new FalhaAviso(response.status >= 500 ? 'incerto' : 'falha');
  },
};
export async function notificarPedidoPronto(id: number): Promise<{ estado: EstadoAviso | null }> {
  try { return await executarAvisoPronto(id, reais); }
  catch { console.error('[aviso-pronto] Não foi possível verificar o envio do pedido', id); return { estado: 'incerto' }; }
}

export function mensagemStatus(id: number, status: string, tipo: string): string {
  const entrega = tipo === 'entrega';
  const mensagens: Record<string, string> = {
    pagamento_confirmado: `Pagamento do pedido #${id} confirmado! Obrigado.`,
    em_preparo: `Seu pedido #${id} está em preparo! 🧁`,
    pronto: entrega ? `Pedido #${id} pronto, aguardando a saída para entrega.` : `Pedido #${id} pronto para retirada! 🧁`,
    saiu_para_entrega: `Seu pedido #${id} saiu para entrega!`,
    entregue: entrega ? `Entrega do pedido #${id} concluída. Obrigado!` : `Retirada do pedido #${id} concluída. Obrigado!`,
    cancelado: `Seu pedido #${id} foi cancelado. Se você já pagou, fale com a loja por aqui para combinar o reembolso.`,
  };
  return mensagens[status] ?? '';
}

export async function notificarStatusPedido(id: number, status: string): Promise<{ estado: EstadoAviso | null }> {
  const deps: DependenciasAviso = {
    async obter(pedidoId) {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT c.whatsapp, p.tipo_recebimento, a.estado FROM pedidos p JOIN clientes c ON c.id=p.cliente_id
         JOIN avisos_pedido a ON a.pedido_id=p.id AND a.status=? WHERE p.id=?`, [status, pedidoId]);
      const row = rows[0];
      return row ? { whatsapp: String(row.whatsapp), aviso_pronto_estado: row.estado as EstadoAviso } : undefined;
    },
    async reservar(pedidoId) {
      const [result] = await pool.query<ResultSetHeader>(
        "UPDATE avisos_pedido SET estado='enviando' WHERE pedido_id=? AND status=? AND estado='pendente'", [pedidoId, status]);
      return result.affectedRows === 1;
    },
    async registrar(pedidoId, estado) {
      await pool.query("UPDATE avisos_pedido SET estado=?, enviado_em=IF(?='enviado',CURRENT_TIMESTAMP,enviado_em) WHERE pedido_id=? AND status=?", [estado, estado, pedidoId, status]);
      if (status === 'pronto') await reais.registrar(pedidoId, estado);
    },
    async enviar(telefone) {
      const [rows] = await pool.query<RowDataPacket[]>('SELECT tipo_recebimento FROM pedidos WHERE id=?', [id]);
      await reais.enviar(telefone, mensagemStatus(id, status, String(rows[0].tipo_recebimento)));
    },
  };
  try { return await executarAvisoPronto(id, deps); }
  catch { console.error('[aviso-status] Não foi possível verificar o envio', id, status); return { estado: 'incerto' }; }
}
