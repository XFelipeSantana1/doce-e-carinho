export function AvisoWhatsApp({ estado, pagamento = false }: { estado?: string | null; pagamento?: boolean }): JSX.Element | null {
  if (!estado) return null;
  const mensagens: Record<string, string> = {
    enviado: 'Aviso da atualização enviado ao cliente pelo WhatsApp.',
    falha: 'O status do pedido foi salvo, mas o aviso no WhatsApp não foi enviado. Confira a conexão e avise o cliente manualmente.',
    bloqueado: 'O status do pedido foi salvo. O aviso não foi enviado porque o WhatsApp está em modo de teste, restrito ao cliente autorizado.',
    incerto: 'O status do pedido foi salvo, mas não foi possível confirmar o envio do aviso. Confira a conversa no WhatsApp antes de enviar outra mensagem.',
    enviando: 'O status do pedido foi salvo. O envio do aviso ainda não foi confirmado; confira a conversa antes de enviar outra mensagem.',
    pendente: 'O status do pedido foi salvo e o aviso da atualização está pendente. Confira a conversa no WhatsApp.',
  };
  const texto = pagamento && estado === 'enviado' ? 'Confirmação de pagamento enviada pelo WhatsApp.' : mensagens[estado] ?? 'Confira o aviso na conversa do WhatsApp.';
  return <p role="status" className="rounded-campo border border-borda bg-areia px-3 py-2 text-sm text-tinta">{pagamento && estado !== 'enviado' ? 'Aviso de pagamento: ' : ''}{texto}</p>;
}
