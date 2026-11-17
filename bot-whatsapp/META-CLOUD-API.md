# Ativação da API oficial do WhatsApp

O código suporta `WHATSAPP_PROVIDER=waha` (atual) e `meta` (Cloud API). A migração foi preparada, mas a ativação exige uma conta Meta configurada. Não é necessário apagar o banco nem sair do WhatsApp no WAHA para preparar ou testar o código.

## 1. Preparar a conta

Siga o [guia oficial da Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started): crie um aplicativo com o caso de uso WhatsApp e abra API Setup. Para a primeira validação, use o número de teste fornecido pela Meta e cadastre somente o cliente autorizado como destinatário. Isso permite testar sem migrar o número real da loja imediatamente.

Para usar o número real da loja, confira no painel Meta a elegibilidade e o procedimento de registro/coexistência disponíveis para essa conta. Não exclua a conta do aplicativo nem desconecte o WAHA antes dessa conferência. O QR do WAHA não habilita a Cloud API. A conexão oficial e suas permissões são independentes.

## 2. Preencher segredos localmente

Em `bot-whatsapp/.env.local`, preencher sem colocar segredos no chat ou no Git:

```dotenv
# Mantenha waha enquanto prepara os outros valores.
WHATSAPP_PROVIDER=waha
META_API_VERSION=versao_disponivel_no_painel
META_PHONE_NUMBER_ID=id_do_numero_na_meta
META_ACCESS_TOKEN=token_da_conta
META_APP_SECRET=segredo_do_aplicativo
META_VERIFY_TOKEN=valor_aleatorio_exclusivo_para_validar_o_webhook
# Opcional, número internacional com DDI, somente dígitos:
META_EXPECTED_SHOP_PHONE=
```

`META_PHONE_NUMBER_ID` é o identificador numérico da Meta, não o telefone. Use a versão da Graph API indicada no seu painel. O token deve ter acesso ao número e permissão de mensagens. Tokens temporários expiram; para operação contínua, configure o token apropriado segundo a documentação Meta.

Manter `BOT_TEST_PHONE` com o telefone autorizado, DDI e somente dígitos, nos arquivos locais do bot e do backend. Essa restrição continua obrigatória e não é removida ao ativar Meta.

Conferência sem envio de mensagens, na pasta `bot-whatsapp`:

```bash
node --env-file=.env.local scripts/verificar-meta.mjs
```

## 3. Webhook HTTPS

O callback é `https://seu-endereco-publico/webhook/meta`, encaminhado para a porta 3002 do atendimento. A Meta precisa acessá-lo sem login no Codespace. Um túnel privado do Codespace não atende esse requisito; use um endereço HTTPS público que encaminhe a rota sem modificar os bytes do corpo. Não publique agora sem configurar os segredos.

Para testar no Codespace, a URL da porta 3002 só funciona se estiver acessível externamente e com o serviço em modo Meta. O domínio muda ao recriar o Codespace. Em produção, usar endereço estável.

No painel Meta, configure o callback e o mesmo `META_VERIFY_TOKEN`; assine o campo `messages` e confirme que o app está inscrito na conta WhatsApp escolhida. O GET devolve o desafio. Todo POST exige `X-Hub-Signature-256` válido com `META_APP_SECRET`, confere o `phone_number_id` e o telefone do cliente.

Nesta modalidade, o webhook entra diretamente no atendimento para preservar a assinatura e gravar a fila Redis antes do ACK. O workflow n8n e o WAHA existentes permanecem preservados. O endpoint WAHA `/message` é desabilitado em modo Meta para impedir dois provedores conduzindo a mesma conversa.

## 4. Ativar os dois lados juntos

Quando a conta, o número e o callback estiverem prontos:

- No bot: `WHATSAPP_PROVIDER=meta`.
- No backend: `WHATSAPP_PROVIDER=meta`, `BOT_SERVICE_URL=http://127.0.0.1:3002` e `BOT_WEBHOOK_KEY` igual à chave do atendimento.
- Conferir `BOT_TEST_PHONE` igual nos dois arquivos.

Aplicar somente o atendimento:

```bash
docker compose --env-file .env.local -f compose.local.yaml up -d --build --no-deps atendimento
```

Recompilar e reiniciar o backend com seu processo habitual. Não executar `down -v`, não reinicializar o banco e não remover volumes. A sessão WAHA continua guardada; em modo Meta, ela não recebe chamadas de envio do atendimento ou dos avisos do backend.

## 5. Validar com o cliente autorizado

O cliente envia `oi` para o número selecionado na Meta. Menu, recebimento, cidade, pagamento, revisão de endereço e confirmação usam botões; cardápio usa lista paginada. Nome, endereço, complemento, quantidade e código continuam por texto. As instruções digitáveis continuam válidas.

Escolhas antigas são ignoradas para não executar ações em outra etapa. Para obter opções atuais, enviar uma mensagem de texto adequada à etapa. O pedido só é registrado por confirmação explícita. A chave de idempotência e a restrição do destinatário continuam ativas. Não reenviar automaticamente após timeout de envio: conferir a conversa e os registros primeiro.

No painel: aprovar pagamento, iniciar preparo, marcar pronto, conferir recebimento do código; para entrega, avançar para saiu para entrega antes de concluir com o código. O código permanece oculto no painel e só é consumido na conclusão.

## Limites desta primeira integração

- Implementação para uma instância de atendimento; fila de entrada persistida no Redis e deduplicação de mensagens por 48 horas.
- Botões/listas e avisos livres usam a [janela de atendimento de 24 horas da Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages/). Fora dela, os avisos são recusados e registrados como falha. Ainda não há envio de templates aprovados nem reenvio automático: o cliente deve mandar nova mensagem ou a integração de templates precisa ser implementada.
- Aceite pela API não significa entrega ao aparelho. Nesta versão, callbacks de status são reconhecidos sem iniciar conversa, mas não atualizam os estados de entrega no painel.
- O telefone precisa estar presente no webhook para o modo de teste autorizar o cliente. Identificadores BSUID sem telefone verificável são ignorados.
- Nenhum teste automatizado usa credenciais reais da Meta ou envia WhatsApp.

Referências: [botões oficiais](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-reply-buttons-messages/), [webhooks e assinatura](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/).
