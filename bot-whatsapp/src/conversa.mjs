import { randomUUID } from 'node:crypto';
const normalizar = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const moeda = value => Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const menu = 'Olá! Bem-vindo à Doce & Carinho. 🧁\n\n1 — Cardápio e pedidos\n2 — Falar com a loja\n\nAtalhos: MENU · SACOLA · CANCELAR';
const perguntaPagamento='Como deseja pagar?\n\n1 — Pix\n2 — Cartão\n3 — Dinheiro';
const perguntaRecebimento='Como deseja receber?\n\n1 — Retirada na loja, sem taxa\n2 — Entrega em Tietê, Jumirim ou Cerquilho\n\nVocê confere a taxa antes de confirmar.';
const rotuloPagamento=valor=>({pix:'Pix',cartao:'Cartão',dinheiro:'Dinheiro'}[valor]||valor);
export function novoEstado() { return {etapa:'menu',itens:[],chave:randomUUID()}; }
function disponibilidade(produto) {
  if(produto.quantidade_disponivel == null)return null;
  const quantidade=Number(produto.quantidade_disponivel);
  return Number.isFinite(quantidade) ? Math.max(0,Math.floor(quantidade)) : null;
}
function listar(produtos) { return 'Nosso cardápio:\n\n' + produtos.map(p=>{
  const q=disponibilidade(p);
  const estoque=q===null?'quantidade sob consulta':q===0?'esgotado':`${q} ${q===1?'unidade disponível':'unidades disponíveis'}`;
  return `${p.id} — ${p.nome} · ${moeda(p.preco)}\n${estoque}`;
}).join('\n\n') + '\n\nDigite o número do produto ou FECHAR.\nDisponibilidade sujeita à confirmação.'; }
function resumo(state,comTotal=true) { return state.itens.map(i=>`${i.quantidade}x ${i.nome} — ${moeda(i.preco*i.quantidade)}`).join('\n') + (comTotal?'\nSubtotal: '+moeda(state.itens.reduce((s,i)=>s+i.preco*i.quantidade,0)):''); }
export async function responder(original,texto,servicos) {
  let state = structuredClone(original || novoEstado());
  const text = normalizar(texto);
  const resposta = mensagem => ({state,text:mensagem});
  if (state.etapa === 'incerto') {
    // Depois de um timeout, só a mesma confirmação pode ser reconsultada.
    if (!['confirmar','sim'].includes(text)) return resposta('Estou verificando a confirmação anterior. Digite CONFIRMAR para consultar novamente, sem duplicar o pedido.');
    state.etapa='confirmar';
  }
  if (['cancelar','reiniciar'].includes(text)) {state=novoEstado();return resposta('Sacola reiniciada. Pedidos já confirmados continuam válidos.\n\n'+menu);}
  if (text === 'menu') {if(state.etapa==='humano')return resposta('O atendimento automático está pausado. Escreva REINICIAR para voltar ao menu.');return resposta(menu);}
  if (text==='atendente' || (state.etapa==='menu' && text==='2')) {state.etapa='humano';return resposta('Deixe sua mensagem para a loja. Para voltar ao bot, digite REINICIAR.');}
  if (state.etapa==='humano') return {state,text:null};
  if (['cardapio','estoque','disponibilidade'].includes(text)) {
    if(state.etapa==='menu')state.etapa='produto';
    return resposta(listar(await servicos.catalogo()));
  }
  if (state.etapa==='concluido') {
    if (text==='novo pedido') {state=novoEstado();return resposta(menu);}
    return resposta(`Pedido #${state.pedido.id} já registrado. Avisaremos as atualizações por aqui.\n\nPara comprar de novo: NOVO PEDIDO.`);
  }
  if (text==='sacola') return resposta(state.itens.length ? resumo(state)+'\n\nEscreva FECHAR para continuar.' : 'Sua sacola está vazia. Escreva CARDÁPIO para escolher.');
  if(state.etapa==='confirmar' && !state.tipo && original?.etapa!=='incerto') {state.etapa='recebimento';return resposta(perguntaRecebimento);}
  if (state.etapa==='confirmar' && ['confirmar','sim'].includes(text)) {
    state.etapa='incerto';
    await servicos.salvar(state); // Persiste a chave antes da chamada que dá baixa no estoque.
    try {
      const pedido=await servicos.criar({whatsapp:servicos.telefone,nome_cliente:state.nome,forma_pagamento:state.pagamento,
        itens:state.itens.map(i=>({produto_id:i.id,quantidade:i.quantidade})),chave_idempotencia:state.chave,
        tipo_recebimento:state.tipo||'retirada',cotacao_entrega:state.cotacao?.token,
        valor_produtos_confirmado:state.itens.reduce((s,i)=>s+i.preco*i.quantidade,0)});
      state.etapa='concluido';state.pedido=pedido;
      return resposta(`Pedido #${pedido.id} confirmado! 🧁\nTotal: ${moeda(pedido.valor_total)}\n${rotuloPagamento(state.pagamento)} · pagamento pendente\n\nAvisaremos as atualizações por aqui.`);
    } catch(error) {
      if(error.status===409 && /cota[cç][aã]o/i.test(error.publicMessage||'')) {state.etapa='complemento';delete state.cotacao;return resposta('A cotação expirou. Envie novamente o complemento (ou SEM) para recalcular e aprovar o total antes de confirmar.');}
      if(error.status===409 || error.status===400) {state.etapa='produto';return resposta(`Não foi possível confirmar: ${error.publicMessage}\nRevise a sacola. Escreva CANCELAR para começar de novo ou ATENDENTE para falar com a loja.`);}
      return resposta('Não consegui verificar a confirmação agora. Digite CONFIRMAR para consultar novamente com segurança.');
    }
  }
  if(state.etapa==='confirmar') return resposta('Confira o resumo acima e digite CONFIRMAR. Para desistir antes da confirmação, escreva CANCELAR.');
  if(state.etapa==='nome') {
    if(texto.trim().length<2 || texto.trim().length>120)return resposta('Qual é seu nome? Use entre 2 e 120 caracteres.');
    state.nome=texto.trim();state.etapa='recebimento';return resposta(perguntaRecebimento);
  }
  if(state.etapa==='recebimento') {
    if(['1','retirada','retirar'].includes(text)){state.tipo='retirada';delete state.cotacao;state.etapa='pagamento';return resposta(perguntaPagamento);}
    if(['2','entrega'].includes(text)){state.tipo='entrega';state.etapa='cidade';return resposta('Qual é a cidade da entrega?\n1 — Tietê\n2 — Jumirim\n3 — Cerquilho');}
    return resposta(perguntaRecebimento);
  }
  if(state.etapa==='cidade') {
    const cidades={'1':'Tietê','tiete':'Tietê','2':'Jumirim','jumirim':'Jumirim','3':'Cerquilho','cerquilho':'Cerquilho'};
    if(!cidades[text])return resposta('Entregamos somente em Tietê, Jumirim e Cerquilho. Digite uma dessas cidades ou CANCELAR.');
    state.cidade=cidades[text];state.etapa='endereco';return resposta('Informe a rua, o número e o bairro da entrega. Exemplo: Rua das Flores, 123, Centro.');
  }
  if(state.etapa==='endereco') {
    if(texto.trim().length<8 || texto.length>250 || !/\d/.test(texto))return resposta('Preciso da rua, número e bairro. Use até 250 caracteres.');
    state.endereco=texto.trim();state.etapa='complemento';return resposta('Há complemento ou referência? Informe agora ou escreva SEM.');
  }
  if(state.etapa==='complemento' || state.etapa==='entrega_indisponivel') {
    if(state.etapa==='entrega_indisponivel') {
      if(text==='1'){state.tipo='retirada';delete state.cotacao;state.etapa='pagamento';return resposta(perguntaPagamento);}
      if(text==='3'){state.etapa='humano';return resposta('Deixe sua dúvida por aqui para a loja avaliar a entrega. Nenhum pedido foi confirmado.');}
      if(text!=='2')return resposta('1 — Retirar na loja\n2 — Tentar calcular novamente\n3 — Falar com atendente');
    } else {
      if(texto.length>150)return resposta('Use até 150 caracteres para o complemento, ou escreva SEM.');
      state.complemento=['sem','nao'].includes(text)?'':texto.trim();
    }
    try {
      state.cotacao=await servicos.cotar({whatsapp:servicos.telefone,cidade:state.cidade,endereco:state.endereco,complemento:state.complemento});
      state.etapa='validar_endereco';
      return resposta(`Endereço: ${state.cotacao.endereco}${state.complemento?'\nComplemento: '+state.complemento:''}\nEntrega: ${moeda(state.cotacao.taxa_entrega)}\n\n1 — Confirmar endereço\n2 — Corrigir`);
    } catch(error) {
      if(error.status===400 || error.status===409){state.etapa='endereco';return resposta(`${error.publicMessage||'Não localizei esse endereço com segurança.'}\nEnvie novamente rua, número e bairro, ou escreva ATENDENTE.`);}
      state.etapa='entrega_indisponivel';return resposta(`${error.publicMessage||'Não consegui consultar a rota agora.'}\nNenhum pedido foi confirmado.\n1 — Retirar na loja\n2 — Tentar novamente\n3 — Falar com atendente`);
    }
  }
  if(state.etapa==='validar_endereco') {
    if(['1','sim','correto'].includes(text)){state.etapa='pagamento';return resposta(perguntaPagamento);}
    if(text==='2'){delete state.cotacao;state.etapa='endereco';return resposta('Informe novamente rua, número e bairro.');}
    return resposta('Confira o endereço e digite 1 para aceitar ou 2 para corrigir.');
  }
  if(state.etapa==='pagamento') {
    if(!state.tipo){state.etapa='recebimento';return resposta(perguntaRecebimento);}
    const formas={'1':'pix','pix':'pix','2':'cartao','cartao':'cartao','3':'dinheiro','dinheiro':'dinheiro'};
    if(!formas[text])return resposta('Escolha 1 para Pix, 2 para cartão ou 3 para dinheiro.');
    state.pagamento=formas[text];
    const produtos=await servicos.catalogo();
    for(const item of state.itens){const atual=produtos.find(p=>p.id===item.id);if(!atual){state.etapa='produto';return resposta(`${item.nome} não está mais disponível. Escreva CANCELAR para refazer a sacola ou ATENDENTE para ajuda.`);}item.preco=Number(atual.preco);}
    const subtotal=state.itens.reduce((s,i)=>s+i.preco*i.quantidade,0),taxa=state.tipo==='entrega'?state.cotacao.taxa_entrega:0;
    state.etapa='confirmar';return resposta(`Confira seu pedido:\n\n${resumo(state,false)}\n\nProdutos: ${moeda(subtotal)}\nEntrega: ${moeda(taxa)}\n*Total: ${moeda(subtotal+taxa)}*\n\n${state.tipo==='entrega'?state.cotacao.endereco+(state.complemento?'\n'+state.complemento:''):'Retirada: Etec de Tietê\nRua Manira Jacob Biscaron, 45.'}\n${state.nome} · ${rotuloPagamento(state.pagamento)}\n\nCONFIRMAR para concluir · CANCELAR para recomeçar`);
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
    const nome=state.escolhido.nome;delete state.escolhido;state.etapa='produto';return resposta(`Adicionado: ${quantidade}x ${nome}.\n\nOutro produto: digite o número.\nFECHAR · SACOLA · CARDÁPIO`);
  }
  if(text==='fechar') {
    if(!state.itens.length)return resposta('A sacola está vazia. Escreva CARDÁPIO para escolher seus produtos.');
    state.etapa='nome';return resposta('Qual é seu nome para o pedido?');
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
  if(['cardapio','1','fazer pedido'].includes(text) && state.etapa==='menu' || text==='cardapio') {state.etapa='produto';return resposta(listar(await servicos.catalogo()));}
  if(state.etapa==='produto') {
    const produtos=await servicos.catalogo(), produto=produtos.find(p=>String(p.id)===text || normalizar(p.nome)===text);
    if(!produto)return resposta('Não encontrei esse produto. Digite o número mostrado no CARDÁPIO, ou FECHAR para concluir a sacola.');
    if(disponibilidade(produto)===0)return resposta('Esse produto está esgotado no momento. Escolha outro número ou escreva CARDÁPIO para consultar as quantidades.');
    state.escolhido={id:produto.id,nome:produto.nome,preco:Number(produto.preco)};state.etapa='quantidade';return resposta(`Quantas unidades de ${produto.nome} você quer?`);
  }
  return resposta(menu);
}
