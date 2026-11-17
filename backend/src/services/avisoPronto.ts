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
  enviar: enviarAvisoWhatsApp,
};
export async function enviarAvisoWhatsApp(telefone: string, texto: string): Promise<void> {
  const provider = process.env.WHATSAPP_PROVIDER || 'waha';
  if (provider === 'meta') {
    const autorizado = process.env.BOT_TEST_PHONE;
    if (!autorizado || canonical(telefone) !== canonical(autorizado)) throw new FalhaAviso('bloqueado');
    if (!/^\d{10,15}$/.test(telefone)) throw new FalhaAviso('falha');
    const service = process.env.BOT_SERVICE_URL;
    const key = process.env.BOT_WEBHOOK_KEY;
    if (!service || !key) throw new FalhaAviso('falha');
    // O atendimento conhece a janela de 24h e mantém o token Meta fora da API.
    let response: Response;
    try {
      response = await fetch(`${service.replace(/\/$/, '')}/notify`, {
        method:'POST', headers:{'Content-Type':'application/json','x-bot-key':key},
        body:JSON.stringify({telefone,texto}), signal:AbortSignal.timeout(20000),
      });
    } catch { throw new FalhaAviso('incerto'); }
    let body: { estado?: string };
    try { body = await response.json() as { estado?: string }; } catch { throw new FalhaAviso('incerto'); }
    if (!response.ok || body.estado !== 'enviado') {
      throw new FalhaAviso(body.estado === 'bloqueado' ? 'bloqueado' : body.estado === 'falha' ? 'falha' : 'incerto');
    }
    return;
  }
  if (provider !== 'waha') throw new FalhaAviso('falha');
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
}

export async function notificarPedidoPronto(id: number): Promise<{ estado: EstadoAviso | null }> {
  try { return await executarAvisoPronto(id, reais); }
  catch { console.error('[aviso-pronto] Não foi possível verificar o envio do pedido', id); return { estado: 'incerto' }; }
}

// Mensagem do aviso. `codigo` vem da coluna codigo_entrega do pedido: entra
// na mensagem nos dois momentos em que o cliente precisa dele — retirada
// ("pronto", apresenta na loja) e entrega ("saiu_para_entrega", repassa ao
// motoboy). Nos outros status o código não diz nada e fica fora.
export function mensagemStatus(id: number, status: string, tipo: string, codigo?: string | null): string {
  const entrega = tipo === 'entrega';
  const comCodigo = codigo ? `\n\n*Código de confirmação: ${codigo}*\n${entrega ? 'Informe ao motorista somente quando receber o pedido.' : 'Informe à equipe somente quando retirar o pedido.'}` : '';
  const mensagens: Record<string, string> = {
    pagamento_confirmado: `*Pedido #${id} — pagamento confirmado*\n\nRecebemos a confirmação do seu pagamento.\nAvisaremos quando o preparo começar.`,
    em_preparo: `*Pedido #${id} — em preparo* 🧁\n\nEstamos preparando seus doces.\nAvisaremos quando estiver pronto.`,
    pronto: entrega ? `*Pedido #${id} — pronto*\n\nEstamos aguardando a saída para entrega.\nAvisaremos quando sair.${comCodigo}` : `*Pedido #${id} — pronto para retirada!* 🧁\n\n*Local de retirada*\nEtec de Tietê\nRua Manira Jacob Biscaron, 45.${comCodigo}`,
    saiu_para_entrega: `*Pedido #${id} — saiu para entrega!* 🛵\n\nO motorista está a caminho do endereço informado.${comCodigo}`,
    entregue: entrega ? `*Pedido #${id} — entrega concluída*\n\nObrigado por escolher a Doce & Carinho! 🧁` : `*Pedido #${id} — retirada concluída*\n\nObrigado por escolher a Doce & Carinho! 🧁`,
    cancelado: `*Pedido #${id} — cancelado*\n\nSe já fez o pagamento, envie uma mensagem por aqui para combinar o reembolso com a loja.`,
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
      const [rows] = await pool.query<RowDataPacket[]>('SELECT tipo_recebimento, codigo_entrega FROM pedidos WHERE id=?', [id]);
      await reais.enviar(telefone, mensagemStatus(id, status, String(rows[0].tipo_recebimento), rows[0].codigo_entrega as string | null));
    },
  };
  try { return await executarAvisoPronto(id, deps); }
  catch { console.error('[aviso-status] Não foi possível verificar o envio', id, status); return { estado: 'incerto' }; }
}
