import { createHmac, timingSafeEqual } from 'node:crypto';
import { canonical } from './remetente.mjs';

export class FalhaMeta extends Error {
  constructor(estado) { super('Falha no envio pela Cloud API'); this.estado = estado; }
}

export function assinaturaValida(raw, signature, secret) {
  if (!secret || typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
}

export function mensagensMeta(event, phoneId, testPhone) {
  const messages = [];
  if (event?.object !== 'whatsapp_business_account' || !Array.isArray(event.entry)) return messages;
  for (const entry of event.entry) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value;
      if (change?.field !== 'messages' || value?.metadata?.phone_number_id !== phoneId) continue;
      for (const m of Array.isArray(value.messages) ? value.messages : []) {
        // Sem telefone verificável, não autorizar usuários apenas pelo nome/BSUID.
        if (!/^\d{10,15}$/.test(m?.from || '') || canonical(m.from) !== canonical(testPhone) || typeof m.id !== 'string') continue;
        const reply = m.type === 'interactive' ? m.interactive?.[m.interactive.type] : null;
        messages.push({ id: m.id, from: m.from, timestamp: Number(m.timestamp),
          text: m.type === 'text' && typeof m.text?.body === 'string' ? m.text.body.trim() : '',
          choice: typeof reply?.id === 'string' ? reply.id : null });
      }
    }
  }
  return messages;
}

const short = (text, max) => Array.from(String(text)).slice(0, max).join('');

export function montarMensagemMeta(to, result, token, page = 0) {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to };
  const options = result.opcoes || [];
  const interactiveText = result.textoInterativo || result.text;
  if (!options.length || !interactiveText || interactiveText.length > 1024) {
    return { ...base, type: 'text', text: { body: result.text, preview_url: false } };
  }
  const choiceId = index => `${token}:option:${index}`;
  const body = { text: interactiveText
    .replace(/\n\nResponda com [^\n]+\.$/u, '\n\nToque em uma opção abaixo.')
    .replace('Digite *1* para escolher Pix e conferir o resumo.', 'Toque em *Pix antecipado* para conferir o resumo.')
    .replace('Digite *CONFIRMAR* para registrar o pedido.\nPara esvaziar a sacola e recomeçar, digite *CANCELAR*.', 'Toque em *Confirmar pedido* para registrar.\nPara esvaziar a sacola, toque em *Recomeçar*.') };
  if (options.length <= 3 && options.every(o => !o.description)) {
    return { ...base, type: 'interactive', interactive: { type: 'button', body,
      action: { buttons: options.map((o, i) => ({ type: 'reply', reply: { id: choiceId(i), title: short(o.title, 20) } })) } } };
  }
  const pages = Math.ceil(options.length / 8);
  const current = Math.max(0, Math.min(Number.isInteger(page) ? page : 0, pages - 1));
  const rows = options.slice(current * 8, current * 8 + 8).map((o, i) => ({
    id: choiceId(current * 8 + i), title: short(o.title, 24),
    ...(o.description ? { description: short(o.description, 72) } : {}),
  }));
  if (current > 0) rows.push({ id: `${token}:page:${current - 1}`, title: 'Opções anteriores' });
  if (current < pages - 1) rows.push({ id: `${token}:page:${current + 1}`, title: 'Mais opções' });
  return { ...base, type: 'interactive', interactive: { type: 'list', body,
    action: { button: 'Ver opções', sections: [{ title: 'Escolha uma opção', rows }] } } };
}

export function interpretarEscolha(id, ui) {
  if (!ui || typeof id !== 'string') return null;
  const match = id.match(/^([^:]+):(option|page):(\d+)$/);
  if (!match || match[1] !== ui.token) return null;
  const index = Number(match[3]);
  if (match[2] === 'page') {
    return index < Math.ceil(ui.result.opcoes.length / 8) ? { page: index } : null;
  }
  const option = ui.result.opcoes[index];
  return option ? { text: option.value } : null;
}

export async function enviarMeta(payload, env = process.env, fetcher = fetch) {
  if (!env.META_ACCESS_TOKEN || !/^\d+$/.test(env.META_PHONE_NUMBER_ID || '') || !/^v\d+\.\d+$/.test(env.META_API_VERSION || '')) throw new Error('Configure a Cloud API');
  if (!/^\d{10,15}$/.test(payload.to || '') || !env.BOT_TEST_PHONE || canonical(payload.to) !== canonical(env.BOT_TEST_PHONE)) throw new Error('Destinatário bloqueado');
  let response;
  try { response = await fetcher(`https://graph.facebook.com/${env.META_API_VERSION}/${env.META_PHONE_NUMBER_ID}/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.META_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
  }); } catch { throw new FalhaMeta('incerto'); }
  // Não registrar corpo da Meta: pode conter dados pessoais e detalhes de credenciais.
  if (!response.ok) throw new FalhaMeta(response.status >= 500 ? 'incerto' : 'falha');
  let body;
  try { body = await response.json(); } catch { throw new FalhaMeta('incerto'); }
  if (!body.messages?.[0]?.id) throw new FalhaMeta('incerto');
  return body;
}
