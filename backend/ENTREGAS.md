# Entregas e mapas

## Modo usado na apresentação

`ENTREGA_MODO=demonstracao` está ativo no `.env` local. Não exige Google Cloud
nem faz consultas a mapas. Usa exemplos fixos: Tietê 3 km (R$ 9,50), Jumirim
10 km (R$ 16,40) e Cerquilho 18 km (R$ 25,60). Essas distâncias são fictícias
e não dependem do endereço informado. O bot identifica a simulação na cotação,
no resumo e na confirmação; o painel persiste `entrega_simulada` e mostra o aviso.
Os pedidos, estoque e avisos de status continuam reais no banco de teste.
Para voltar ao cálculo real, use `ENTREGA_MODO=real`, configure a chave e reinicie.

Saída de teste: ponto de referência configurado localmente para a demonstração em Tietê. O endereço e as coordenadas específicos não são distribuídos neste repositório.

Atendimento: Tietê, Jumirim e Cerquilho. Regra da loja para o teste:
R$ 9,50 até 4 km e R$ 1,15 por km excedente, calculados pela rota de carro
somente de ida. Arredondamento monetário no final para centavos. Não representa
uma contratação ou uma cotação atual da Lalamove.

## Habilitar o cálculo real

1. Crie um projeto no Google Cloud Console e vincule a conta de faturamento.
2. Habilite **Geocoding API** e **Routes API**.
3. Crie uma chave de API para uso no backend. Restrinja-a a essas duas APIs.
   Se aplicar restrição por IP, use o IP público de saída do servidor, não localhost.
4. Configure cotas de requisições baixas nas duas APIs para o teste e alertas de
   orçamento. Alertas comuns de orçamento não interrompem o consumo.
5. No `.env` do backend, preencha `GOOGLE_MAPS_API_KEY` e reinicie a API.
   Não coloque a chave em `VITE_*`, no bot do WhatsApp ou no repositório.

Documentação: https://developers.google.com/maps/documentation/routes/get-api-key
e https://developers.google.com/maps/documentation/geocoding/overview

## Fluxo

Após escolher produtos e informar o nome, o cliente escolhe retirada ou entrega.
Retirada não tem taxa. Entrega pede cidade, rua/número/bairro e complemento.
O serviço valida o município e o estado retornados pelo mapa, exige um resultado
de endereço preciso e consulta a distância da rota. O cliente confere o endereço
encontrado, escolhe pagamento e aprova o total antes de registrar o pedido.

Sem chave, rota ou endereço confiável, o bot não confirma uma entrega: oferece
correção, retirada ou atendimento humano. Não inventa distância nem taxa.

`POST /api/bot/entrega/cotar` é protegido pela chave do bot. Retorna uma cotação
assinada com validade de 15 minutos, vinculada ao telefone. O pedido só aceita
essa cotação para entrega, recalcula os preços dos produtos e persiste a taxa,
endereço e distância. Não aceita um valor de frete arbitrário enviado pelo cliente.
O estoque só é debitado na confirmação do pedido.

## Andamento e avisos

Retirada: pendente → em preparo → pronto → entregue (retirada concluída).
Entrega: pendente → em preparo → pronto → saiu para entrega → entregue.
Cancelamento continua disponível antes da conclusão e restaura o estoque.

Em preparo, pronto, saiu para entrega, conclusão e cancelamento geram avisos
com texto correspondente ao tipo de recebimento. Cada combinação pedido/etapa
tem um registro único em `avisos_pedido`; falhas ficam visíveis no detalhe do
painel e não desfazem o status. Timeouts não geram reenvio automático.
O aviso inicial de confirmação já é enviado pelo bot ao registrar o pedido.

Ao marcar o pagamento como `pago`, o sistema registra e envia o aviso
`pagamento_confirmado`. A gravação do pagamento e do aviso usa a mesma
transação e trava do pedido. Cliques repetidos ou alternar pendente/pago
não repetem a confirmação já registrada. Pedidos cancelados não podem ser
marcados como pagos. O detalhe do painel mostra o resultado desse envio
separadamente dos avisos de andamento. Selecionar Pix no bot não confirma
recebimento de dinheiro: a confirmação depende da ação do gestor no painel.

As mensagens do atendimento foram encurtadas: o total completo aparece no
resumo final, adicionar produto não repete a sacola inteira e os avisos de
andamento usam uma frase. Os avisos de simulação permanecem visíveis.

As mensagens continuam restritas ao `BOT_TEST_PHONE` configurado no backend
e no serviço de atendimento. Nenhum aviso retroativo é disparado pela migração.

## Verificação

Builds do backend e painel; testes de tarifa, município, cotação assinada,
telefone incorreto, falha do serviço, confirmação e avisos por etapa.
O teste integrado usa uma cotação sintética assinada e destinatário bloqueado,
sem consultar mapa nem enviar WhatsApp real. O pedido de teste é cancelado e
o estoque restaurado. Uma rota real só pode ser validada após habilitar a chave.

Atualização de apresentação: a pedido do autor, os textos do WhatsApp e o painel não mostram o aviso de simulação nem as distâncias fictícias. Exibem endereço informado, taxa e total. ENTREGA_MODO=demonstracao e entrega_simulada continuam indicando internamente que a taxa usa os exemplos por cidade, sem mapas.
