# Atendimento coordenado: Gemini e regras locais

Implementação de 17/11/2026. Preserva o teste restrito a `BOT_TEST_PHONE`, nos dois serviços. Nenhuma migração de banco ou serviço pago é necessária. As alterações locais anteriores foram preservadas. O serviço usa REST `v1beta/models/:generateContent` com `fetch`, sem SDK Gemini.

## Problemas encontrados

- `server.mjs` já tinha uma única chamada a `responderComIA`, mas o roteamento separava comandos genéricos de texto livre sem considerar campos pendentes. Durante nome/endereço/complemento, qualquer texto era entregue ao fluxo manual; uma dúvida podia virar nome ou endereço.
- O contrato antigo só representava uma ação isolada, sem correções de itens nem combinação de recebimento/pagamento. O modelo não recebia a sacola, o último produto ou o resumo das decisões.
- O número digitado era interpretado apenas pela etapa, mesmo após mostrar outra lista. Consultar chocolate não deveria selecionar automaticamente o segundo item.
- WAHA disputava o lock diretamente e retornava 503 em mensagens rápidas. O processamento demorado também mantinha o webhook aberto. Reentregas com envio incerto eram reenviadas e podiam duplicar respostas.
- O resumo atualizava preços ao escolher pagamento, mas o bot não os consultava novamente antes da confirmação. O backend já verifica preço, cotação, estoque, propriedade do pedido e chave idempotente.
- Na transação de criação, o estoque de um ingrediente compartilhado por vários itens era verificado individualmente, sem somar o consumo reservado no próprio pedido.

## Como funciona

1. n8n encaminha o evento WAHA para `POST /message`, autenticado por `x-bot-key`. O endpoint persiste a entrada em Redis e retorna `{recebida:true}`. O caminho Meta continua usando assinatura e fila própria.
2. Um consumidor por instância processa as entradas em ordem. `fila-cliente.mjs` serializa toda a leitura, interpretação, API, gravação e envio. O lock Redis protege a sessão; a arquitetura suporta **uma instância consumidora**, não vários workers competindo pela cabeça da fila.
3. `atendimento-ia.mjs` decide uma única resposta. Comandos completos, números contextualizados, correção curta de quantidade, dados pessoais explícitos e perguntas comuns são resolvidos localmente. Texto livre pode usar uma consulta Gemini.
4. O modelo retorna uma proposta estruturada. O código valida contrato, produtos, referência textual, quantidade explícita, ambiguidades, recebimento e transições. Preços, estoque e taxas vêm da API. Não há ferramentas arbitrárias, SQL nem ação de pagar/confirmar na saída da IA.
5. `conversa.mjs` continua responsável pelos menus e operações existentes. `checkout.mjs` completa somente campos faltantes e cria a assinatura do resumo. Uma correção invalida a assinatura e exige apresentar/aprovar o novo resumo.
6. Antes de registrar, há nova consulta de catálogo. Preço alterado gera novo resumo; estoque insuficiente mantém a sacola para correção. O backend faz a validação transacional definitiva, incluindo consumo compartilhado. Após timeout da criação, a sessão fica `incerto`: só pode consultar/repetir a mesma confirmação com a mesma chave.
7. Estado e decisão de envio são gravados em uma transação Redis antes de enviar. A deduplicação usa cliente + ID da mensagem por 48h. Se o provedor aceitar e a conexão falhar, não há reenvio automático: um operador precisa conferir a conversa. Esse compromisso evita mensagens duplicadas, mas não garante entrega exatamente uma vez.

## Contexto e privacidade

As sessões Redis mantêm etapa, carrinho, campos validados, cotação, última resposta/pergunta, opções efetivamente exibidas, último produto, campos pendentes e até seis decisões semânticas. Expiram após 24h de inatividade. Os status comerciais continuam no backend, separados da etapa da conversa.

O Gemini recebe somente mensagem relevante, IDs/nomes do catálogo, quantidades da sacola, etapa, pergunta semântica e quatro decisões recentes. Não recebe telefone, credenciais, nome/endereço salvos, código de retirada, preços ou estoque. Nome e endereço explícitos na mensagem são extraídos localmente e substituídos por `[DADOS_LOCAIS]`; mensagens com outros dados sensíveis identificados seguem pelo manual. A detecção é conservadora, baseada em padrões, e não é uma garantia universal de remoção de dados pessoais em qualquer texto livre.

A consulta e o cancelamento do pedido usam sempre o telefone autenticado da sessão, fixado pelo servidor. Informar outro número de pedido não autoriza acesso a outro cliente.

O comando ATENDENTE pausa respostas, conserva a sacola e orienta a deixar a dúvida no WhatsApp conectado da loja. Não afirma que alguém já recebeu a transferência. REINICIAR durante a pausa retoma a sacola. Não há fila de agentes, aviso de disponibilidade da equipe ou detecção automática de quando uma pessoa está digitando. Fora da pausa, REINICIAR mantém seu comportamento anterior de reiniciar a sacola.

## Onde editar

| Arquivo | O que editar |
|---|---|
| `src/prompt-gemini.mjs` | Instruções e exemplos de interpretação, sem regras financeiras inventadas |
| `src/loja.mjs` | Horários, orientação sobre área/taxa, prazo, antecedência, personalizações, cancelamentos, retirada e atendimento humano |
| `.env.local` | `GEMINI_ENABLED`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_MAX_PER_MINUTE`, `GEMINI_MAX_PER_DAY` |
| `src/gemini.mjs` | JSON Schema e validação da saída; timeout de 8 segundos |
| `src/atendimento-ia.mjs` | Coordenação, extração local, correções e contexto |
| `src/checkout.mjs` | Campos obrigatórios, assinatura, revalidação e resumo |
| `../backend/src/services/entregaService.ts` | Área **efetivamente autorizada**, fórmula de taxa e validade da cotação |
| `../backend/.env` | `ENTREGA_MODO`; não mudar para real nem ativar mapas pagos apenas para testar IA |

Em `loja.mjs`, `null` significa **não informado**. Os campos de área/taxa são orientações de atendimento: não substituem a cotação e a autorização do backend. Alterações comerciais reais de cobertura ou cálculo precisam ser feitas também no backend. O preenchimento de `taxaEntrega` deve orientar a consulta, nunca prometer uma taxa diferente da API.

Ainda precisam ser definidos pela loja: dias/horários, prazo de preparo, antecedência de encomendas, personalizações e política de cancelamento. A taxa por endereço é consultada pela API; não há tabela comercial adicional confirmada. Existe WhatsApp da loja conectado, mas nenhum contato humano alternativo configurado. O código informa essas lacunas sem inventar respostas.

O pagamento é identificado como **demonstrativo do TCC**, sem cobrança automática. “Já paguei” não muda status nem confirma recebimento. O painel mantém suas regras comerciais de confirmação.

## Gemini gratuito

O modelo existente foi mantido: `gemini-3.5-flash-lite`. Nenhuma configuração de faturamento, plano ou serviço foi alterada. Os limites locais existentes (20/minuto e 1.000/dia) são tetos do aplicativo, não promessa de franquia gratuita. O limite real depende do projeto Google, do modelo e de tokens; conferir no AI Studio.

Há uma consulta por interpretação, sem repetição automática. Falha, timeout, JSON inválido ou limite local deixam a sacola intacta e oferecem o próximo passo manual. HTTP 429 ativa pausa compartilhada de 60 segundos; novas mensagens continuam pelo manual. O contador diário local usa UTC; a cota Google pode ter outra janela.

A fila de mensagens tem até três tentativas em falhas de processamento; isso não significa repetir uma chamada Gemini ou um envio incerto. Entradas que falham ficam em `confeitaria:<provedor>:entrada:falhas`, no máximo 100, com expiração de 24h desde a última inclusão. Um operador deve verificar antes de reenviar, pois uma ação pode já ter ocorrido. Logs não incluem texto, telefone, chave ou corpo do provedor.

Documentação oficial consultada:

- [Gemini 3.5 Flash-Lite e saídas estruturadas](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
- [JSON Schema e validação de saídas estruturadas](https://ai.google.dev/gemini-api/docs/structured-output)
- [Limites por projeto/modelo](https://ai.google.dev/gemini-api/docs/rate-limits)

## Testar no Codespaces

A partir da raiz:

```bash
npm test --prefix bot-whatsapp
npm test --prefix backend
npm run build --prefix backend
```

Integração MySQL (cria e remove **uma base temporária** `doce_test_*`; não usa tabelas da base da loja):

```bash
cd backend
npm run test:integration
```

HTTP, Redis, fila, deduplicação e provedores simulados em rede Docker interna, sem acesso externo e sem volumes da loja:

```bash
cd bot-whatsapp
npm run test:gemini:http
npm run test:meta:http
```

Os scripts constroem uma imagem local, criam containers/rede temporários e os removem ao terminar. Não recriam os containers de atendimento da loja. Precisam de Docker e imagens base disponíveis; a construção pode precisar baixar dependências.

Para aplicar o código ao **bot local** quando você decidir ativá-lo:

```bash
cd bot-whatsapp
# Não apaga Redis, sessão WhatsApp ou banco.
docker compose --env-file .env.local -f compose.local.yaml up -d --build atendimento
curl http://localhost:3002/health
```

A API local deve estar em execução (`cd backend` e `npm run dev`). O painel desta sessão usa porta 5173, a vitrine 5174, API 3000, bot 3002, WAHA 3001 e n8n 5678. Não publique portas, não use `down -v` e não restaure dados para esses testes.

Para teste manual posterior, somente o cliente autorizado em `BOT_TEST_PHONE` pode conversar. Use um produto do catálogo real; o pedido só é registrado com confirmação explícita. As simulações automatizadas não enviam nenhuma mensagem aos números configurados.

## Evidências de validação

- `test/coordenacao.test.mjs`: 17 cenários novos, com propostas Gemini e serviços simulados, incluindo os exemplos solicitados, correções, falta de campos, nomes/endereço juntos, falha de API, alteração de preço/estoque, consultas, humano, interpretação inválida, proteção contra instruções e dois clientes com IA lenta.
- Os testes anteriores de conversa, Gemini, Meta, remetente e regras do pedido continuam sendo executados.
- HTTP/Redis reais em containers isolados, com **WAHA, Meta, backend e Gemini simulados**: fila, webhook repetido, dois eventos rápidos, isolamento do cliente autorizado, limite compartilhado, criação única, cliques antigos e janela Meta.
- Backend HTTP e **MySQL reais em base temporária**: autenticação, consulta vinculada ao cliente, idempotência, divergência de preço, estoque compartilhado, cancelamento concorrente e regras de pagamento/entrega.
- Uma consulta **real ao Gemini**, usando somente a frase fictícia “Oi, queria dois cones de morango pra retirar.” e dois produtos fictícios, retornou JSON válido com produto 10, quantidade 2 e retirada. Nenhum WhatsApp foi enviado.
- TypeScript do backend compilado e lint dos arquivos de implementação/teste alterados.

Não foi validada conversa com cliente real, o atendimento de uma equipe humana ou o limite gratuito efetivo da conta Google. Modelos podem interpretar errado: o contrato e o código reduzem o risco, mas ambiguidades continuam exigindo esclarecimento. O bot não foi publicado, não houve push e o container ativo não foi substituído por esta tarefa. O `tsx watch` da API que já estava rodando pode recarregar alterações locais automaticamente.
