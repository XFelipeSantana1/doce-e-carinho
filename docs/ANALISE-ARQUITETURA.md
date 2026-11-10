# Análise técnica — Doce & Carinho

## 1. Produto e objetivo

O Doce & Carinho é um sistema de operação para uma confeitaria. Une um canal público de apresentação e captação de pedidos, uma área administrativa e uma camada de serviços que centraliza dados, regras de negócio e integrações. O projeto está no formato de MVP/apresentação: há fluxo real de persistência local, mas o WhatsApp é restrito a teste e o frete está em modo demonstrativo.

## 2. Arquitetura por camada

### Vitrine (`vitrine-cliente`)

Aplicação React + TypeScript + Vite. `App.tsx` compõe as seções e componentes; hooks isolam estado do cardápio, carrinho e avisos; `lib/api.ts` centraliza URL da API, fetch e normalização dos produtos; `mensagemWhats.ts` monta a mensagem/link para WhatsApp. A vitrine não cria diretamente o pedido no backend no fluxo tradicional: a finalização abre o WhatsApp com o resumo.

### Painel (`painel-admin`)

Aplicação React + TypeScript + Vite + React Router. As páginas representam os domínios (resumo, pedidos, insumos, produtos e registros). Hooks concentram carregamento e ações; `lib/api/` separa os recursos HTTP; a sessão usa JWT e as rotas protegidas controlam o acesso visual. A autorização real precisa continuar no backend.

### API (`backend`)

Express + TypeScript. `server.ts` configura JSON, CORS, arquivos estáticos, rotas e tratamento central de erros. Controllers recebem requisições e coordenam operações; services implementam comportamentos específicos; middleware protege endpoints de gestor e do bot; `config/db.ts` cria o pool MySQL. Os domínios cobrem autenticação, categorias, insumos, produtos, pedidos, registros e uploads.

### Atendimento (`bot-whatsapp`)

Serviço Node.js em JavaScript. `atendimento.n8n.json` define um webhook e encaminhamento HTTP; WAHA recebe/envia mensagens WhatsApp; o serviço de conversa controla o roteiro e usa Redis para estado e deduplicação. A API continua sendo a fonte de verdade para pedido, preço e estoque.

### Persistência e infraestrutura

MySQL guarda usuários, catálogo, ficha técnica, clientes, pedidos, itens, registros, movimentações e avisos. Redis guarda estado transitório do bot. Docker Compose sobe MySQL na raiz e n8n/WAHA/Redis no pacote do bot. As imagens enviadas pelo painel são gravadas em `backend/uploads`.

## 3. Domínios e regras de negócio observadas

- **Catálogo:** produto pertence a categoria, possui preço, imagem, descrição e estado ativo.
- **Ficha técnica:** associa produto a insumos e quantidade consumida por unidade.
- **Disponibilidade:** é estimada pelo menor número inteiro de unidades que o estoque dos ingredientes permite produzir; não representa reserva de estoque.
- **Pedido:** possui itens, origem, forma de recebimento, pagamento e ciclo de status.
- **Estoque:** confirmação do pedido e baixa de insumos precisam ocorrer de modo consistente; cancelamento antes da conclusão restaura estoque.
- **Auditoria:** registra ação, usuário, entidade e diferenças antes/depois.
- **Idempotência:** chave única do pedido do bot e registros únicos por aviso/etapa ajudam a impedir duplicações após timeout ou clique repetido.
- **Entrega:** no modo demonstrativo há valores fixos por município; o cálculo real depende de configurar Google Geocoding/Routes no servidor.

## 4. Pontos fortes

1. Separação clara entre vitrine, painel, API e bot.
2. Tipagem TypeScript nas aplicações e backend.
3. Regras sensíveis centralizadas na API.
4. Uso de transações e mecanismos de deduplicação em operações críticas descritas no código.
5. Trilha de auditoria com valores anteriores e posteriores.
6. CORS por lista de origens, autenticação JWT e chave específica para o bot.
7. Testes automatizados presentes no backend, painel e bot.
8. Documentação funcional relativamente detalhada, especialmente para pedidos e entregas.

## 5. Riscos e melhorias recomendadas

### Prioridade crítica antes de publicação/produção

- Não versionar `.env`, tokens, chaves, dumps ou dados de clientes. O pacote de origem continha arquivos de ambiente e um dump SQL com telefone/nome, histórico de pedidos e hash de senha; esses arquivos foram removidos desta preparação.
- Rotacionar segredos que já tenham sido compartilhados no ZIP ou usados em ambiente exposto. Remover um segredo do último commit não o apaga de um histórico remoto anterior.
- Criar usuário administrador com senha nova e remover qualquer credencial de apresentação antes de uso público.
- Manter o bot em lista de permissões enquanto não houver política de consentimento, atendimento, limites e tratamento de abuso.
- Não habilitar entrega real até configurar e restringir as chaves de mapas e validar as regras de cobrança.

### Prioridade alta

- Persistir `backend/uploads` em volume ou storage externo em produção; hoje o disco local do backend pode perder imagens em recriação/deploy.
- Adicionar rate limiting, Helmet, limites de requisição e política de logs/redação de dados pessoais.
- Revisar expiração, renovação e armazenamento do JWT; avaliar cookies HttpOnly/SameSite conforme o modelo de implantação.
- Definir política de backup/restore e migrações versionadas por release.
- Adicionar health checks e `depends_on` com condições de saúde aos serviços Docker; fixar versões de imagens em vez de `latest` para WAHA/n8n.
- Separar configurações de desenvolvimento, demonstração, homologação e produção.

### Prioridade média

- Centralizar validação de entrada (schemas) e padronizar respostas/erros da API.
- Ampliar testes de integração para concorrência no estoque, cancelamento, autorização e fluxos de pagamento.
- Adicionar CI para instalar dependências, executar testes, lint e builds em cada push/pull request.
- Documentar endpoints com OpenAPI/Swagger e incluir um diagrama ER do banco.
- Monitorar envio de avisos e definir processo explícito de reconciliação manual para estados incertos.

## 6. Limites da verificação desta análise

A inspeção foi feita sobre os arquivos do ZIP e documentação incluída. Não foi possível validar o comportamento com banco de dados real, credenciais, WhatsApp conectado ou serviços externos. A instalação de dependências foi iniciada, mas não concluiu dentro do tempo disponível; portanto, builds e testes não são declarados como aprovados. O estado funcional em produção não foi verificado.

## 7. Higienização aplicada para o repositório

- Removidos arquivos `.env` e `.env.local` do pacote preparado.
- Criados modelos `.env.example` com placeholders, sem segredos reais.
- Removido `backend/seed/backup-apresentacao.sql`, que continha dados pessoais e hash de senha.
- Atualizado `.gitignore` para impedir versionamento de ambientes, sessões, uploads novos, builds e backups.
- Preservadas as imagens iniciais de catálogo e identidade visual necessárias à apresentação.
- Reescritos os guias principais para explicar configuração e execução sem credenciais embutidas.
