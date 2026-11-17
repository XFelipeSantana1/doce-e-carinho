Centro Estadual de Educação Tecnológica Paula Souza

ETEC Dr. Nelson Alves Vianna

Médio Técnico Período Integral – Desenvolvimento de Sistemas

# Doce e Carinho como sistema integrado de gestão de estoque e vendas para confeitaria artesanal

Arthur Zaia Paes

Felipe Santana de Oliveira

Ismael Ribeiro de Morais Netto

## Resumo

A gestão de pedidos por aplicativos de mensagens pode dificultar a atualização do estoque e a organização das vendas em confeitarias artesanais. Este trabalho apresenta o desenvolvimento do Doce & Carinho, um protótipo destinado à integração do catálogo digital, do controle de insumos e do atendimento pelo WhatsApp. O objetivo é centralizar informações e apoiar a conferência de disponibilidade durante o registro de pedidos. A metodologia compreende levantamento de requisitos, modelagem relacional, implementação modular, inspeção técnica e execução de testes automatizados em ambientes controlados. A solução reúne interfaces em React e TypeScript, uma API em Node.js e Express, banco MySQL e atendimento coordenado com Redis, n8n, WAHA e interpretação de linguagem natural pelo Gemini. Como resultados de desenvolvimento, foram implementados cadastros, ficha técnica, pedidos, movimentações de estoque, auditoria e mecanismos de deduplicação. A revisão incorporou correções de conversa, revalidação do resumo e consolidação do consumo de ingredientes compartilhados. Os cenários selecionados passaram nos testes simulados e de integração com banco temporário; uma chamada real ao Gemini retornou interpretação estruturada válida para um exemplo fictício. Não houve validação comercial, envio de mensagens reais nessa etapa ou medição de desperdício e satisfação. Conclui-se que o protótipo constitui uma base técnica para integrar vendas e insumos, permanecendo necessárias aplicação local da versão revisada, avaliação com usuários e preparação para produção.

Palavras-chave: Gestão de estoque. Confeitaria artesanal. Sistema web. Inteligência artificial. WhatsApp.

## Abstract

Managing orders through messaging applications can make inventory updates and sales organization difficult in artisanal confectionery businesses. This paper presents the development of Doce & Carinho, a prototype designed to integrate a digital catalog, ingredient inventory control, and customer service through WhatsApp. Its objective is to centralize information and support availability checks during order registration. The methodology comprises requirements analysis, relational data modeling, modular implementation, technical inspection, and automated testing in controlled environments. The solution combines React and TypeScript interfaces, a Node.js and Express API, a MySQL database, and coordinated customer service using Redis, n8n, WAHA, and natural language interpretation through Gemini. Development results include registration modules, product recipes, orders, inventory movements, audit records, and deduplication mechanisms. The revision introduced conversation corrections, order summary revalidation, and consolidated consumption checks for shared ingredients. The selected scenarios passed simulated tests and integration tests using a temporary database; one real Gemini API call returned a valid structured interpretation for a fictional example. No business validation, real message delivery during this stage, or measurement of waste and user satisfaction was performed. The prototype provides a technical foundation for integrating sales and ingredients, while local activation of the revised version, user evaluation, and production preparation remain necessary.

Keywords: Inventory management. Artisanal confectionery. Web system. Artificial intelligence. WhatsApp.

## 1 Introdução

O atendimento de uma confeitaria artesanal envolve a apresentação dos produtos, a conferência de ingredientes, o registro da compra e o acompanhamento do pedido. Quando essas atividades são realizadas em conversas e anotações separadas, a informação apresentada ao cliente pode deixar de corresponder aos recursos disponíveis para produção. No problema delimitado por este projeto, essa divergência é denominada furo de estoque: a aceitação de uma venda sem disponibilidade suficiente para atendê-la.

O Doce & Carinho foi concebido para reunir essas atividades em uma plataforma composta por vitrine digital, painel administrativo, API e atendimento pelo WhatsApp. A questão que orienta o trabalho é como integrar o registro de pedidos ao controle de insumos para apoiar a organização das vendas de uma confeitaria artesanal. O objetivo geral consiste em desenvolver essa integração e disponibilizar recursos de acompanhamento ao gestor, incluindo interpretação assistida de mensagens em linguagem natural.

O escopo contempla catálogo, ficha técnica, movimentações de estoque e pedidos. A disponibilidade calculada com base em ingredientes representa capacidade estimada de produção, e não contagem física de doces prontos. Essa distinção delimita a aplicação da solução e evita apresentar a estimativa como garantia de pronta-entrega. A avaliação desta primeira versão se concentra nos recursos implementados e nos testes efetivamente executados, sem atribuir ao sistema benefícios comerciais ainda não medidos.

A proposta pode ser relacionada à organização de pequenos negócios, à inovação e ao uso responsável de insumos, temas presentes na Agenda 2030 da Organização das Nações Unidas (ONU, s.d.). Entretanto, a contribuição efetiva para produtividade ou redução de desperdícios exige avaliação posterior, com indicadores e acompanhamento de uma operação real.

## 2 Desenvolvimento

### 2.1 Justificativa e objetivos

O recorte da confeitaria artesanal decorre da necessidade de relacionar produtos comercializados às quantidades de ingredientes consumidas. A centralização permite consultar informações em um mesmo ambiente e registrar alterações relevantes. O valor esperado está na organização do processo, sem pressupor que a simples informatização elimine divergências de estoque.

Os objetivos específicos são disponibilizar um catálogo responsivo; permitir a manutenção de produtos, categorias e insumos; vincular ingredientes aos produtos por ficha técnica; integrar o atendimento ao registro de pedidos; registrar movimentações de estoque; e permitir o acompanhamento de pedidos, pagamentos e alterações. Acrescenta-se a interpretação de mensagens livres, mantendo a validação das ações pelas regras do sistema. A avaliação considera a implementação e os cenários de teste disponíveis, sem equivaler à comprovação de eficácia comercial.

### 2.2 Metodologia

O trabalho tem finalidade aplicada e caráter descritivo, orientado à construção de um protótipo de software. O percurso compreende definição do problema, levantamento de requisitos, modelagem do banco, desenvolvimento modular, inspeção técnica e execução de testes. A análise utiliza o código-fonte, configurações não sigilosas, scripts SQL, documentação e testes do projeto, na versão local revisada em 17 de novembro de 2026 (PAES; OLIVEIRA; MORAIS NETTO, 2026).

A inspeção verificou a correspondência entre os objetivos e os módulos existentes, observando catálogo, interpretação de mensagens, confirmação, persistência e baixa de insumos. Foram executados testes com mensagens e interpretações simuladas, testes HTTP com Redis em containers isolados e testes de integração do backend com MySQL em banco temporário. Os provedores de mensagens e a maioria das respostas de IA foram simulados, sem acesso aos clientes da loja.

Complementarmente, foi realizada uma chamada real ao Gemini com catálogo e mensagem fictícios para verificar a compatibilidade do contrato estruturado. Essa verificação foi separada dos testes simulados e não envolveu envio de WhatsApp. Não foram conduzidas entrevistas, pesquisas de satisfação, testes de carga ou medições em estabelecimento comercial. A avaliação com usuários e a observação de indicadores operacionais permanecem como etapas posteriores.

### 2.3 Arquitetura e tecnologias

A arquitetura separa interfaces, regras de negócio e persistência. A vitrine e o painel utilizam React 18, TypeScript e Vite. A organização em componentes facilita a composição de telas e o reaproveitamento de elementos, conforme o modelo apresentado pela documentação do React (REACT, s.d.). A vitrine disponibiliza categorias, busca e sacola; o painel reúne autenticação e operações administrativas.

A API utiliza Node.js, Express e TypeScript para receber requisições HTTP e coordenar operações no MySQL. O banco relacional mantém usuários, categorias, produtos, insumos, fichas técnicas, clientes, pedidos, itens e movimentações. A ligação entre produto e insumo informa o consumo necessário por unidade, enquanto os itens do pedido registram quantidades e valores da compra.

O atendimento utiliza um serviço Node.js conectado a Redis, n8n e WAHA. Na configuração ativa analisada, WAHA recebe e envia mensagens e n8n encaminha os eventos ao serviço de atendimento. Redis armazena sessões, fila de entrada e registros de deduplicação. A integração com Gemini usa a API REST de geração de conteúdo, por meio de requisições HTTP, com o modelo configurado gemini-3.5-flash-lite.

O código também contém uma alternativa para a API oficial da Meta, verificada com provedores simulados. Essa implementação não significa que a alternativa esteja ativa na loja ou homologada em produção. O provedor utilizado na configuração observada permanece WAHA, distinção necessária para caracterizar corretamente a integração com o WhatsApp.

### 2.4 Catálogo e controle de insumos

O gestor pode cadastrar produtos, categorias e ingredientes e vincular a ficha técnica de cada produto. A consulta de disponibilidade estima quantas unidades podem ser produzidas a partir do ingrediente limitante, calculando a parte inteira da divisão entre quantidade disponível e consumo por unidade. Por exemplo, 900 gramas de um ingrediente consumido a 100 gramas por unidade permitem estimar nove unidades, desde que os demais ingredientes sejam suficientes. O exemplo é explicativo e não representa um resultado experimental.

A estimativa individual não constitui reserva. Dois produtos podem depender do mesmo ingrediente, de modo que suas capacidades não devem ser somadas como estoques independentes. Na revisão atual, o backend passou a acumular o consumo requerido de cada insumo entre os itens do mesmo pedido. A verificação compara o saldo ao consumo acumulado antes de aprovar a operação. O cenário de ingrediente compartilhado com saldo insuficiente foi verificado em banco temporário, com rejeição da operação e preservação do saldo.

A consistência também depende de fichas técnicas atualizadas, unidades de medida compatíveis e registro de entradas, perdas e ajustes físicos. O protótipo não substitui essas rotinas. A correção e o teste do consumo agregado tratam uma falha identificada, mas não autorizam afirmar que toda divergência operacional ou situação possível de concorrência foi eliminada.

### 2.5 Pedidos e atendimento coordenado pelo WhatsApp

A vitrine consulta o catálogo e compõe uma mensagem com os itens selecionados para encaminhamento ao WhatsApp. A montagem da sacola não cria diretamente um pedido no banco. O serviço de atendimento reúne as informações necessárias e chama a API durante a confirmação explícita. Solicitações que exigem intervenção humana podem pausar a automação, preservando a sacola para retomada.

Na coordenação revisada, comandos completos e respostas inequívocas são tratados por regras locais. O Gemini auxilia na interpretação de texto livre e retorna uma proposta estruturada de intenção, produtos, quantidades, correções, recebimento e pagamento. O uso de JSON Schema organiza esse contrato de saída, recurso descrito na documentação do provedor (GOOGLE, s.d.b). O código ainda valida o conteúdo e as transições antes de executar ações; a saída do modelo não constitui autorização para SQL, chamadas arbitrárias ou alteração de status comerciais.

Não foi realizado treinamento próprio do modelo. A orientação é composta por instruções de sistema, nomes e identificadores do catálogo e contexto limitado da conversa. As informações comerciais editáveis ficam em arquivo próprio do projeto. Dados ausentes, como horários e prazos não confirmados, são apresentados como informações a verificar com a loja. Preços, estoque, totais e status são obtidos pelo sistema, e não calculados ou inventados pela IA.

A sessão mantém etapa, última pergunta, campos pendentes, sacola, produto de referência e resumo limitado das decisões. Essa estrutura permite interpretar correções como “na verdade, só um” sem apagar os itens já validados. Consultas como “tem de chocolate?” não devem alterar automaticamente a compra. Referências ambíguas exigem esclarecimento. Nome e endereço explícitos podem ser extraídos localmente na mesma mensagem, reduzindo o envio de dados pessoais ao modelo.

Antes do registro, o sistema consulta novamente preço e disponibilidade. Se houver mudança de preço, apresenta outro resumo e exige nova confirmação. A criação consulta fichas técnicas, valida quantidades e utiliza uma transação para reunir pedido, itens e movimentações. Leituras com SELECT FOR UPDATE protegem registros de insumos durante a operação, de acordo com o mecanismo documentado pelo MySQL (ORACLE, s.d.). A aplicação continua responsável pela correção da lógica de consumo.

A chave de idempotência permite reconhecer uma confirmação já registrada. Em falha de comunicação durante a criação, a conversa mantém a mesma chave para consultar ou repetir a operação sem iniciar outra compra. Os eventos recebidos são persistidos em fila, e a decisão de resposta é registrada antes do envio. Mensagens repetidas são reconhecidas pelo cliente e pelo identificador do evento. Quando o aceite de um envio é incerto, não se repete automaticamente a resposta, pois ela pode já ter sido entregue. Esse procedimento reduz duplicações, sem garantir entrega exatamente uma vez.

O painel mantém o acompanhamento das etapas, a confirmação administrativa de pagamentos e o tratamento de cancelamentos elegíveis. O pagamento é identificado como demonstrativo do TCC: escolher Pix ou declarar que pagou não constitui cobrança automática nem comprovação de recebimento. A entrega permanece em configuração demonstrativa, sem equivaler à validação de uma rota real.

### 2.6 Segurança, rastreabilidade e tratamento de falhas

A autenticação administrativa utiliza comparação de senhas com bcryptjs e emissão de tokens JWT. As rotas do bot possuem autenticação própria, e o servidor configura origens permitidas para requisições. A auditoria registra alterações relevantes em produtos, insumos e pedidos, apoiando a investigação de inconsistências. A consulta de um pedido pelo bot vincula o identificador ao telefone autorizado, evitando acesso apenas pelo conhecimento do número da compra.

O contexto enviado ao Gemini é limitado. Nome e endereço já salvos na sessão, credenciais e códigos de retirada não integram o contexto selecionado para interpretação. A extração local reconhece padrões explícitos de dados pessoais; mensagens sensíveis identificadas seguem pelo fluxo manual. Essa seleção reduz exposição, mas não equivale à garantia de anonimização de qualquer texto livre escrito pelo cliente.

A integração prevê timeout, validação de resposta, limites locais de chamadas e pausa após erro de cota. Se a IA estiver indisponível ou retornar conteúdo inválido, a sacola é preservada e o atendimento oferece continuidade manual. Há uma consulta por interpretação, sem repetição automática dessa chamada. As cotas do provedor variam conforme projeto, modelo e volume de tokens, sendo distintas dos limites definidos no aplicativo (GOOGLE, s.d.a).

O atendimento humano utiliza o próprio WhatsApp configurado da loja. A pausa não afirma transferência já aceita por uma pessoa nem disponibilidade imediata de equipe; também não implementa fila de agentes. A arquitetura atual utiliza uma instância consumidora da fila. Sua ampliação para vários consumidores exige projeto e testes específicos. Preparação para produção ainda demanda revisão de permissões, credenciais, políticas de retenção, backups, recuperação e observabilidade.

### 2.7 Planejamento e recursos

O planejamento informado pelos autores distribui requisitos e modelagem entre março e abril de 2026, servidor e banco entre maio e agosto, interfaces e integração entre setembro e outubro, testes em novembro e entrega final em dezembro. Trata-se do planejamento do projeto, e não de comprovação do cumprimento de cada etapa nas datas previstas. A entrega desta primeira versão do artigo está prevista para 17 de novembro de 2026.

O ambiente utiliza computador, smartphone, Node.js e Docker Compose, com desenvolvimento no Codespaces e infraestrutura de apoio. A disponibilidade de ferramentas sem cobrança por licença em determinadas condições não implica custo operacional nulo. Hospedagem, conectividade, armazenamento, manutenção e integrações podem gerar despesas. A revisão não ativou faturamento do Gemini nem alterou o projeto para um serviço pago; também não verificou a franquia gratuita efetiva da conta ou sua permanência.

A orientação ao gestor deve contemplar unidades de medida, fichas técnicas, atualização de estoque, cancelamentos e confirmação demonstrativa de pagamentos. Recomenda-se utilizar uma base de demonstração antes de inserir pedidos reais. A documentação técnica apoia a configuração, mas não substitui a avaliação das tarefas do usuário. Horários, prazo de preparo, antecedência de encomendas, personalizações e política comercial de cancelamento ainda precisam ser confirmados pela loja.

### 2.8 Resultados de desenvolvimento e limitações

Como resultado desta etapa, o projeto reúne catálogo, painel, API e atendimento coordenado. Foram identificados cadastros, ficha técnica, consulta de disponibilidade, pedidos, movimentações, auditoria e notificações. A revisão acrescentou suporte estruturado a correções, aproveitamento de dados fora de ordem, preservação da sacola em dúvidas e falhas, conferência do resumo e proteção contra reprocessamento de eventos.

Os seis arquivos da suíte de testes do bot foram executados com sucesso, incluindo 17 novos cenários de coordenação. As verificações cobriram pedidos em linguagem natural, correção de quantidade, consulta sem compra, negação de cancelamento, confirmação incompleta, produtos inválidos ou ambíguos, dados cadastrais conjuntos, alteração de preço e estoque, indisponibilidade da IA, falha da API e tentativas de induzir ações não permitidas. A ordenação de mensagens rápidas e o isolamento de contextos também foram avaliados com serviços simulados.

Os testes unitários do backend, sua compilação TypeScript e os cenários de integração com MySQL em base temporária foram concluídos com sucesso. Foram verificados autenticação, vínculo do pedido ao cliente, chave idempotente, divergência de preço, consumo compartilhado, cancelamento concorrente e regras de pagamento e entrega. Testes HTTP com Redis real, em containers isolados e com provedores simulados, verificaram fila, repetição de webhook, mensagens rápidas, envio incerto, pausa humana e compatibilidade com botões Meta.

Uma consulta real ao Gemini interpretou a mensagem fictícia “Oi, queria dois cones de morango pra retirar.” com catálogo também fictício, retornando um contrato válido com produto, quantidade e retirada. O resultado demonstra a compatibilidade naquele exemplo, mas não mede acurácia geral, robustez para todos os modos de escrita ou qualidade de atendimento em produção. Nenhuma mensagem real de WhatsApp foi enviada durante essas validações.

O atendimento permanece restrito a um telefone autorizado. A revisão de código não substituiu o container ativo do bot nem realizou publicação ou envio automático ao repositório remoto. A ativação local da versão revisada e a validação do percurso completo no WhatsApp continuam pendentes. Não há estudo com gestores e clientes ou dados para quantificar perdas, faturamento, satisfação ou tempo de atendimento. Os resultados são evidências de implementação e de testes selecionados, não de eficácia comercial comprovada.

## 3 Considerações finais

O desenvolvimento do Doce & Carinho estabeleceu uma base técnica para integrar catálogo, insumos e pedidos em uma confeitaria artesanal. O objetivo de construir os componentes centrais foi atendido no nível de implementação e dos cenários verificados, com interfaces separadas e regras comerciais concentradas no backend. A interpretação assistida pelo Gemini amplia as possibilidades de entrada em linguagem natural, enquanto o código mantém o controle das operações.

A questão proposta encontra uma resposta técnica na relação entre ficha de produtos, validação do consumo, registro de pedidos e movimentações no banco. A revisão corrigiu a verificação de ingredientes compartilhados e executou testes de integração desse cenário. A coordenação da conversa também passou a preservar contexto e exigir confirmação explícita de um resumo válido. Esses resultados não permitem concluir que a solução elimina toda divergência de estoque ou produz ganhos econômicos comprovados.

Como continuidade, propõem-se aplicação local da versão revisada, validação do percurso completo no WhatsApp restrito, preenchimento das informações comerciais, avaliação de usabilidade e preparação da infraestrutura. Uma aplicação piloto poderá então comparar divergências de estoque, tempo de atendimento e perdas antes e depois da adoção. A obtenção desses dados permitirá avaliar a contribuição operacional do sistema e orientar melhorias.

## Referências

GOOGLE. Gemini API: Rate limits. [S.l.], [s.d.a]. Disponível em: https://ai.google.dev/gemini-api/docs/rate-limits. Acesso em: 17 nov. 2026.

GOOGLE. Gemini API: Structured outputs. [S.l.], [s.d.b]. Disponível em: https://ai.google.dev/gemini-api/docs/structured-output. Acesso em: 17 nov. 2026.

ONU. Objetivos de Desenvolvimento Sustentável. Nações Unidas no Brasil, [s.d.]. Disponível em: https://brasil.un.org/pt-br/sdgs. Acesso em: 17 nov. 2026.

ORACLE. MySQL 8.4 Reference Manual: Locking Reads. [S.l.], [s.d.]. Disponível em: https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html. Acesso em: 17 nov. 2026.

PAES, Arthur Zaia; OLIVEIRA, Felipe Santana de; MORAIS NETTO, Ismael Ribeiro de. Doce & Carinho. Código-fonte, documentação técnica e testes do projeto de Trabalho de Conclusão de Curso. Tietê: ETEC Dr. Nelson Alves Vianna, 2026. Versão local analisada em 17 nov. 2026. Material não publicado.

REACT. React. [S.l.], [s.d.]. Disponível em: https://react.dev/. Acesso em: 17 nov. 2026.
