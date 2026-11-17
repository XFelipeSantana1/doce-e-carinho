import { timingSafeEqual } from 'node:crypto';
import { assinaturaValida, mensagensMeta } from './meta.mjs';

export function verificarWebhook(url, token) {
  const supplied = Buffer.from(url.searchParams.get('hub.verify_token') || '');
  const expected = Buffer.from(token || '');
  return expected.length > 0 && supplied.length === expected.length && timingSafeEqual(supplied, expected)
    && url.searchParams.get('hub.mode') === 'subscribe' ? url.searchParams.get('hub.challenge') : null;
}

export function receberWebhook(raw, signature, env) {
  if (!assinaturaValida(raw, signature, env.META_APP_SECRET)) return { status: 401, messages: [] };
  let event;
  try { event = JSON.parse(raw.toString('utf8')); } catch { return { status: 400, messages: [] }; }
  return { status: 200, messages: mensagensMeta(event, env.META_PHONE_NUMBER_ID, env.BOT_TEST_PHONE) };
}
