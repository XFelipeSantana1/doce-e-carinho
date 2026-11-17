import { responder, novoEstado } from './conversa.mjs';
import { intencaoValida } from './gemini.mjs';
import { informacaoLoja } from './loja.mjs';
import { camposFaltantes, invalidarResumo, atualizarCatalogo, mostrarResumo, subtotal } from './checkout.mjs';

const normalizar=t=>t.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const moeda=n=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const resposta=(state,text,opcoes=[])=>({state:structuredClone(state || novoEstado()),text,opcoes});
const baseIntent=(acao,extra={})=>({acao,opcao:'',assunto:'',termo:'',quantidade:0,itens:[],...extra});
const numeros={um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10};
const diretos=/^(?:oi|ola|bom dia|boa tarde|boa noite|menu|cardapio|estoque|disponibilidade|sacola|cancelar|reiniciar|atendente|novo pedido|fechar|fazer pedido|cancelar pedido(?:\s+#?\d+)?)$/;
const confirmar=/^(?:confirmar|pode confirmar|confirmo|sim,? pode confirmar)[.!]?$/;
const pergunta=s=>({menu:'Deseja ver o CARDÁPIO ou falar com ATENDENTE?',produto:'Quer adicionar algum produto? Informe nome e quantidade, ou digite FECHAR.',quantidade:`Quantas unidades de ${s.escolhido?.nome || 'qual produto'} você deseja?`,nome:'Em qual nome fica o pedido?',recebimento:'Deseja retirada ou entrega?',cidade:'Em qual cidade: Tietê, Jumirim ou Cerquilho?',endereco:'Qual é a rua, número e bairro da entrega?',complemento:'Tem complemento? Se não tiver, escreva SEM.',validar_endereco:'Aceita o endereço e a taxa apresentados? Responda SIM ou peça uma correção.',pagamento:s.tipo==='entrega'?'Entrega aceita somente Pix antecipado. Deseja escolher Pix?':'Como deseja pagar: Pix, cartão ou dinheiro?',confirmar:'Confira o resumo. Digite CONFIRMAR para registrar ou informe a correção.',incerto:'Digite CONFIRMAR para consultar a mesma confirmação com segurança.',entrega_indisponivel:'Digite 1 para retirar, 2 para tentar novamente ou 3 para falar com a loja.',concluido:'Digite NOVO PEDIDO para outra compra.'}[s.etapa] || 'Digite SACOLA para conferir ou FECHAR para continuar.');

export function textoSensivel(text) {
  return /(?:\d[\s().+/-]*){4,}|\S+@\S+|https?:\/\/|\b(?:rua|avenida|travessa|rodovia|cep|cpf|cnpj|telefone|celular|senha|token|comprovante|chave pix)\b|\b(?:me chamo|meu nome|moro|sou o|sou a)\b/i.test(normalizar(text));
}

// Extração local: dados pessoais não são enviados ao modelo nem incluídos no resumo semântico.
export function extrairDadosLocais(texto, state) {
  const dados={}; let restante=texto;
  const nome=restante.match(/(?:me chamo|meu nome (?:é|e)|(?:o )?nome(?: para o pedido)?\s*:)\s*([\p{L}][\p{L} '-]{1,119}?)(?=\s+(?:e (?:meu |o )?endere[cç]o|e (?:moro|entrego|quero|queria|vou|prefiro|pago)|(?:para|pra) (?:retirar|entrega)|(?:na|pela) rua)|[;,\n.!?]|$)/iu);
  if(nome){dados.nome=nome[1].trim();restante=restante.replace(nome[0],'[DADOS_LOCAIS]');}
  const endereco=restante.match(/(?:(?:meu )?endere[cç]o\s*(?:é|e|:)\s*)?((?:rua|avenida|av\.?|travessa|rodovia)\s+[^;\n]{5,240})/iu);
  if(endereco && /\d/.test(endereco[1]) && !/[?]|\b(?:nao|não|evite)\b/i.test(texto)){dados.endereco=endereco[1].trim().replace(/[.!]$/,'');restante=restante.replace(endereco[0],'[DADOS_LOCAIS]');}
  if(state.etapa==='nome' && !nome && /^[\p{L}][\p{L} '-]{1,119}$/u.test(texto) && !/[?]|\b(?:quero|queria|gostaria|preciso|posso|voces|vocês|aceita|trocar|corrigindo|quanto|como|tem|qual|prefiro|pagar|retirar|entrega|horario|horário|cancelar|mudar|pode|nao|não)\b/i.test(texto) && !/\b(?:pix|cartao|cartão|dinheiro|retirada|retirar|entrega|tiete|tietê|jumirim|cerquilho|verdade|so|só|somente|apenas|quantidade|pagamento|fechar|confirmar|sim|nao|não)\b/i.test(texto) && !diretos.test(normalizar(texto))){dados.nome=texto.trim();restante='[DADOS_LOCAIS]';}
  return {dados,restante};
}

export async function consultarPedidoCliente(state, id, services) {
  if (!Number.isSafeInteger(id) || id <= 0 || !services.consultar) return resposta(state,'Envie PEDIDO # seguido do número para consultar.');
  try {
    // services.consultar fixa o telefone autenticado no servidor. O modelo nunca fornece destinatários.
    const p=await services.consultar(id);
    const etapas={pendente:'aguardando início do preparo',em_preparo:'em preparo',pronto:'pronto',saiu_para_entrega:'saiu para entrega',entregue:'concluído',cancelado:'cancelado'};
    return resposta(state,`Pedido #${id}: ${etapas[p.status] || 'consulte a loja'}.\nPagamento: ${{pendente:'aguardando confirmação da loja',pago:'pago',estornado:'estornado'}[p.status_pagamento] || 'consulte a loja'}.`);
  } catch { return resposta(state,'Não consegui consultar esse pedido para este telefone. Confira o número ou fale com a loja.'); }
}

async function avancar(s,services) {
  s.checkout=true;
  if(!s.itens.length){s.etapa='produto';return resposta(s,'Sua sacola está vazia. Informe produto e quantidade.');}
  if(!s.nome){s.etapa='nome';return resposta(s,pergunta(s));}
  if(!s.tipo){s.etapa='recebimento';return responder(s,'',services);}
  if(s.tipo==='entrega'){
    if(!s.cidade){s.etapa='cidade';return resposta(s,pergunta(s));}
    if(!s.endereco){s.etapa='endereco';return resposta(s,pergunta(s));}
    if(s.complemento===undefined){s.etapa='complemento';return resposta(s,pergunta(s));}
    if(!s.cotacao?.token){s.etapa='complemento';return responder(s,s.complemento || 'sem',services);}
    if(!s.entregaAprovada){s.etapa='validar_endereco';return resposta(s,`Endereço: ${s.cotacao.endereco}\nTaxa: ${moeda(s.cotacao.taxa_entrega)}\n${pergunta(s)}`);}
  }
  if(!s.pagamento || s.tipo==='entrega' && s.pagamento!=='pix'){s.etapa='pagamento';return responder(s,'',services);}
  const atual=await atualizarCatalogo(s,services);
  if(atual.erro){s.etapa='produto';return resposta(s,atual.erro);}
  return mostrarResumo(s);
}
function retomar(s,text) { return resposta(s,text+(s.itens.length && !['concluido','humano'].includes(s.etapa)?'\n\n'+pergunta(s):'')); }
function faltou(s) { return retomar(s,'Não consegui entender essa mensagem com segurança. Sua sacola foi mantida.'); }
function tokens(t){return normalizar(t).replace(/[^a-z0-9 ]/g,' ').split(/\s+/).map(t=>t.replace(/s$/,'')).filter(t=>t.length>2 && !['quero','queria','dois','dua','para','pra','com','uma','unidade','favor','verdade','so'].includes(t));}
function perto(a,b){if(a===b)return true;if(a.length<5 || Math.abs(a.length-b.length)>1)return false;let prev=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]!==b[j-1]));prev=next;}return prev[b.length]<=1;}
function candidatos(texto,produtos){const ts=tokens(texto);const scores=produtos.map(p=>({p,n:tokens(p.nome).filter(t=>ts.some(x=>perto(t,x))).length}));const max=Math.max(0,...scores.map(x=>x.n));return max?scores.filter(x=>x.n===max).map(x=>x.p):[];}
function escolherProduto(id,texto,produtos) {
  const p=produtos.find(x=>Number(x.id)===id);if(!p)return {erro:'Esse produto não está no catálogo. Qual produto deseja?'};
  const possiveis=candidatos(texto,produtos);
  // Um lote pode mencionar vários produtos por seus nomes completos.
  if(normalizar(texto).includes(normalizar(p.nome)))return {p};
  const mencionados=tokens(p.nome).filter(t=>tokens(texto).some(x=>perto(t,x)));
  const exclusivos=mencionados.some(t=>produtos.filter(x=>tokens(x.nome).some(z=>perto(z,t))).length===1);
  if(exclusivos)return {p};
  if(possiveis.length!==1 || Number(possiveis[0].id)!==id)return {erro:possiveis.length>1?`Qual produto você quer: ${possiveis.map(p=>p.nome).join(' ou ')}?`:'Qual é o nome do produto que deseja?'};
  return {p};
}
function conferirItens(s,produtos){
  for(const i of s.itens){const p=produtos.find(p=>Number(p.id)===i.id);if(!p)return 'Um dos produtos não está mais no catálogo. Qual deseja substituir?';if(!Number.isFinite(Number(p.preco)) || Number(p.preco)<0)return 'Não consegui conferir o preço desse produto. Confirme com a loja.';if(!Number.isInteger(i.quantidade)||i.quantidade<1||i.quantidade>99)return 'Use de 1 a 99 unidades por produto.';if(p.quantidade_disponivel!=null && Number(p.quantidade_disponivel)<i.quantidade)return `Há disponibilidade insuficiente de ${p.nome}. Qual quantidade deseja?`;i.preco=Number(p.preco);i.nome=p.nome;}
}

async function decidir(original,texto,services,interpretar) {
  const s=structuredClone(original || novoEstado()),text=normalizar(texto);
  if(s.etapa==='humano' && text!=='reiniciar')return resposta(s,null);
  if(['humano','incerto'].includes(s.etapa))return responder(s,confirmar.test(text)?'confirmar':texto,services);
  if(/\b(?:ignore|ignorar|desobedeca)\b.*\b(?:regra|instru|prompt)|\b(?:invente|inventar)\b.*\b(?:desconto|preco|produto)\b/.test(text))return retomar(s,'Só posso usar os produtos, valores e regras confirmados no sistema.');
  const consulta=text.match(/^(?:pedido|status(?: do pedido)?)\s*#?(\d+)$/);
  if(consulta)return consultarPedidoCliente(s,Number(consulta[1]),services);
  if(confirmar.test(text) || text==='sim' && s.etapa==='confirmar'){
    if(s.etapa==='concluido')return responder(s,'confirmar',services);
    if(s.etapa!=='confirmar' || camposFaltantes(s).length)return avancar(s,services);
    return responder(s,'confirmar',services);
  }
  if(/^(?:pode ser|sim|correto)[.!]?$/.test(text)){
    if(s.etapa==='validar_endereco')return avancar({...s,entregaAprovada:true},services);
    if(s.etapa==='pagamento' && s.tipo==='entrega')return avancar({...s,pagamento:'pix'},services);
    return resposta(s,'Você quer confirmar qual opção?\n'+pergunta(s));
  }
  if(diretos.test(text)){
    if(text==='fechar')return avancar(s,services);
    return responder(s,text,services);
  }
  if(s.etapa==='concluido')return responder(s,text,services);
  // Interpretar números conforme a última apresentação, sem reaproveitar menus antigos.
  if(/^\d{1,3}$/.test(text)){
    if(s.menuProdutos && s.menuProdutos.includes(Number(text))){s.etapa='produto';delete s.menuProdutos;return responder(s,text,services);}
    if(s.etapa==='quantidade')return responder(s,text,services);
    if(s.ultimaRespostaTipo==='consulta')return resposta(s,'Essa lista era uma consulta. Para adicionar, informe o produto e a quantidade.');
    if(s.etapa==='menu' && !s.ultimaPergunta)return responder(s,text,services); // sessões antigas
    const selecionada=s.opcoesExibidas?.find(x=>x.numero===text);
    if(selecionada)return responder(s,selecionada.value,services);
    if(!s.ultimaPergunta && ['recebimento','cidade','pagamento','validar_endereco','entrega_indisponivel','produto'].includes(s.etapa))return responder(s,text,services);
    return resposta(s,'Esse número se refere a qual produto ou opção?\n'+pergunta(s));
  }
  let assunto;
  if(/\b(?:horario|horas|abre|aberto|fecha|funcionamento)\b/.test(text))assunto='horario';
  else if(/^(?:como|quais|qual|posso|aceita|aceitam|voces aceitam).*(?:pagar|pagamento|pix|cartao|dinheiro)\??$/.test(text))assunto='pagamento';
  else if(/^(?:ja paguei|paguei|fiz o pix)[.!]?$/.test(text))assunto='pagamento';
  if(assunto)return retomar(s,informacaoLoja(assunto));
  if(s.etapa==='quantidade' && numeros[text])return responder(s,String(numeros[text]),services);
  if(text==='sem' && s.etapa==='complemento')return responder(s,text,services);
  if(s.etapa==='complemento' && !/[?]|\b(?:quero|mudar|trocar|pagar|quanto|como)\b/.test(text))return responder(s,texto,services);

  const local=extrairDadosLocais(texto,s);
  // Preservar dados validados localmente mesmo se a interpretação do restante falhar.
  for(const k of ['nome','endereco'])if(local.dados[k] && local.dados[k]!==s[k]){s[k]=local.dados[k];invalidarResumo(s);if(k==='endereco'){delete s.cotacao;delete s.entregaAprovada;delete s.complemento;}}
  const resto=normalizar(local.restante.replaceAll('[DADOS_LOCAIS]','')).replace(/^[\s;,.:]+|[\s;,.:]+$/g,'').replace(/^e\s+|\s+e$/g,'').trim();
  let intent;
  const quantidade=text.match(/^(?:na verdade[, ]*|corrigindo[, ]*)?(?:so|somente|apenas) (\d{1,2}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)[.!]?$/);
  if(quantidade && s.itens.length){
    const id=s.itens.length===1?s.itens[0].id:s.ultimoProduto;
    if(!id)return resposta(s,'De qual produto você quer alterar a quantidade?');
    intent=baseIntent('corrigir_itens',{correcoes:[{produto_id:id,novo_produto_id:0,quantidade:Number(quantidade[1])||numeros[quantidade[1]],operacao:'quantidade'}]});
  }else if(['retirada','retirar','entrega'].includes(resto))intent=baseIntent('recebimento',{opcao:resto==='retirar'?'retirada':resto});
  else if(['pix','cartao','dinheiro'].includes(resto))intent=baseIntent('pagamento',{opcao:resto});
  else if(['tiete','jumirim','cerquilho'].includes(resto))intent=baseIntent('atualizar_pedido',{dados:{recebimento:'',pagamento:'',cidade:resto}});
  else if(Object.keys(local.dados).length && !resto)intent=baseIntent('atualizar_pedido');

  let produtos;
  const catalogo=async()=>produtos ||= await services.catalogo();
  const fallback=()=>Object.keys(local.dados).length && (s.checkout || ['nome','endereco'].includes(s.etapa))?avancar(s,services):faltou(s);
  if(!intent && s.etapa==='produto'){
    const ps=await catalogo();if(ps.some(p=>normalizar(p.nome)===text))return responder(s,text,services);
  }
  if(!intent){
    if(!interpretar || texto.length>600 || textoSensivel(local.restante) || texto.includes('•')){
      if(texto.includes('•'))return responder(s,texto,services);
      return fallback();
    }
    const ps=await catalogo();
    // Não transmitir texto da última resposta, nomes, endereço ou histórico bruto ao Gemini.
    try {intent=await interpretar(local.restante,{etapa:s.etapa,tipo:s.tipo,itens:s.itens,escolhido:s.escolhido,ultimoProduto:s.ultimoProduto,perguntaPendente:s.perguntaPendente,camposPendentes:camposFaltantes(s),resumoRecente:s.resumoRecente},ps);}catch{return fallback();}
  }
  if(!intencaoValida(intent))return fallback();
  if(intent.ambiguidades?.length){
    const campos=intent.ambiguidades.map(normalizar).join(' ');
    if(/quantidade/.test(campos)){
      const ps=await catalogo(), encontrados=candidatos(texto,ps);
      if(encontrados.length===1)return responder({...s,etapa:'produto'},String(encontrados[0].id),services);
      return resposta(s,'Qual produto e quantas unidades você deseja?');
    }
    return resposta(s,'Qual produto ou opção você deseja? Informe o nome para eu conferir.');
  }
  if(intent.acao==='duvida'){
    if(Object.keys(local.dados).length && s.checkout){const retomada=await avancar(s,services);retomada.text=informacaoLoja(intent.assunto)+'\n\n'+retomada.text;return retomada;}
    return retomar(s,informacaoLoja(intent.assunto));
  }
  if(intent.acao==='consultar_pedido')return consultarPedidoCliente(s,s.pedido?.id,services);
  if(intent.acao==='atendente')return responder(s,'atendente',services);
  if(intent.acao==='catalogo')return responder(s,'cardapio',services);
  if(intent.acao==='buscar_produtos'){
    const ps=await catalogo(), term=normalizar(intent.termo),found=term?ps.filter(p=>normalizar(p.nome).includes(term)):s.escolhido?ps.filter(p=>Number(p.id)===s.escolhido.id):[];
    if(!found.length)return retomar(s,'Não encontrei esse produto pelo nome. Qual produto deseja consultar?');
    const result=retomar(s,found.map(p=>`${p.nome}: ${moeda(p.preco)} por unidade${p.quantidade_disponivel!=null && Number(p.quantidade_disponivel)===0?' — esgotado':''}`).join('\n'));
    result.consulta=true;return result;
  }
  if(intent.acao==='quantidade' && s.etapa==='quantidade')return responder(s,String(intent.quantidade),services);
  if(intent.acao==='fechar')return avancar(s,services);
  if(!['adicionar_itens','corrigir_itens','atualizar_pedido','recebimento','pagamento'].includes(intent.acao))return faltou(s);
  const ps=await catalogo(),next=structuredClone(s);
  const checkout=s.checkout || ['nome','recebimento','cidade','endereco','complemento','validar_endereco','pagamento','confirmar'].includes(s.etapa);
  const itens=intent.itens || [],correcoes=intent.correcoes || [];
  // Uma consulta jamais vira compra, mesmo que a interpretação seja incorreta.
  if((itens.length || correcoes.length) && /^(?:tem\b|quanto\b|qual\b|voces tem\b)|\?/.test(text))return retomar(s,'Você quer consultar um produto ou alterar sua sacola?');
  const quantidades=[...normalizar(local.restante).matchAll(/\b(\d{1,2}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\b/g)].map(m=>Number(m[1])||numeros[m[1]]);
  if(itens.some(i=>!quantidades.includes(i.quantidade)) || correcoes.some(c=>c.operacao!=='remover' && !quantidades.includes(c.quantidade))){
    if(itens.length===1 && !correcoes.length){const escolhido=escolherProduto(itens[0].produto_id,texto,ps);if(escolhido.p)return responder({...s,etapa:'produto'},String(escolhido.p.id),services);}
    return resposta(s,'Qual quantidade deseja para cada produto?');
  }
  for(const item of itens){
    const selected=escolherProduto(item.produto_id,texto,ps);if(selected.erro)return resposta(s,selected.erro);
    const existing=next.itens.find(i=>i.id===item.produto_id);
    if(existing)existing.quantidade+=item.quantidade;else next.itens.push({id:item.produto_id,nome:selected.p.nome,preco:Number(selected.p.preco),quantidade:item.quantidade});
    next.ultimoProduto=item.produto_id;
  }
  for(const c of correcoes){
    const index=next.itens.findIndex(i=>i.id===c.produto_id);if(index<0)return resposta(s,'Qual item da sacola você quer corrigir?');
    if(c.operacao==='remover')next.itens.splice(index,1);
    else if(c.operacao==='quantidade')next.itens[index].quantidade=c.quantidade;
    else {
      const chosen=escolherProduto(c.novo_produto_id,texto,ps);if(chosen.erro)return resposta(s,chosen.erro);
      next.itens[index]={id:c.novo_produto_id,nome:chosen.p.nome,preco:Number(chosen.p.preco),quantidade:c.quantidade};
    }
    next.ultimoProduto=next.itens[index]?.id;
  }
  const merged=new Map();for(const item of next.itens){if(merged.has(item.id))merged.get(item.id).quantidade+=item.quantidade;else merged.set(item.id,item);}next.itens=[...merged.values()];
  const erro=conferirItens(next,ps);if(erro)return resposta(s,erro);
  const dados={...intent.dados,...local.dados};
  if(intent.acao==='recebimento')dados.recebimento=intent.opcao;
  if(intent.acao==='pagamento')dados.pagamento=intent.opcao;
  if(dados.recebimento && dados.recebimento!==next.tipo){const mudou=Boolean(next.tipo);next.tipo=dados.recebimento;delete next.cotacao;delete next.entregaAprovada;if(mudou)delete next.pagamento;}
  if(dados.cidade){const cidade=['Tietê','Jumirim','Cerquilho'].find(c=>normalizar(c)===normalizar(dados.cidade));if(!cidade)return resposta(s,'A cidade informada precisa ser confirmada com a loja.');if(cidade!==next.cidade){next.cidade=cidade;delete next.cotacao;delete next.entregaAprovada;}}
  for(const k of ['nome','endereco'])if(dados[k] && dados[k]!==next[k]){next[k]=dados[k];if(k==='endereco'){delete next.cotacao;delete next.entregaAprovada;delete next.complemento;}}
  if(dados.pagamento){if(next.tipo==='entrega' && dados.pagamento!=='pix')return retomar(s,'Entrega aceita somente por Pix antecipado. Para cartão ou dinheiro, escolha retirada.');next.pagamento=dados.pagamento;}
  invalidarResumo(next);
  delete next.escolhido;delete next.menuProdutos;
  if(checkout)return avancar(next,services);
  next.etapa='produto';
  return resposta(next,`Sacola: ${next.itens.map(i=>`${i.quantidade}x ${i.nome}`).join(', ') || 'vazia'}.\nSubtotal: ${moeda(subtotal(next))}\n${pergunta(next)}`);
}

export async function responderComIA(original,texto,services,interpretar) {
  let result;
  try{result=await decidir(original,texto,services,interpretar);}catch{result=faltou(original || novoEstado());}
  const s=result.state;
  if(!s)return result;
  if(original?.escolhido && s.etapa==='produto' && s.itens.some(i=>i.id===original.escolhido.id))s.ultimoProduto=original.escolhido.id;
  if(result.text){
    s.camposPendentes=camposFaltantes(s);
    s.perguntaPendente=s.etapa;
    s.ultimaPergunta=result.text.slice(-1600);
    s.ultimaRespostaTipo=result.consulta?'consulta':'fluxo';
    s.menuProdutos=result.text.startsWith('*Cardápio*')?result.opcoes.filter(o=>/^\d+$/.test(o.value)).map(o=>Number(o.value)):undefined;
    // Somente menus realmente numerados. Botões com valores textuais não criam números implícitos.
    s.opcoesExibidas=(result.opcoes || []).map(o=>({numero:(result.text.match(new RegExp('(?:^|\\n)\\*?([1-3])[^\\n]*'+o.title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i')) || [])[1],value:o.value})).filter(o=>o.numero);
    // Resumo sem texto pessoal: suficiente para referências, limitado a seis decisões.
    s.resumoRecente=[...(s.resumoRecente || []),{etapa:s.etapa,itens:s.itens.map(i=>({produto_id:i.id,quantidade:i.quantidade})),recebimento:s.tipo || null}].slice(-6);
  }
  return result;
}
