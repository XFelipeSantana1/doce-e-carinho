import { loja } from './loja.mjs';
import { camposFaltantes, assinaturaResumo, atualizarCatalogo, mostrarResumo } from './checkout.mjs';
import { randomUUID } from 'node:crypto';
const normalizar = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const moeda = value => Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const menu = 'Olá! Somos a *Doce & Carinho* 🧁\n\n*Como podemos ajudar?*\n1 — Ver cardápio e fazer pedido\n2 — Falar com a loja\n\nResponda com *1* ou *2*.';
const perguntaPagamento='*Pagamento na retirada*\nPagamento demonstrativo do TCC, sem cobrança automática.\n\n1 — Pix\n2 — Cartão\n3 — Dinheiro\n\nO pagamento precisa ser feito antes do preparo.\n\nResponda com *1*, *2* ou *3*.';
const pagamentoPara = state => state.tipo === 'entrega' ? '*Pagamento da entrega*\nPagamento demonstrativo do TCC, sem cobrança automática.\n\nPara entrega, o pagamento é antecipado e somente por Pix.\nO preparo começa após a loja confirmar o pagamento.\n\nDigite *1* para escolher Pix e conferir o resumo.' : perguntaPagamento;
const perguntaRecebimento='*Como deseja receber?*\n\n*1 — Retirar na loja*\nSem taxa. Aceita Pix, cartão ou dinheiro, antes do preparo.\n\n*2 — Receber em casa*\nTietê, Jumirim ou Cerquilho.\nSomente Pix antecipado. Não aceitamos cartão ou dinheiro na entrega.\nA taxa será mostrada antes de confirmar o pedido.\n\nResponda com *1* ou *2*.';
const rotuloPagamento=valor=>({pix:'Pix',cartao:'Cartão',dinheiro:'Dinheiro'}[valor]||valor);
export function novoEstado() { return {etapa:'menu',itens:[],chave:randomUUID()}; }
function disponibilidade(produto) {
  if(produto.quantidade_disponivel == null)return null;
  const quantidade=Number(produto.quantidade_disponivel);
  return Number.isFinite(quantidade) ? Math.max(0,Math.floor(quantidade)) : null;
}
function listar(produtos) { return '*Cardápio* 🧁\n\n' + produtos.map(p=>{
  const q=disponibilidade(p);
  const estoque=q===null?'quantidade sob consulta':q===0?'esgotado':`${q} ${q===1?'unidade disponível':'unidades disponíveis'}`;
  return `*${p.id} — ${p.nome}*\n${moeda(p.preco)} por unidade · ${estoque}`;
}).join('\n\n') + '\n\n*Para escolher:* digite o número do produto.\nJá terminou? Digite *FECHAR*.\n\nDisponibilidade sujeita à confirmação.'; }
function resumo(state,comTotal=true) { return state.itens.map(i=>`${i.quantidade}x ${i.nome} — ${moeda(i.preco*i.quantidade)}`).join('\n') + (comTotal?'\nSubtotal: '+moeda(state.itens.reduce((s,i)=>s+i.preco*i.quantidade,0)):''); }
async function responderManual(original,texto,servicos) {
  let state = structuredClone(original || novoEstado());
  const text = normalizar(texto);
  const opcao = (title, value) => ({title, value});
  const resposta = mensagem => {
    let opcoes = [];
    if (mensagem === menu) opcoes = [opcao('Ver cardápio','cardapio'), opcao('Falar com a loja','atendente')];
    else if (mensagem === perguntaRecebimento) opcoes = [opcao('Retirar na loja','retirada'), opcao('Receber em casa','entrega')];
    else if (mensagem === pagamentoPara(state)) opcoes = state.tipo === 'entrega'
      ? [opcao('Pix antecipado','pix')]
      : [opcao('Pix','pix'), opcao('Cartão','cartao'), opcao('Dinheiro','dinheiro')];
    else if (state.etapa === 'cidade') opcoes = [opcao('Tietê','tiete'), opcao('Jumirim','jumirim'), opcao('Cerquilho','cerquilho')];
    else if (state.etapa === 'validar_endereco') opcoes = [opcao('Aceitar endereço','1'), opcao('Corrigir endereço','2')];
    else if (state.etapa === 'confirmar') opcoes = [opcao('Confirmar pedido','confirmar'), opcao('Recomeçar','cancelar')];
    else if (state.etapa === 'incerto') opcoes = [opcao('Consultar pedido','confirmar')];
    else if (state.etapa === 'entrega_indisponivel') opcoes = [opcao('Retirar na loja','1'), opcao('Tentar novamente','2'), opcao('Falar com a loja','3')];
    else if (state.etapa === 'produto' && mensagem.startsWith('*Adicionado')) opcoes = [opcao('Mais produtos','cardapio'), opcao('Ver sacola','sacola'), opcao('Continuar pedido','fechar')];
    else if (state.etapa === 'concluido') opcoes = [opcao('Novo pedido','novo pedido')];
    return {state, text:mensagem, opcoes};
  };
  const respostaCardapio = async () => {
    const produtos = await servicos.catalogo();
    const result = resposta(listar(produtos));
    result.textoInterativo = '*Cardápio* 🧁\n\nToque em *Ver opções* e escolha um produto.\nVocê informa a quantidade na próxima etapa.\n\nDisponibilidade sujeita à confirmação.';
    result.opcoes = produtos.filter(p => disponibilidade(p) !== 0).map(p => ({
      title: `${p.id} — ${p.nome}`, value: String(p.id),
      description: `${p.nome} · ${moeda(p.preco)} · ${disponibilidade(p) === null ? 'sob consulta' : disponibilidade(p)+' disponíveis'}`,
    }));
    if (state.itens.length) result.opcoes.push(opcao('Continuar pedido','fechar'));
    return result;
  };
  if (state.etapa === 'incerto') {
    // Depois de um timeout, só a mesma confirmação pode ser reconsultada.
    if (!['confirmar','sim'].includes(text)) return resposta('Estou verificando a confirmação anterior. Digite CONFIRMAR para consultar novamente, sem duplicar o pedido.');
    state.etapa='confirmar';
  }
  const pedidoCancelamento = text.match(/^cancelar pedido(?:\s+#?(\d+))?$/);
  if (pedidoCancelamento || (text === 'cancelar' && state.etapa === 'concluido')) {
    const id = Number(pedidoCancelamento?.[1] || state.pedido?.id);
    if (!id) return resposta('Informe CANCELAR PEDIDO seguido do número do pedido.');
    try {
      await servicos.cancelar(id);
      return resposta(`*Cancelamento solicitado — pedido #${id}*\n\nO preparo está bloqueado até a loja avaliar sua solicitação.\nAguarde a confirmação por aqui.`);
    } catch (error) { return resposta(error.publicMessage || 'Não consegui registrar a solicitação. Tente novamente ou fale com a loja.'); }
  }
  if (state.etapa==='humano') {
    if(text!=='reiniciar') return {state,text:null};
    state.etapa=state.etapaAntesHumano || 'produto';delete state.etapaAntesHumano;
    return resposta('Atendimento automático retomado. Sua sacola foi mantida. Digite SACOLA para conferir ou FECHAR para continuar.');
  }
  if (['cancelar','reiniciar'].includes(text)) {state=novoEstado();return resposta('Sacola reiniciada. Pedidos já confirmados continuam válidos.\n\n'+menu);}
  if (text === 'menu') {if(state.etapa==='humano')return resposta('O atendimento automático está pausado. Escreva REINICIAR para voltar ao menu.');return resposta(menu);}
  if (text==='atendente' || (state.etapa==='menu' && text==='2')) {
    if (!loja.humanoNoMesmoWhatsApp) return resposta(loja.contatoHumano ? 'Fale com a loja: '+loja.contatoHumano : 'Não há um canal de atendimento humano configurado. Podemos continuar por aqui com os dados disponíveis.');
    state.etapaAntesHumano=state.etapa;state.etapa='humano';return resposta('O automático está pausado. Deixe sua dúvida para a loja responder neste WhatsApp. Não há confirmação de disponibilidade imediata da equipe. Digite REINICIAR para retomar sua sacola.');
  }
  if (state.etapa==='humano') return {state,text:null};
  if (['cardapio','estoque','disponibilidade'].includes(text)) {
    if(state.etapa==='menu')state.etapa='produto';
    return respostaCardapio();
  }
  if (state.etapa==='concluido') {
    if (text==='novo pedido') {state=novoEstado();return resposta(menu);}
    return resposta(`*Pedido #${state.pedido.id} já registrado*\n\nAs atualizações chegam por aqui.\n\n• Outra compra: digite *NOVO PEDIDO*.\n• Solicitar cancelamento antes do preparo: digite *CANCELAR PEDIDO*.`);
  }
  if (text==='sacola') return resposta(state.itens.length ? '*Sua sacola*\n\n'+resumo(state)+'\n\nDigite *FECHAR* para continuar o pedido.' : 'Sua sacola está vazia. Escreva CARDÁPIO para escolher.');
  if(state.etapa==='confirmar' && !state.tipo && original?.etapa!=='incerto') {state.etapa='recebimento';return resposta(perguntaRecebimento);}
  if (state.etapa==='confirmar' && ['confirmar','sim'].includes(text)) {
    if(original?.etapa!=='incerto') {
      const faltam=camposFaltantes(state);
      if(faltam.length) return resposta('Ainda faltam informações: '+faltam.join(', ')+'. Digite FECHAR para completar.');
      const atual=await atualizarCatalogo(state,servicos);
      if(atual.erro) {delete state.confirmacaoPendente;state.etapa='produto';return resposta(atual.erro);}
      if(atual.mudou || state.confirmacaoPendente!==assinaturaResumo(state)) {
        const r=mostrarResumo(state);r.text='Confira o resumo atualizado antes de confirmar.\n'+r.text;return r;
      }
    }
    state.etapa='incerto';
    await servicos.salvar(state); // Persiste a chave antes da chamada que dá baixa no estoque.
    try {
      const pedido=await servicos.criar({whatsapp:servicos.telefone,nome_cliente:state.nome,forma_pagamento:state.pagamento,
        itens:state.itens.map(i=>({produto_id:i.id,quantidade:i.quantidade})),chave_idempotencia:state.chave,
        tipo_recebimento:state.tipo||'retirada',cotacao_entrega:state.cotacao?.token,
        valor_produtos_confirmado:state.itens.reduce((s,i)=>s+i.preco*i.quantidade,0)});
      state.etapa='concluido';state.pedido=pedido;
      return resposta(`*Pedido #${pedido.id} registrado!* 🧁\n\nTotal: *${moeda(pedido.valor_total)}*\nPagamento: ${rotuloPagamento(state.pagamento)}\nSituação: *aguardando pagamento*\n\n*Próximo passo*\nCombine o pagamento com a loja por aqui. O preparo começa após a confirmação do pagamento.\n\nVocê receberá as atualizações neste WhatsApp.\nPara pedir cancelamento antes do preparo, digite *CANCELAR PEDIDO*.`);
    } catch(error) {
      if(error.status===409 && /cota[cç][aã]o/i.test(error.publicMessage||'')) {state.etapa='complemento';delete state.cotacao;return resposta('A cotação expirou. Envie novamente o complemento (ou SEM) para recalcular e aprovar o total antes de confirmar.');}
      if(error.status===409 || error.status===400) {state.etapa='produto';return resposta(`Não foi possível confirmar: ${error.publicMessage}\nRevise a sacola. Escreva CANCELAR para começar de novo ou ATENDENTE para falar com a loja.`);}
      return resposta('Não consegui verificar a confirmação agora. Digite CONFIRMAR para consultar novamente com segurança.');
    }
  }
  if(state.etapa==='confirmar') return resposta('Confira o resumo acima e digite CONFIRMAR. Para desistir antes da confirmação, escreva CANCELAR.');
  if(state.etapa==='nome') {
    if(texto.trim().length<2 || texto.trim().length>120 || /[?]|\b(?:quanto|como|quero|mudar|cancelar)\b/i.test(texto))return resposta('Qual é seu nome? Use entre 2 e 120 caracteres.');
    state.nome=texto.trim();state.etapa='recebimento';return resposta(perguntaRecebimento);
  }
  if(state.etapa==='recebimento') {
    if(['1','retirada','retirar'].includes(text)){state.tipo='retirada';delete state.cotacao;state.etapa='pagamento';return resposta(pagamentoPara(state));}
    if(['2','entrega'].includes(text)){state.tipo='entrega';state.etapa='cidade';return resposta('*Em qual cidade você vai receber?*\n\n1 — Tietê\n2 — Jumirim\n3 — Cerquilho\n\nResponda com *1*, *2* ou *3*.');}
    return resposta(perguntaRecebimento);
  }
  if(state.etapa==='cidade') {
    const cidades={'1':'Tietê','tiete':'Tietê','2':'Jumirim','jumirim':'Jumirim','3':'Cerquilho','cerquilho':'Cerquilho'};
    if(!cidades[text])return resposta('Entregamos somente em Tietê, Jumirim e Cerquilho. Digite uma dessas cidades ou CANCELAR.');
    state.cidade=cidades[text];state.etapa='endereco';return resposta('*Qual é o endereço da entrega?*\n\nEnvie rua, número e bairro na mesma mensagem.\nExemplo: Rua das Flores, 123, Centro.');
  }
  if(state.etapa==='endereco') {
    if(texto.trim().length<8 || texto.length>250 || !/\d/.test(texto))return resposta('Preciso da rua, número e bairro. Use até 250 caracteres.');
    state.endereco=texto.trim();state.etapa='complemento';return resposta('*Tem complemento ou ponto de referência?*\n\nExemplo: casa 2, ao lado da farmácia.\nSe não tiver, digite *SEM*.');
  }
  if(state.etapa==='complemento' || state.etapa==='entrega_indisponivel') {
    if(state.etapa==='entrega_indisponivel') {
      if(text==='1'){state.tipo='retirada';delete state.cotacao;state.etapa='pagamento';return resposta(pagamentoPara(state));}
      if(text==='3'){state.etapa='humano';return resposta('Deixe sua dúvida por aqui para a loja avaliar a entrega. Nenhum pedido foi confirmado.');}
      if(text!=='2')return resposta('1 — Retirar na loja\n2 — Tentar calcular novamente\n3 — Falar com atendente');
    } else {
      if(texto.length>150)return resposta('Use até 150 caracteres para o complemento, ou escreva SEM.');
      state.complemento=['sem','nao'].includes(text)?'':texto.trim();
    }
    try {
      state.cotacao=await servicos.cotar({whatsapp:servicos.telefone,cidade:state.cidade,endereco:state.endereco,complemento:state.complemento});
      state.etapa='validar_endereco';
      return resposta(`*Confira a entrega*\n\n${state.cotacao.endereco}${state.complemento?'\nComplemento: '+state.complemento:''}\n\nTaxa de entrega: *${moeda(state.cotacao.taxa_entrega)}*\n\n1 — Aceitar endereço e taxa\n2 — Corrigir endereço\n\nResponda com *1* ou *2*.`);
    } catch(error) {
      if(error.status===400 || error.status===409){state.etapa='endereco';return resposta(`${error.publicMessage||'Não localizei esse endereço com segurança.'}\nEnvie novamente rua, número e bairro, ou escreva ATENDENTE.`);}
      state.etapa='entrega_indisponivel';return resposta(`${error.publicMessage||'Não consegui consultar a rota agora.'}\nNenhum pedido foi confirmado.\n1 — Retirar na loja\n2 — Tentar novamente\n3 — Falar com atendente`);
    }
  }
  if(state.etapa==='validar_endereco') {
    if(['1','sim','correto'].includes(text)){state.entregaAprovada=true;state.etapa='pagamento';return resposta(pagamentoPara(state));}
    if(text==='2'){delete state.cotacao;state.etapa='endereco';return resposta('Informe novamente rua, número e bairro.');}
    return resposta('Confira o endereço e digite 1 para aceitar ou 2 para corrigir.');
  }
  if(state.etapa==='pagamento') {
    if(!state.tipo){state.etapa='recebimento';return resposta(perguntaRecebimento);}
    const formas={'1':'pix','pix':'pix','2':'cartao','cartao':'cartao','3':'dinheiro','dinheiro':'dinheiro'};
    if(!formas[text] || (state.tipo==='entrega' && formas[text]!=='pix')) return resposta(pagamentoPara(state));
    state.pagamento=formas[text];
    const atual=await atualizarCatalogo(state,servicos);
    if(atual.erro){state.etapa='produto';return resposta(atual.erro);}
    return mostrarResumo(state);
  }
  if(state.etapa==='quantidade') {
    if(!/^\d{1,3}$/.test(text) || Number(text)<1 || Number(text)>99)return resposta('Digite uma quantidade inteira entre 1 e 99.');
    const quantidade=Number(text),existente=state.itens.find(i=>i.id===state.escolhido.id);
    const atual=(await servicos.catalogo()).find(p=>p.id===state.escolhido.id);
    if(!atual || disponibilidade(atual)===0){state.etapa='produto';delete state.escolhido;return resposta('Esse produto ficou indisponível. Escreva CARDÁPIO para ver as opções atuais.');}
    const limite=disponibilidade(atual);
    if(limite!==null && (existente?.quantidade||0)+quantidade>limite)return resposta(`No momento há ${limite} ${limite===1?'unidade disponível':'unidades disponíveis'} desse produto, incluindo o que já está na sua sacola. Digite uma quantidade menor ou CANCELAR para recomeçar.`);
    if((existente?.quantidade||0)+quantidade>99)return resposta('O limite é 99 unidades por produto. Digite uma quantidade menor.');
    if(existente)existente.quantidade+=quantidade;else state.itens.push({...state.escolhido,quantidade});
    const nome=state.escolhido.nome;delete state.escolhido;state.etapa='produto';return resposta(`*Adicionado à sacola*\n${quantidade}x ${nome}\n\n*O que deseja fazer agora?*\n• Adicionar outro: digite o número do produto.\n• Ver os itens: digite *SACOLA*.\n• Continuar o pedido: digite *FECHAR*.`);
  }
  if(text==='fechar') {
    if(!state.itens.length)return resposta('A sacola está vazia. Escreva CARDÁPIO para escolher seus produtos.');
    state.etapa='nome';return resposta('*Em qual nome fica o pedido?*\n\nDigite seu nome.');
  }
  // Aceita a mensagem gerada pela vitrine, sempre consultando IDs e preços reais.
  if(text.includes('quero fazer um pedido') && texto.includes('•')) {
    if(/^Obs:\s*\S/im.test(texto)){state.etapa='humano';return resposta('Recebi sua observação. A loja vai conferir o pedido antes de confirmar.');}
    const produtos=await servicos.catalogo(), linhas=[...texto.matchAll(/•\s*(\d+)x\s+(.+?)\s+—/g)];
    const itens=[];
    for(const linha of linhas){const p=produtos.find(p=>normalizar(p.nome)===normalizar(linha[2]));const q=Number(linha[1]);if(!p || q<1 || q>99)return resposta('Não consegui conferir todos os itens recebidos. Escreva CARDÁPIO para montar o pedido por aqui.');itens.push({id:p.id,nome:p.nome,preco:Number(p.preco),quantidade:q});}
    if(!itens.length)return resposta(menu);
    state.itens=itens;state.etapa='nome';return resposta(`Recebi a sacola da vitrine:\n\n${resumo(state)}\n\nQual é seu nome?`);
  }
  if(['cardapio','1','fazer pedido'].includes(text) && state.etapa==='menu' || text==='cardapio') {state.etapa='produto';return respostaCardapio();}
  if(state.etapa==='produto') {
    const produtos=await servicos.catalogo(), produto=produtos.find(p=>String(p.id)===text || normalizar(p.nome)===text);
    if(!produto)return resposta('Não encontrei esse produto. Digite o número mostrado no CARDÁPIO, ou FECHAR para concluir a sacola.');
    if(disponibilidade(produto)===0)return resposta('Esse produto está esgotado no momento. Escolha outro número ou escreva CARDÁPIO para consultar as quantidades.');
    state.escolhido={id:produto.id,nome:produto.nome,preco:Number(produto.preco)};state.etapa='quantidade';return resposta(`*${produto.nome}*\n${moeda(produto.preco)} por unidade\n\nQuantas unidades você deseja?\nDigite uma quantidade de *1 a 99*.`);
  }
  return resposta(menu);
}

// Uma única apresentação para respostas manuais e botões.
export async function responder(original,texto,servicos) {
  const result=await responderManual(original,texto,servicos);
  for(const k of ['text','textoInterativo']) if(result[k]) result[k]=result[k].replace(/\p{Extended_Pictographic}\uFE0F?/gu,'').replace(/ +\n/g,'\n');
  if(result.text && loja.pagamentoDemonstrativo && /pedido #.*registrado/is.test(result.text)) result.text+='\nPagamento demonstrativo do TCC, sem cobrança automática.';
  return result;
}
