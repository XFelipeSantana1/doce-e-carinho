import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const cidades = ['Tietê', 'Jumirim', 'Cerquilho'];
export const ORIGEM = { latitude: -23.1053948, longitude: -47.7086161 };
export class ErroEntrega extends Error { constructor(message: string, public status = 409) { super(message); } }
export function calcularTaxa(metros: number): number {
  if (!Number.isFinite(metros) || metros < 0) throw new ErroEntrega('Distância inválida.');
  return Math.round(950 + Math.max(0, metros - 4000) / 1000 * 115) / 100;
}
export interface CotacaoEntrega {
  finalidade: 'entrega'; whatsapp: string; cidade: string; endereco: string; complemento: string;
  distancia_metros: number; taxa_entrega: number; simulada?: boolean;
}
export function validarCotacao(token: unknown, telefone: string): CotacaoEntrega {
  try {
    if (typeof token !== 'string') throw new Error();
    const dados = jwt.verify(token, process.env.JWT_SECRET as string, { algorithms: ['HS256'], audience: 'cotacao-entrega' }) as CotacaoEntrega;
    if (dados.finalidade !== 'entrega' || dados.whatsapp !== telefone || !cidades.includes(dados.cidade) || !dados.endereco || dados.taxa_entrega !== calcularTaxa(dados.distancia_metros)) throw new Error();
    if (dados.simulada && process.env.ENTREGA_MODO !== 'demonstracao') throw new Error();
    return dados;
  } catch { throw new ErroEntrega('A cotação de entrega expirou ou é inválida. Calcule a entrega novamente antes de confirmar.'); }
}
type Geo = { partial_match?: boolean; formatted_address: string; geometry: { location: { lat: number; lng: number }; location_type: string }; address_components: { long_name: string; short_name: string; types: string[] }[] };
export async function cotarEntrega(dados: Record<string, unknown>, fetcher: typeof fetch = fetch) {
  const cidade = typeof dados.cidade === 'string' ? cidades.find(c => normalizar(c) === normalizar(dados.cidade as string)) : undefined;
  if (!cidade) throw new ErroEntrega('Entregamos somente em Tietê, Jumirim e Cerquilho.', 400);
  if (typeof dados.whatsapp !== 'string' || !/^\d{10,15}$/.test(dados.whatsapp)) throw new ErroEntrega('Telefone inválido.', 400);
  if (typeof dados.endereco !== 'string' || dados.endereco.trim().length < 8 || dados.endereco.length > 250 || !/\d/.test(dados.endereco)) throw new ErroEntrega('Informe rua, número e bairro para localizar a entrega.', 400);
  if (dados.complemento !== undefined && (typeof dados.complemento !== 'string' || dados.complemento.length > 150)) throw new ErroEntrega('Complemento inválido.', 400);
  if (process.env.ENTREGA_MODO === 'demonstracao') {
    // Exemplos didáticos por cidade. Não são distâncias reais dos endereços.
    const exemplos: Record<string, number> = { 'Tietê': 3000, 'Jumirim': 10000, 'Cerquilho': 18000 };
    const metros = exemplos[cidade];
    const cotacao: CotacaoEntrega = { finalidade: 'entrega', whatsapp: dados.whatsapp, cidade,
      endereco: `${dados.endereco.trim()}, ${cidade}/SP`, complemento: String(dados.complemento ?? ''),
      distancia_metros: metros, taxa_entrega: calcularTaxa(metros), simulada: true };
    return { ...cotacao, token: jwt.sign(cotacao, process.env.JWT_SECRET as string, { algorithm: 'HS256', expiresIn: '15m', audience: 'cotacao-entrega' }), validade_minutos: 15, fonte: 'Demonstração — distância de exemplo, sem consulta ao mapa' };
  }
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new ErroEntrega('O cálculo automático de entrega ainda não está habilitado pela loja. Escolha retirada ou fale com um atendente.', 503);
  const params = new URLSearchParams({ address: `${dados.endereco}, ${cidade}, SP, Brasil`, components: 'country:BR|administrative_area:SP', key, language: 'pt-BR' });
  const geoResponse = await fetcher('https://maps.googleapis.com/maps/api/geocode/json?' + params, { signal: AbortSignal.timeout(12000) });
  if (!geoResponse.ok) throw new ErroEntrega('O serviço de mapas está indisponível. Tente novamente ou fale com um atendente.', 503);
  const geo = await geoResponse.json() as { status: string; results: Geo[] };
  if (geo.status !== 'OK' || geo.results.length !== 1) throw new ErroEntrega('Não localizei um endereço único. Confira rua, número e bairro e tente novamente.');
  const destino = geo.results[0];
  const componente = (tipo: string) => destino.address_components.find(c => c.types.includes(tipo));
  const municipio = componente('administrative_area_level_2') ?? componente('locality');
  if (!municipio || normalizar(municipio.long_name) !== normalizar(cidade) || componente('administrative_area_level_1')?.short_name !== 'SP' || componente('country')?.short_name !== 'BR') throw new ErroEntrega('O endereço encontrado fica fora da cidade selecionada. Confira os dados.');
  if (destino.partial_match || !componente('street_number') || !componente('route') || !['ROOFTOP', 'RANGE_INTERPOLATED'].includes(destino.geometry.location_type)) throw new ErroEntrega('Não consegui localizar o número com segurança. Confira o endereço ou fale com um atendente.');
  const routeResponse = await fetcher('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'routes.distanceMeters' },
    body: JSON.stringify({ origin: { location: { latLng: ORIGEM } }, destination: { location: { latLng: { latitude: destino.geometry.location.lat, longitude: destino.geometry.location.lng } } }, travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE', computeAlternativeRoutes: false }),
    signal: AbortSignal.timeout(12000),
  });
  if (!routeResponse.ok) throw new ErroEntrega('Não consegui calcular a rota. Tente novamente ou fale com um atendente.', 503);
  const route = await routeResponse.json() as { routes?: { distanceMeters: number }[] };
  const metros = route.routes?.[0]?.distanceMeters;
  if (metros === undefined || !Number.isFinite(metros) || metros < 0) throw new ErroEntrega('Não encontrei uma rota de entrega.');
  const cotacao: CotacaoEntrega = { finalidade: 'entrega', whatsapp: dados.whatsapp, cidade, endereco: destino.formatted_address, complemento: String(dados.complemento ?? ''), distancia_metros: metros, taxa_entrega: calcularTaxa(metros) };
  return { ...cotacao, token: jwt.sign(cotacao, process.env.JWT_SECRET as string, { algorithm: 'HS256', expiresIn: '15m', audience: 'cotacao-entrega' }), validade_minutos: 15, fonte: 'Google Maps' };
}
export async function cotarEntregaHttp(req: Request, res: Response) {
  try { res.set('Cache-Control', 'no-store'); res.json(await cotarEntrega(req.body)); }
  catch (error) { const conhecido = error instanceof ErroEntrega; res.status(conhecido ? error.status : 503).json({ erro: conhecido ? error.message : 'O serviço de mapas não respondeu. Tente novamente ou fale com um atendente.' }); }
}
