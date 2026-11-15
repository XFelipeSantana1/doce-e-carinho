# Regras de pedidos, pagamento e confirmação

O pagamento é confirmado manualmente pela gestão; não há integração bancária. Na demonstração, a gestão aprova o recebimento para liberar o preparo.

- Toda forma de pagamento exige status Pago antes de iniciar preparo e concluir o pedido. Cartão e dinheiro ficam disponíveis somente para retirada; nesse caso, o cliente paga antes de começar o preparo.
- Entrega em domicílio aceita somente Pix antecipado, também validado na API.
- Fluxo: pendente → em preparo → pronto → saiu para entrega (somente entrega) → entregue. Não é permitido pular preparo.
- O painel pede confirmação de avanço, pagamento, cancelamento e conclusão. Voltar fecha a confirmação sem salvar. A API recusa avanços baseados em uma etapa desatualizada.
- No WhatsApp, CANCELAR PEDIDO solicita cancelamento do último pedido da conversa; CANCELAR PEDIDO #123 funciona também após reiniciar a conversa. A solicitação é vinculada ao telefone do cliente. Antes do preparo, bloqueia o avanço e aparece em um alerta na tela Pedidos, atualizada a cada 10 segundos.
- A gestão cancela o pedido ou confirma que conversou com o cliente e ele deseja manter. Após iniciar preparo, não há cancelamento automático; o bot orienta contato com a loja. Isso evita restaurar estoque de ingredientes já consumidos.
- Cancelar devolve o estoque debitado, mas não executa um reembolso financeiro. Pedido cancelado e pago fica com reembolso pendente até a gestão devolver o valor e registrar Estornado.
- Ao ficar pronto, o pedido ganha um código aleatório de quatro dígitos e o cliente recebe o código pelo aviso WhatsApp. O motorista pede esse código somente no recebimento; na retirada, a loja pede ao cliente. A gestão informa o código no pedido e confirma a conclusão.
- A API exige pagamento e etapa correta, valida o código junto do ID e o consome na conclusão. O código não aparece nas respostas de listagem/detalhe do painel. Cinco erros bloqueiam tentativas por cinco minutos.
- O bot e os avisos continuam restritos ao telefone de teste configurado. Mensagens não são disparadas pelos testes automatizados.

## Atualização do banco

A migração aditiva está em backend/seed/controle-pedidos.sql e foi incorporada a migracoes.sql. Ela acrescenta solicitação de cancelamento e controle de tentativas, sem apagar pedidos. No Codespace em que a alteração foi desenvolvida, já foi aplicada.

## Verificações

- Backend: npm test (em backend).
- Integração HTTP/MySQL: npm run test:integration (em backend). Usa o MYSQL_ROOT_PASSWORD do .env da raiz para criar um banco exclusivo com nome doce_test_aleatorio e apaga somente esse banco ao terminar. Nunca usa pedidos existentes nem envia WhatsApp.
- Bot: npm test (em bot-whatsapp).
- Builds: npm run build em backend e painel-admin.

Pedidos antigos já prontos sem código precisam de tratamento pela gestão antes de concluir; não são enviados avisos retroativos automaticamente.
