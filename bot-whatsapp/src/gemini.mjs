import { instrucao } from './prompt-gemini.mjs';
export const MODELO_GEMINI = 'gemini-3.5-flash-lite';
const acoes = ['catalogo','buscar_produtos','adicionar_itens','recebimento','pagamento','quantidade','fechar','duvida','consultar_pedido','atendente','desconhecido','corrigir_itens','atualizar_pedido'];
const opcoes = ['', 'retirada', 'entrega', 'pix', 'cartao', 'dinheiro'];
const assuntos = ['', 'pagamento', 'entrega', 'retirada', 'ingredientes', 'prazo', 'ajuda', 'horario', 'antecedencia', 'personalizacoes', 'cancelamento'];
const schema = { type:'object', additionalProperties:false,
  properties: {
    acao:{type:'string',enum:acoes}, opcao:{type:'string',enum:opcoes}, assunto:{type:'string',enum:assuntos},
    termo:{type:'string'}, quantidade:{type:'integer'},
    itens:{type:'array',items:{type:'object',additionalProperties:false,properties:{produto_id:{type:'integer'},quantidade:{type:'integer'}},required:['produto_id','quantidade']}},
    dados:{type:'object',additionalProperties:false,properties:{recebimento:{type:'string',enum:['','retirada','entrega']},pagamento:{type:'string',enum:['','pix','cartao','dinheiro']},cidade:{type:'string',maxLength:80}},required:['recebimento','pagamento','cidade']},
    correcoes:{type:'array',maxItems:10,items:{type:'object',additionalProperties:false,properties:{produto_id:{type:'integer'},novo_produto_id:{type:'integer'},quantidade:{type:'integer'},operacao:{type:'string',enum:['quantidade','substituir','remover']}},required:['produto_id','novo_produto_id','quantidade','operacao']}},
    ambiguidades:{type:'array',maxItems:5,items:{type:'string',maxLength:120}},
  }, required:['acao','opcao','assunto','termo','quantidade','itens','dados','correcoes','ambiguidades'],
};

export function intencaoValida(value) {
  if (!value || typeof value !== 'object' || !acoes.includes(value.acao) || !opcoes.includes(value.opcao) || !assuntos.includes(value.assunto)) return false;
  if (Object.keys(value).some(k=>!['acao','opcao','assunto','termo','quantidade','itens','dados','correcoes','ambiguidades'].includes(k))) return false;
  if (value.dados !== undefined && (!value.dados || Object.keys(value.dados).some(k=>!['recebimento','pagamento','cidade'].includes(k)) || !['','retirada','entrega'].includes(value.dados.recebimento) || !['','pix','cartao','dinheiro'].includes(value.dados.pagamento) || typeof value.dados.cidade!=='string' || value.dados.cidade.length>80)) return false;
  if (value.ambiguidades !== undefined && (!Array.isArray(value.ambiguidades) || value.ambiguidades.length>5 || value.ambiguidades.some(x=>typeof x!=='string' || x.length>120))) return false;
  if (value.correcoes !== undefined && (!Array.isArray(value.correcoes) || value.correcoes.length>10 || value.correcoes.some(c=>!c || Object.keys(c).some(k=>!['produto_id','novo_produto_id','quantidade','operacao'].includes(k)) || !Number.isSafeInteger(c.produto_id) || c.produto_id<1 || !Number.isSafeInteger(c.novo_produto_id) || c.novo_produto_id<0 || !Number.isInteger(c.quantidade) || c.quantidade<0 || c.quantidade>99 || !['quantidade','substituir','remover'].includes(c.operacao)))) return false;
  if (typeof value.termo !== 'string' || value.termo.length > 80 || !Number.isInteger(value.quantidade) || value.quantidade < 0 || value.quantidade > 99) return false;
  return Array.isArray(value.itens) && value.itens.length <= 10 && value.itens.every(i=>Number.isSafeInteger(i?.produto_id) && Object.keys(i).every(k=>['produto_id','quantidade'].includes(k)) && i.produto_id > 0 && Number.isInteger(i.quantidade) && i.quantidade >= 1 && i.quantidade <= 99);
}

export function geminiConfigurado(env = process.env) {
  return env.GEMINI_ENABLED === 'true' && Boolean(env.GEMINI_API_KEY?.trim());
}

export async function interpretarGemini(texto, state, produtos, { env=process.env, fetcher=fetch, reservar=async()=>true, pausar=async()=>{} } = {}) {
  if (!geminiConfigurado(env) || texto.length > 600 || produtos.length > 100) return null;
  const model = env.GEMINI_MODEL || MODELO_GEMINI;
  if (!/^gemini-[a-z0-9.-]+$/.test(model)) return null;
  // Lista explícita: nunca serializar estado, histórico, telefone, endereço ou código.
  const contexto = { etapa:state?.etapa || 'menu', recebimento:state?.tipo || null,
    produto_em_selecao:state?.escolhido?.id || null,
    sacola:(state?.itens || []).map(i=>({produto_id:i.id,quantidade:i.quantidade})),
    ultimo_produto:state?.ultimoProduto || null, ultima_pergunta:state?.perguntaPendente || state?.etapa || 'menu',
    campos_pendentes:state?.camposPendentes || [],
    resumo_recente:(state?.resumoRecente || []).slice(-4),
    catalogo:produtos.map(p=>({id:p.id,nome:p.nome})), mensagem:texto };
  try {
    if (!await reservar()) return null;
    const response=await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method:'POST', headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},
      body:JSON.stringify({systemInstruction:{parts:[{text:instrucao}]},contents:[{role:'user',parts:[{text:JSON.stringify(contexto)}]}],
        generationConfig:{responseMimeType:'application/json',responseJsonSchema:schema,maxOutputTokens:768}}),
      signal:AbortSignal.timeout(8000),
    });
    if (!response.ok) {if(response.status===429)await pausar();return null;}
    const body=await response.json(), candidate=body.candidates?.[0];
    if (candidate?.finishReason !== 'STOP') return null;
    const text=candidate.content?.parts?.filter(p=>!p.thought && typeof p.text==='string').map(p=>p.text).join('');
    if (!text || text.length > 6000) return null;
    const intent=JSON.parse(text);
    return intencaoValida(intent) ? intent : null;
  } catch { return null; } // Nunca registrar chave, prompt, corpo ou dados do cliente.
}

// Contadores compartilhados entre reinícios; limites são do projeto, não garantia de franquia do Google.
export async function reservarChamadaGemini(redis, env=process.env, now=Date.now()) {
  const bounded=(v,fallback,max)=>/^\d+$/.test(v||'') ? Math.max(1,Math.min(Number(v),max)) : fallback;
  const minuteLimit=bounded(env.GEMINI_MAX_PER_MINUTE,5,20), dayLimit=bounded(env.GEMINI_MAX_PER_DAY,100,1000);
  const minute=Math.floor(now/60000), day=new Date(now).toISOString().slice(0,10);
  const result=await redis.eval(`
    if redis.call('exists',KEYS[3]) == 1 then return 0 end
    if tonumber(redis.call('get',KEYS[1]) or '0') >= tonumber(ARGV[1]) or tonumber(redis.call('get',KEYS[2]) or '0') >= tonumber(ARGV[2]) then return 0 end
    redis.call('incr',KEYS[1]); redis.call('expire',KEYS[1],120)
    redis.call('incr',KEYS[2]); redis.call('expire',KEYS[2],172800)
    return 1`, {keys:[`confeitaria:gemini:minuto:${minute}`,`confeitaria:gemini:dia:${day}`,'confeitaria:gemini:pausa'],arguments:[String(minuteLimit),String(dayLimit)]});
  return result === 1;
}
