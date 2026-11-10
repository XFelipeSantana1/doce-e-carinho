# Atendimento de teste — Doce & Carinho

O WhatsApp da loja recebe mensagens pelo WAHA. O workflow `atendimento.n8n.json`
encaminha as mensagens autenticadas ao serviço Node `atendimento`, que conduz a
conversa e guarda sacolas, etapas e mensagens processadas no Redis. Na confirmação,
o serviço chama `POST /api/bot/pedidos`. O backend calcula os preços e faz a baixa
dos insumos na mesma transação do pedido.

## Iniciar neste computador

1. Abra o Docker Desktop e espere o motor iniciar.
2. Inicie o projeto (banco, API, painel e vitrine) pelo `iniciar-projeto.ps1`
   na pasta de trabalho TCC.
3. Na pasta `bot-whatsapp`, execute `./iniciar-bot.ps1`.

Serviços: n8n em http://localhost:5678, WAHA em http://localhost:3001/dashboard,
saúde do atendimento em http://localhost:3002/health.
Se precisar conectar novamente o telefone, execute `node conectar-whatsapp.mjs`
e abra http://localhost:3003. A sessão fica no volume Docker `waha_sessions`.

## Configuração e limites

As credenciais estão em `.env.local`, fora do versionamento. `BOT_TEST_PHONE`
define o único cliente que recebe respostas neste teste. Grupos, status e
mensagens enviadas pela própria loja são ignorados. O telefone da loja é
conectado pelo QR Code; não é configurado como cliente de teste.

O workflow já foi importado e publicado na instância local. As duas credenciais
de cabeçalho ficam armazenadas pelo n8n. O arquivo de workflow pode ser importado
em outra instância, mas as credenciais devem ser recriadas.

O cardápio mostra a capacidade de cada produto calculada pela ficha técnica:
o menor quociente inteiro entre estoque de ingrediente e consumo por unidade.
`estoque` e `disponibilidade` também consultam as quantidades atuais. A consulta
não reserva ingredientes e produtos podem compartilhar o mesmo estoque.
Produtos sem ficha são exibidos com quantidade sob consulta; zero é esgotado.

Atendimento guiado: `oi`, `1`/`cardápio`, número do produto, quantidade,
`fechar`, nome, pagamento e `confirmar`. `sacola` mostra o resumo; `cancelar`
reinicia a sacola antes da confirmação. Não cancela pedidos já registrados.
`atendente` pausa respostas; `reiniciar` retoma. Depois de confirmar, use
`novo pedido` para outra compra. Sacolas expiram após 24 horas sem atividade.

Mensagens da vitrine sem observações são conferidas pelo cardápio real.
Com observações especiais, o bot pausa para atendimento humano e não registra
o pedido automaticamente. Esta versão não interpreta áudios nem usa IA.
Os pedidos são para retirada; horário e pagamento são combinados com a loja.
Selecionar Pix não cobra nem confirma recebimento de dinheiro.

Confirmações usam uma chave única no banco (`pedidos.chave_bot`) para evitar
duplicação após timeout. Redis também guarda os IDs de mensagens por 48 horas.
Se a confirmação ficar incerta, o bot só aceita consultar a mesma confirmação.

## Aviso de pedido pronto

Ao mudar um pedido para `pronto` no painel, a API salva um aviso pendente junto
com o status e, após o commit, tenta enviar pelo WAHA uma mensagem de retirada
ao WhatsApp do cliente do pedido. Continua restrito a `BOT_TEST_PHONE` durante
o teste. As configurações `WAHA_URL`, `WAHA_API_KEY` e `BOT_TEST_PHONE` também
estão no `.env` local do backend, fora do versionamento.

O detalhe do pedido informa se o envio foi aceito, falhou, foi bloqueado pelo
modo de teste ou ficou incerto. O estado é persistido no MySQL e impede
duplicação em cliques repetidos e reinícios. Pedidos que já estavam prontos
antes da atualização não recebem mensagens retroativas. Não há reenvio
automático: em timeout, confira a conversa antes de avisar manualmente.
Falha de envio não desfaz a alteração de status nem cancela o pedido.

## Verificações do atendimento

`npm test` verifica o fluxo até a confirmação, recuperação após timeout com a
mesma chave, quantidades inválidas, pausa para atendente e preços da vitrine.
O backend foi compilado, e uma confirmação repetida foi testada contra MySQL:
um único pedido criado, depois cancelado com restauração do estoque. Esse pedido
permanece identificado como teste no histórico do painel.

Ainda é necessário o teste real: o cliente autorizado manda `oi` no WhatsApp
da loja e percorre as opções. O computador, Docker e API precisam continuar ligados.

## Atualizacao: entrega e avisos por etapa

O fluxo agora permite retirada ou entrega em Tiete, Jumirim e Cerquilho. Endereco, cotacao, taxa e total sao aprovados antes da confirmacao. A saida e a Etec de Tiete no ponto do Google Maps informado pelo autor. Consulte ../backend/ENTREGAS.md para habilitar o calculo real. Sem chave de mapas configurada, a retirada funciona e a entrega oferece atendimento humano, sem confirmar uma taxa ficticia.

Os avisos agora abrangem em preparo, pronto, saiu para entrega, conclusao e cancelamento, com textos diferentes para retirada e entrega. A etapa saiu para entrega e exclusiva de pedidos de entrega. O registro de avisos por etapa e persistido em avisos_pedido.
