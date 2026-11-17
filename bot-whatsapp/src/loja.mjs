// Informações de atendimento. null = não informado; nunca completar por suposição.
// Área, taxa e disponibilidade são decididas pela API; estes textos não alteram o backend.
export const loja = {
  nome: 'Doce & Carinho',
  horarios: null,
  areaEntrega: 'Tietê, Jumirim e Cerquilho',
  taxaEntrega: null, // null: consultar a cotação da API para cada endereço.
  prazo: null,
  antecedencia: null,
  personalizacoes: null,
  cancelamentos: null,
  retirada: 'Etec de Tietê — Rua Manira Jacob Biscaron, 45',
  contatoHumano: null,
  // A loja pode responder na própria conta WAHA já conectada. Não há fila de agentes.
  humanoNoMesmoWhatsApp: true,
  pagamentoDemonstrativo: true,
};

export function informacaoLoja(assunto) {
  const naoInformada = 'Essa informação ainda não foi informada. Precisa ser confirmada com a loja.';
  const textos = {
    horario: loja.horarios || naoInformada,
    prazo: loja.prazo || naoInformada,
    antecedencia: loja.antecedencia || naoInformada,
    personalizacoes: loja.personalizacoes || naoInformada,
    cancelamento: loja.cancelamentos || naoInformada,
    ingredientes: 'Não consigo garantir ingredientes, ausência de alérgenos ou alterações na receita. Confirme com a loja antes de pedir.',
    entrega: `Área configurada: ${loja.areaEntrega || 'não informada'}. ${loja.taxaEntrega || 'A taxa e a disponibilidade são consultadas no sistema antes da confirmação.'} Entrega aceita somente Pix antecipado.`,
    retirada: `Retirada: ${loja.retirada || 'local a confirmar com a loja'}. Sem taxa de entrega. Horário a combinar com a loja.`,
    pagamento: 'Retirada: Pix, cartão ou dinheiro. Entrega: somente Pix antecipado. Escolher a forma ou dizer que pagou não confirma recebimento. A confirmação é feita pela gestão.',
    ajuda: 'Você pode informar produto e quantidade com suas palavras. Use SACOLA para conferir, FECHAR para continuar ou ATENDENTE para falar com a loja.',
  };
  return (textos[assunto] || textos.ajuda) + (assunto === 'pagamento' && loja.pagamentoDemonstrativo ? '\nPagamento demonstrativo do TCC, sem cobrança automática.' : '');
}
