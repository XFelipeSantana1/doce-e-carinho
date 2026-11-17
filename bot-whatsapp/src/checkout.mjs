import { loja } from './loja.mjs';
const moeda = n => Number(n).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
export const subtotal = s => Math.round(s.itens.reduce((n,i)=>n+Math.round(Number(i.preco)*100)*i.quantidade,0))/100;
export function camposFaltantes(s) {
  const faltam = [];
  if (!s.itens?.length) faltam.push('itens');
  if (!s.nome) faltam.push('nome');
  if (!['retirada','entrega'].includes(s.tipo)) faltam.push('recebimento');
  if (s.tipo === 'entrega') {
    if (!s.cidade) faltam.push('cidade');
    if (!s.endereco) faltam.push('endereco');
    if (s.complemento === undefined) faltam.push('complemento');
    if (!s.cotacao?.token || !s.entregaAprovada) faltam.push('cotacao');
  }
  if (!['pix','cartao','dinheiro'].includes(s.pagamento) || s.tipo==='entrega' && s.pagamento!=='pix') faltam.push('pagamento');
  return faltam;
}
export function assinaturaResumo(s) {
  return JSON.stringify({itens:s.itens.map(i=>[i.id,i.quantidade,Math.round(i.preco*100)]),nome:s.nome,tipo:s.tipo,pagamento:s.pagamento,cotacao:s.cotacao?.token,endereco:s.endereco,complemento:s.complemento});
}
export function invalidarResumo(s) { delete s.confirmacaoPendente; delete s._metaUi; }
export async function atualizarCatalogo(s, services) {
  const produtos = await services.catalogo();
  let mudou = false;
  for (const i of s.itens) {
    const p = produtos.find(p=>Number(p.id)===i.id);
    if (!p || !Number.isFinite(Number(p.preco)) || Number(p.preco)<0) return {erro:`${i.nome} não está disponível. Remova ou substitua esse item.`, mudou};
    if (p.quantidade_disponivel != null && Number(p.quantidade_disponivel)<i.quantidade) return {erro:`Não há disponibilidade para ${i.quantidade}x ${p.nome}. Informe uma quantidade menor ou outro produto.`, mudou};
    mudou ||= Math.round(i.preco*100)!==Math.round(Number(p.preco)*100);
    i.preco=Number(p.preco);i.nome=p.nome;
  }
  return {mudou};
}
export function mostrarResumo(s) {
  const taxa=s.tipo==='entrega'?Number(s.cotacao.taxa_entrega):0;
  s.etapa='confirmar'; s.confirmacaoPendente=assinaturaResumo(s);
  return {state:s,text:`Confira seu pedido:\n${s.itens.map(i=>`${i.quantidade}x ${i.nome} — ${moeda(i.preco*i.quantidade)}`).join('\n')}\nProdutos: ${moeda(subtotal(s))}\nEntrega: ${moeda(taxa)}\nTotal: ${moeda(subtotal(s)+taxa)}\n${s.tipo==='entrega'?s.cotacao.endereco:loja.retirada || 'Local a confirmar com a loja'}\nNome: ${s.nome}\nPagamento: ${s.pagamento}\n${loja.pagamentoDemonstrativo?'Pagamento demonstrativo do TCC, sem cobrança automática.\n':''}Digite CONFIRMAR para registrar ou informe o que deseja corrigir.`,opcoes:[{title:'Confirmar pedido',value:'confirmar'},{title:'Ver sacola',value:'sacola'}]};
}
