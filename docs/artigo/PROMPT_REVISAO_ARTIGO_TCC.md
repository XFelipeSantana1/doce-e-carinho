# Prompt para revisar e atualizar a primeira versão do artigo do TCC

Copie as instruções abaixo e forneça, junto delas, o artigo atual e o código/documentação do projeto. Se a ferramenta não acessar o repositório, anexe pelo menos `bot-whatsapp/COORDENACAO-IA.md`, os arquivos citados neste prompt e os resultados de testes. Não apresente este prompt como o artigo a ser entregue no Teams.

---

Atue como revisor acadêmico e técnico de um artigo de Trabalho de Conclusão de Curso do curso Médio Técnico Período Integral – Desenvolvimento de Sistemas da ETEC Dr. Nelson Alves Vianna, vinculada ao Centro Estadual de Educação Tecnológica Paula Souza.

Revise e atualize integralmente o artigo fornecido, preservando seu tema, os autores e a honestidade dos resultados. Entregue uma primeira versão completa em português brasileiro, com Abstract fiel em inglês e arquivo Word `.docx`. Não entregue apenas sugestões ou um resumo das alterações.

## Identificação a preservar

- Título: Doce e Carinho como sistema integrado de gestão de estoque e vendas para confeitaria artesanal.
- Autores: Arthur Zaia Paes; Felipe Santana de Oliveira; Ismael Ribeiro de Morais Netto.
- Instituição: Centro Estadual de Educação Tecnológica Paula Souza; ETEC Dr. Nelson Alves Vianna.
- Curso: Médio Técnico Período Integral – Desenvolvimento de Sistemas.
- Projeto: Doce & Carinho.
- Entrega da primeira versão: 17 de novembro de 2026, até 23h59, pelo Teams.
- Nome sugerido do arquivo: `Artigo_Doce_e_Carinho_Arthur_Felipe_Ismael_1a_versao.docx`.

## Exigências do professor

1. Concluir o Resumo com tema/problema, objetivo, metodologia, resultados disponíveis e considerações.
2. Inserir de três a cinco palavras-chave coerentes com o trabalho.
3. Produzir o Abstract com as mesmas informações, sem acrescentar resultados ou retirar limitações.
4. Traduzir as palavras-chave em Keywords correspondentes.
5. Revisar a organização, coerência, ortografia, formatação, citações e referências.
6. Entregar o artigo completo em `.docx`, identificado pelo grupo ou integrantes. Não enviar ao Teams automaticamente.

## Fonte de verdade e limite da revisão

Considere o código atual e a evidência dos testes como fontes primárias do funcionamento do protótipo. Não transforme funcionalidades planejadas em funcionalidades prontas. A distinção entre implementação local, teste simulado, integração real e validação comercial deve aparecer no artigo.

Consulte, quando disponíveis:

- `README.md`, `INSTRUCOES.md` e documentação de entregas do backend;
- `bot-whatsapp/COORDENACAO-IA.md`;
- `bot-whatsapp/src/server.mjs`, `atendimento-ia.mjs`, `conversa.mjs`, `checkout.mjs`, `fila-cliente.mjs`, `gemini.mjs`, `prompt-gemini.mjs`, `loja.mjs`;
- `bot-whatsapp/test/coordenacao.test.mjs`, `gemini.test.mjs`, `conversa.test.mjs` e scripts de teste HTTP;
- `backend/src/controllers/pedidoController.ts`, `backend/src/services/entregaService.ts`, rotas e testes de integração;
- manifestos de dependências e SQL, para verificar tecnologias e estrutura de dados.

Não copie arquivos `.env`, chaves de API, tokens, telefones reais, senhas, dados de pedidos ou informações de clientes para o artigo. Leia apenas configurações não sigilosas necessárias. Use produtos, números e pessoas fictícios em exemplos.

## Atualizações técnicas obrigatórias em relação ao texto antigo

1. **Inteligência artificial:** o projeto passou a integrar o Gemini para interpretar linguagem natural. O modelo configurado é `gemini-3.5-flash-lite`; a integração usa a API REST `generateContent` com `fetch`, sem SDK Gemini. Confirme isso no código disponível antes de redigir.
2. **Papel da IA:** o Gemini interpreta a intenção e devolve JSON estruturado com produtos/quantidades, correções e dados como recebimento ou pagamento. O código valida essa proposta e controla as ações. As respostas são compostas pelo sistema com dados confirmados; não descreva a IA como responsável por criar pedidos, definir preços, comprovar pagamentos ou executar SQL.
3. **Base de orientação:** não houve treinamento próprio ou fine-tuning. São usadas instruções do prompt, nomes/IDs do catálogo e contexto limitado da sessão. Informações comerciais editáveis ficam em `loja.mjs`; campos ausentes permanecem não informados. Não afirme que o modelo foi treinado com dados de clientes ou toda a base do sistema.
4. **Fluxo coordenado:** comandos inequívocos são tratados localmente; o Gemini auxilia nos textos livres. Correções preservam a sacola. Dúvidas não devem se transformar em confirmação de compra. Um produto ambíguo ou quantidade ausente exige esclarecimento. A confirmação de registro é explícita e depende de dados completos e resumo válido.
5. **Sessões e mensagens:** Redis mantém contexto e fila persistente. Mensagens são ordenadas e deduplicadas por cliente/ID. O processamento atual prevê uma instância consumidora; não apresente escalabilidade horizontal comprovada. Em envio incerto, não há reenvio cego, o que reduz duplicidade mas não garante entrega exatamente uma vez.
6. **Estoque compartilhado:** a antiga falha de verificação isolada foi corrigida. O backend acumula o consumo de cada ingrediente entre os itens antes de aprovar a disponibilidade e aplica as operações dentro da transação. Não mantenha no presente a afirmação de que essa correção ainda está pendente. Também não conclua que todos os possíveis problemas de concorrência foram eliminados.
7. **Preço e disponibilidade:** o catálogo é reconsultado antes da confirmação. Mudança de preço exige novo resumo e confirmação. O backend faz a validação transacional definitiva. A disponibilidade individual continua sendo estimativa de produção e não reserva de estoque.
8. **WhatsApp:** o provedor ativo é WAHA com n8n. Existe implementação alternativa da API oficial da Meta, testada com simulações. Não afirme que a loja foi homologada pela Meta, que a alternativa está ativa ou que houve validação real de produção.
9. **Pagamento e entrega:** o TCC utiliza pagamento demonstrativo, sem cobrança automática. “Já paguei” não comprova recebimento. A entrega está em configuração demonstrativa e não deve ser descrita como rota real ou operação logística validada.
10. **Atendimento humano:** o automático pode ser pausado e retomado preservando a sacola. O canal é o próprio WhatsApp configurado da loja; não há comprovação de fila de agentes, disponibilidade imediata ou detecção automática de uma pessoa atendendo.
11. **Limitações atuais:** não houve avaliação com gestores/clientes em operação comercial, medição de satisfação, desperdício, faturamento ou desempenho. O modo segue restrito a um telefone autorizado. Ainda não foram confirmados horários, prazo de preparo, antecedência para encomendas, personalizações ou política comercial de cancelamento.
12. **Gratuidade:** não houve ativação de cobrança ou mudança para serviço pago nesta implementação. Limites locais de chamadas não são garantia de franquia gratuita do Google. Não afirme custo zero permanente, ausência de limites ou gratuidade de hospedagem.
13. **Estado de implantação:** código implementado e testes executados não equivalem à atualização do container ativo. A revisão de 17/11/2026 não fez deploy nem push; a nova imagem precisa ser aplicada localmente para o bot ativo utilizar o novo fluxo. Não afirme que usuários reais já receberam respostas da nova versão.

## Evidências efetivamente disponíveis em 17/11/2026

- Os seis arquivos de testes do bot passaram, incluindo 17 novos cenários de coordenação com IA e serviços simulados.
- Os testes unitários do backend e a compilação TypeScript passaram.
- Testes de integração HTTP com MySQL real em banco temporário passaram: autenticação, propriedade da consulta, idempotência, alteração de preço, estoque compartilhado, cancelamento concorrente e regras de pagamento/entrega.
- Testes HTTP com Redis real em containers isolados passaram, com WAHA, Meta, backend e Gemini simulados: fila, deduplicação, eventos rápidos, limites, isolamento do telefone autorizado, botões, falha de envio após aceite e pausa humana.
- Uma única chamada real ao Gemini, usando catálogo e mensagem fictícios, retornou contrato válido para dois cones de morango com retirada. Isso verifica a compatibilidade da integração naquele exemplo; não demonstra acurácia geral.
- Nenhuma mensagem real de WhatsApp foi enviada durante essas validações.
- Não houve estudo com usuários, mensuração de benefícios comerciais ou validação integral em produção.

Não invente quantidade de participantes, percentuais de acerto, tempos médios, redução de perdas, pesquisa de campo, teste de carga ou experimento antes/depois. Se precisar de logs que não estiverem disponíveis, registre a limitação e não alegue ter repetido os testes.

## Organização e redação

Mantenha e atualize: Resumo; Palavras-chave; Abstract; Keywords; 1 Introdução; 2 Desenvolvimento, com justificativa e objetivos, metodologia, arquitetura, estoque, pedidos/WhatsApp/IA, segurança, planejamento e resultados; 3 Considerações finais; Referências.

- Escreva como artigo científico, sem linguagem publicitária, emojis, diálogo com o leitor ou menções a esta solicitação.
- Mantenha problema, objetivo, método e conclusão coerentes.
- Descreva a metodologia como construção de protótipo, inspeção técnica e execução de testes nos ambientes realmente utilizados. Não chame a existência de arquivos de teste de “testes executados” sem evidência.
- Atualize Resumo e Abstract juntos. Como orientação editorial provisória, use um parágrafo de aproximadamente 150 a 250 palavras para cada um, salvo regra específica do professor.
- Use cinco palavras-chave, por exemplo: Gestão de estoque. Confeitaria artesanal. Sistema web. Inteligência artificial. WhatsApp. Traduza-as fielmente nas Keywords.
- Preserve os dados de identificação e não invente orientador, e-mail, turma, aprovação ética, orçamento ou datas realizadas de cronograma.
- O cronograma apresentado no original é planejamento dos autores, não comprovação de execução das etapas nas datas previstas.

## Citações, referências e formatação

Apoie afirmações técnicas em fontes primárias oficiais, citadas somente quando forem realmente utilizadas. Verifique os links antes de inserir uma referência ou data de acesso.

Fontes iniciais:

- ONU: https://brasil.un.org/pt-br/sdgs
- MySQL 8.4 — Locking Reads: https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html
- React: https://react.dev/
- Gemini — Structured outputs: https://ai.google.dev/gemini-api/docs/structured-output
- Gemini 3.5 Flash-Lite: https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite
- Gemini — Rate limits: https://ai.google.dev/gemini-api/docs/rate-limits
- Código-fonte/documentação não publicados dos três autores, versão local analisada em 17/11/2026. Não invente URL pública, DOI, nome de ZIP, commit ou publicação científica para esse material.

Mantenha correspondência entre citações e referências. Não acrescente autores/anos/títulos que não conseguiu verificar. Não diga que o artigo faz revisão sistemática ou bibliográfica exaustiva quando ele se apoia principalmente em documentação técnica.

Se houver modelo institucional, siga-o. Caso não haja, utilize formatação acadêmica simples e consistente, deixando explícito no relatório de revisão que a adequação final ao modelo da ETEC depende de conferência. Não afirme conformidade integral com ABNT sem verificar as normas e as regras institucionais aplicáveis.

## Entregáveis

1. Artigo completo e atualizado, incluindo Resumo/Abstract e respectivas palavras-chave, em `.docx` com nomes dos integrantes no arquivo.
2. Cópia editável do conteúdo em texto ou Markdown.
3. Relatório separado e curto com mudanças, evidências utilizadas, campos pendentes e limitações. Esse relatório e este prompt não devem entrar no corpo acadêmico do artigo.
4. Não envie a tarefa ao Teams automaticamente nem declare que o professor aprovou o texto.

Agora revise o artigo fornecido seguindo essas condições.
