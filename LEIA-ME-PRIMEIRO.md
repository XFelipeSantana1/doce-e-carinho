# Primeiros passos — Doce & Carinho

Este arquivo resume a organização do projeto e aponta para o guia principal em `README.md`.

## Componentes

- `vitrine-cliente/`: cardápio e sacola para clientes.
- `painel-admin/`: área autenticada para gestão da confeitaria.
- `backend/`: API Express, regras de negócio e integração com MySQL.
- `bot-whatsapp/`: atendimento guiado integrado a n8n, WAHA e Redis.
- `marca/` e `midias/`: identidade visual e materiais de divulgação.

## Antes de executar

1. Instale Node.js, npm e Docker Desktop.
2. Copie os arquivos `.env.example` para os nomes `.env` ou `.env.local` indicados no README principal.
3. Gere segredos novos e configure as credenciais do MySQL.
4. Instale as dependências em cada pacote e inicie os serviços conforme `README.md`.

Não use credenciais de demonstração em produção. Não restaure dumps de banco de dados de terceiros ou com dados pessoais.
