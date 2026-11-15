# Como subir e testar o Doce & Carinho no Codespace (pelo celular)

> Objetivo deste arquivo: você conseguir fazer **tudo do zero, sozinho** — subir os serviços,
> conectar o WhatsApp, testar as três telas (vitrine, painel, bot) e entender o que cada
> coisa faz. Tudo é manual e comentado: siga os passos na ordem.

---

## 1. Mapa do sistema (o que você está ligando)

| Peça | O que é | Porta | Como roda |
|---|---|---|---|
| **MySQL** | Banco de dados (produtos, pedidos, estoque, auditoria) | 3306 | Container Docker (`docker-compose.yml` da raiz) |
| **Backend (API)** | Regras de negócio: pedidos, estoque, login JWT, avisos | 3000 | `npm run dev` em `backend/` (tsx watch) |
| **Vitrine** | Cardápio público do cliente | 5173 | `npm run dev` em `vitrine-cliente/` (Vite) |
| **Painel** | Área do gestor (login, pedidos, produtos, insumos, auditoria) | **5175** | `npm run dev` em `painel-admin/` (Vite) |
| **Atendimento (bot)** | Serviço que conduz a conversa do WhatsApp (estado no Redis) | 3002 | Container Docker (`bot-whatsapp/compose.local.yaml`) |
| **n8n** | Automação: recebe o webhook do WAHA e repassa ao atendimento | 5678 | Container Docker (mesmo Compose do bot) |
| **WAHA** | Ponte com o WhatsApp (recebe/envia mensagens da conta da LOJA) | 3001 | Container Docker (mesmo Compose do bot) |
| **Redis** | Estado temporário da conversa + deduplicação de mensagens | 6379 | Container Docker (mesmo Compose do bot) |

Fluxo de uma mensagem no bot:
`celular do cliente → WhatsApp → WAHA (container) → webhook do n8n (container) → POST /message do atendimento (container) → Redis (estado) + API (pedido, estoque) → resposta → WAHA → WhatsApp`

## 2. Arquivos que JÁ existem e NÃO se recriam

- `.env` (raiz) — senhas do MySQL do Compose
- `backend/.env` — banco, JWT_SECRET, chaves do bot, WAHA, modo de entrega
- `bot-whatsapp/.env.local` — chaves do n8n/WAHA/Redis/bot + `BOT_TEST_PHONE` (o único cliente autorizado)
- `bot-whatsapp/credenciais.local.json` — as 2 credenciais de header do n8n (geradas a partir de `BOT_WEBHOOK_KEY`)
- `.credenciais-teste.txt` — login do painel de teste

Se perdeu algum, todos podem ser recriados a partir dos `.env.example` (veja README principal).
**Nunca versione os `.env`/`.env.local`.**

## 3. Para PARAR tudo (quando for sair)

```bash
pkill -f "[v]ite.js"                          # vitrine e painel
pkill -f "[t]sx/dist/cli.mjs"                 # backend
cd bot-whatsapp && docker compose -f compose.local.yaml --env-file .env.local stop && cd ..
docker compose stop                           # MySQL (na raiz do projeto)
```

Parar NÃO apaga nada: banco, sessão do WhatsApp, Redis e n8n ficam nos volumes Docker.
Quando voltar, refaça os passos 1, 3, 4 e 5 (o passo 2 só é preciso se apagar o banco).

## 4. Modo manual (para ENTENDER cada passo)

### Passo 1 — MySQL

```bash
docker compose up -d                 # sobe o container minha-api-mysql
docker ps                            # confere se está rodando
```

O Compose lê as senhas do `.env` da raiz (`${VAR:?...}` faz ele PARAR se faltar variável).
Os dados ficam no volume `mysql_data`: parar o container NÃO apaga o banco.

### Passo 2 — Banco (só na primeira vez, ou se apagar)

```bash
RP=$(grep MYSQL_ROOT_PASSWORD .env | cut -d= -f2)
# Os SQLs do projeto falam de "confeitaria_db", mas o banco criado pelo Compose
# (e o que o usuário doce_app tem direito) chama-se "doce_carinho". O sed troca só o nome:
sed 's/confeitaria_db/doce_carinho/g' backend/seed/schema.sql | docker exec -i minha-api-mysql mysql --default-character-set=utf8mb4 -h127.0.0.1 -uroot -p"$RP"
sed 's/confeitaria_db/doce_carinho/g' backend/seed/seed.sql  | docker exec -i minha-api-mysql mysql --default-character-set=utf8mb4 -h127.0.0.1 -uroot -p"$RP" doce_carinho
docker exec -i minha-api-mysql mysql --default-character-set=utf8mb4 -h127.0.0.1 -uroot -p"$RP" doce_carinho < backend/seed/migracoes.sql
```

- `schema.sql`: cria as tabelas (idempotente — pode reaplicar)
- `seed.sql`: cardápio de demonstração (11 produtos, 14 insumos)
- `migracoes.sql`: alterações incrementais (também idempotente)
- O `--default-character-set=utf8mb4` evita acentos duplo-codificados

Conferir: `docker exec -it minha-api-mysql mysql -udoce_app -p$(grep DB_PASSWORD backend/.env | cut -d= -f2) doce_carinho -e "SELECT COUNT(*) FROM produtos"`

### Passo 3 — Backend

```bash
cd backend && npm run dev        # tsx watch: reinicia sozinho ao editar código
```

Validação rápida:

```bash
curl http://localhost:3000/api/health        # {"status":"ok"}
curl http://localhost:3000/api/produtos      # cardápio público
```

Se o `.env` tiver problema, o servidor **não sobe** e imprime qual variável falta
(`config/env.ts` — conferirEnv falha no boot de propósito).

### Passo 4 — Vitrine e painel

```bash
cd vitrine-cliente && npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
cd painel-admin     && npm run dev -- --host 0.0.0.0 --port 5175 --strictPort
```

- `--host 0.0.0.0` é OBRIGATÓRIO para o túnel do Codespace acessar de fora.
- Painel usa **5175**: a porta 5174 às vezes não é detectada pelo túnel.
- O painel não precisa de CORS: no dev ele usa o **proxy do Vite** (`/api` → localhost:3000).
- A vitrine chama a API **direto** — por isso o backend libera CORS para 5173/5174
  e para as URLs públicas do Codespace (ver `backend/src/config/origens.ts`).

### Passo 5 — Pilha do bot

```bash
cd bot-whatsapp
docker compose -f compose.local.yaml --env-file .env.local up -d --build
```

O que sobe: `atendimento` (build do Dockerfile, node 22), `n8n`, `waha`, `redis`.
Saúde: `curl http://localhost:3002/health` → `{"status":"ok","modo":"teste restrito"}`

### Passo 6 — Workflow do n8n (só na primeira vez, ou se apagar o volume)

```bash
cd bot-whatsapp
docker cp credenciais.local.json confeitaria-bot-local-n8n-1:/tmp/cred.json
docker cp atendimento.n8n.json    confeitaria-bot-local-n8n-1:/tmp/wf.json
docker exec confeitaria-bot-local-n8n-1 n8n import:credentials --input=/tmp/cred.json
docker exec confeitaria-bot-local-n8n-1 n8n import:workflow    --input=/tmp/wf.json
docker exec confeitaria-bot-local-n8n-1 n8n publish:workflow   --id=doceCarinhoBotTeste
```

Teste do caminho completo (sem WhatsApp):

```bash
WK=$(grep BOT_WEBHOOK_KEY .env.local | cut -d= -f2)
curl -s -X POST http://127.0.0.1:5678/webhook/confeitaria-whatsapp-teste \
  -H "x-bot-key: $WK" -H 'Content-Type: application/json' \
  -d '{"event":"message","session":"default","payload":{}}'
# Resposta esperada: {"ignorado":true}  (mensagem vazia é ignorada de propósito)
```

### Passo 7 — Sessão do WhatsApp no WAHA

```bash
WAHA=$(grep WAHA_API_KEY .env.local | cut -d= -f2)
curl -s http://127.0.0.1:3001/api/sessions/default -H "X-Api-Key: $WAHA"
# Status esperado: SCAN_QR_CODE (aguardando o QR ser escaneado)
# Depois de escanear: WORKING
```

### Passo 8 — Portas públicas do Codespace

```bash
gh codespace ports -c "$CODESPACE_NAME"                     # lista as portas e URLs
for p in 3000 5173 5175 3001 5678; do
  gh codespace ports visibility $p:public -c "$CODESPACE_NAME"
done
```

Cada porta vira `https://<nome-do-codespace>-<porta>.app.github.dev`.

## 5. Conectar o WhatsApp (QR)

Você precisa de **duas contas**: a LOJA (será conectada ao sistema e manda as respostas do bot)
e o CLIENTE de teste (`BOT_TEST_PHONE` no `bot-whatsapp/.env.local` e no `backend/.env`).

1. Abra o **dashboard do WAHA** (porta 3001, `/dashboard`, login `admin`) **numa tela que NÃO seja
   o celular da loja** — por exemplo, no celular do cliente.
2. No celular da LOJA: WhatsApp → Configurações → **Aparelhos conectados** → Conectar um aparelho
   → escaneie o QR da tela.
3. O status da sessão "default" vira **WORKING** (verde).
4. A sessão fica salva no volume `waha_sessions` — nos próximos dias **não precisa escanear de novo**.

## 6. Roteiro de teste da conversa (do celular do CLIENTE)

Mande para o número da LOJA (salve o contato):

1. `oi` → menu (1 — Cardápio e pedidos / 2 — Falar com a loja)
2. `1` → cardápio com disponibilidade real (ficha técnica × estoque)
3. número do produto (ex.: `10`) → quantidade
4. quantidade (ex.: `2`) → item na sacola
5. `fechar` → pede o nome
6. seu nome → pergunta retirada (1) ou entrega (2)
7. entrega: cidade → endereço (rua, nº, bairro) → complemento ou `SEM` → confere taxa e endereço
8. pagamento: `1` Pix / `2` cartão / `3` dinheiro → resumo com total
9. `CONFIRMAR` → pedido no banco, com baixa de estoque auditada

Extra (mostra robustez para a banca): mande `CONFIRMAR` duas vezes com rede ruim —
a `chave_idempotencia` impede pedido duplicado. Envie a mesma mensagem duas vezes
rapidamente — o Redis deduplica por ID da mensagem.

No **painel**, mova o pedido para `em preparo` → `pronto`: o bot manda o aviso
"pedido pronto" no WhatsApp do cliente (restrito a `BOT_TEST_PHONE`).
Registre o pagamento como `pago` → aviso de pagamento confirmado.

## 7. Roteiro de teste da vitrine e do painel

**Vitrine:** cardápio, busca, sacola persiste ao recarregar (localStorage `cg_sacola`),
finalização abre o WhatsApp com a mensagem. Na engrenagem ⚙️ dá para trocar a URL da API
e o número da loja (fica no `localStorage`, prioridade sobre o `.env`).

**Painel (login de teste: `gestor@doceecarinho.com` / `2ac97434821644fe`):**
Resumo (métricas + gráfico), Pedidos (abas por status, drawer, avanço de status, pagamento),
Produtos (CRUD + foto + ficha técnica + ativo/inativo), Insumos (CRUD + movimentação
de entrada/perda), Registros (auditoria com antes/depois).

## 8. Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| API responde `Erro interno` nos GETs | Senha do MySQL errada no `backend/.env` | Conferir com `docker exec -it minha-api-mysql mysql -udoce_app -p... -e "SELECT 1"` |
| Backend não sobe e lista variáveis | `.env` faltando ou JWT_SECRET fraca | Ver `backend/.env` (JWT_SECRET ≥ 32 caracteres) |
| Vitrine mostra erro de rede no celular | URL da API errada / porta 3000 privada | Engrenagem ⚙️ → colar `https://...-3000.app.github.dev/api` → Testar API |
| Painel abre mas login falha | Backend parado ou proxy | `curl localhost:3000/api/health`; reinicie o backend |
| Porta não abre no celular | Porta privada no Codespace | `gh codespace ports visibility <porta>:public -c "$CODESPACE_NAME"` |
| Painel 5174 não é detectado no túnel | Bug de detecção do Codespace | Usar a **5175** |
| Bot não responde | Sessão WAHA fora (SCAN_QR/FAILED) | Conferir status no dashboard; `POST /api/sessions/default/restart` |
| Bot responde mas pedido não registra | API do backend fora do alcance do container | `docker logs confeitaria-bot-local-atendimento-1` |
| Aviso "bloqueado" no painel | Telefone do pedido ≠ `BOT_TEST_PHONE` | É a trava de teste — conferir o número no `.env` do backend |

Logs úteis: `docker logs <container>` (pilha do bot) e `/tmp/backend.log` etc. (apps Node).

## 9. O que NÃO é necessário para o TCC, mas existe

- **Google Maps / frete real:** `ENTREGA_MODO=demonstracao` usa distâncias fictícias por
  cidade (Tietê/Jumirim/Cerquilho). O real só liga com `GOOGLE_MAPS_API_KEY` (ver `backend/ENTREGAS.md`).
- **Segredo do n8n:** `N8N_ENCRYPTION_KEY` cifra as credenciais no volume.
- **Produção:** rate limiting, Helmet, backups, storage de imagens, revisão de privacidade
  — tudo listado em `docs/ANALISE-ARQUITETURA.md` como pendências.
