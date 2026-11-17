import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { calcularTaxa, cotarEntrega, validarCotacao } from '../src/services/entregaService.js';
import { mensagemStatus } from '../src/services/avisoPronto.js';
beforeEach(() => { process.env.ENTREGA_MODO = 'real'; });
test('demonstração usa exemplos identificados por cidade, sem chamar mapas',async()=>{
  process.env.ENTREGA_MODO='demonstracao';delete process.env.GOOGLE_MAPS_API_KEY;
  const exemplos=[['Tietê',3000,9.5],['Jumirim',10000,16.4],['Cerquilho',18000,25.6]] as const;
  for(const [cidade,distancia,taxa] of exemplos){
    const quote=await cotarEntrega({cidade,whatsapp:'5515000000000',endereco:'Rua de Teste, 123, Centro'},async()=>{throw new Error('Não pode consultar mapas');});
    assert.equal(quote.simulada,true);assert.equal(quote.distancia_metros,distancia);assert.equal(quote.taxa_entrega,taxa);
    assert.equal(validarCotacao(quote.token,'5515000000000').simulada,true);
    process.env.ENTREGA_MODO='real';assert.throws(()=>validarCotacao(quote.token,'5515000000000'));process.env.ENTREGA_MODO='demonstracao';
  }
});
test('taxa por rota mantém base até 4km e cobra só a distância excedente', () => {
  assert.equal(calcularTaxa(0),9.5); assert.equal(calcularTaxa(4000),9.5);
  assert.equal(calcularTaxa(6000),11.8);assert.equal(calcularTaxa(10000),16.4);
  assert.equal(calcularTaxa(4500),10.08);assert.throws(()=>calcularTaxa(-1));
});
test('cotação usa a rota, confere município e vincula o valor ao telefone', async () => {
  process.env.GOOGLE_MAPS_API_KEY='chave-de-teste';process.env.JWT_SECRET='segredo-de-teste-apenas-para-verificacao-123456';
  let chamadas=0;
  const fake: typeof fetch = async (url, options) => {
    chamadas++;
    if(String(url).includes('geocode'))return new Response(JSON.stringify({status:'OK',results:[{
      formatted_address:'Rua Exemplo, 123, Tietê, SP',geometry:{location:{lat:-23.1,lng:-47.7},location_type:'ROOFTOP'},
      address_components:[{long_name:'Tietê',short_name:'Tietê',types:['administrative_area_level_2']},{long_name:'São Paulo',short_name:'SP',types:['administrative_area_level_1']},{long_name:'Brasil',short_name:'BR',types:['country']},{long_name:'123',types:['street_number']},{long_name:'Rua Exemplo',types:['route']}],
    }]}));
    assert.equal((JSON.parse(String(options?.body))).travelMode,'DRIVE');
    return new Response(JSON.stringify({routes:[{distanceMeters:6000}]}));
  };
  const quote=await cotarEntrega({whatsapp:'5515000000000',cidade:'Tietê',endereco:'Rua Exemplo, 123, Centro'},fake);
  assert.equal(chamadas,2);assert.equal(quote.taxa_entrega,11.8);
  assert.equal(validarCotacao(quote.token,'5515000000000').distancia_metros,6000);
  assert.throws(()=>validarCotacao(quote.token,'5515111111111'));
  assert.throws(()=>validarCotacao(quote.token+'x','5515000000000'));
  await assert.rejects(()=>cotarEntrega({whatsapp:'5515000000000',cidade:'Sorocaba',endereco:'Rua Exemplo, 123'},fake));
  const wrongCity: typeof fetch = async()=>new Response(JSON.stringify({status:'OK',results:[{formatted_address:'Rua, 1',geometry:{location:{lat:0,lng:0},location_type:'ROOFTOP'},address_components:[{long_name:'Sorocaba',types:['administrative_area_level_2']}]}]}));
  await assert.rejects(()=>cotarEntrega({whatsapp:'5515000000000',cidade:'Tietê',endereco:'Rua Exemplo, 123'},wrongCity));
});
test('sem chave de mapas não existe cotação inventada nem chamada externa',async()=>{
  delete process.env.GOOGLE_MAPS_API_KEY;
  await assert.rejects(()=>cotarEntrega({whatsapp:'5515000000000',cidade:'Tietê',endereco:'Rua Exemplo, 123'},async()=>{throw new Error('Não deve consultar');}),/não está habilitado/);
});
test('avisos diferenciam retirada, saída para entrega e conclusão',()=>{
  assert.match(mensagemStatus(1,'pronto','retirada'),/pronto para retirada/);
  assert.match(mensagemStatus(1,'pronto','entrega'),/aguardando a saída/);
  assert.match(mensagemStatus(1,'saiu_para_entrega','entrega'),/saiu para entrega/);
  assert.match(mensagemStatus(1,'entregue','entrega'),/entrega.*concluída/i);
  assert.match(mensagemStatus(1,'entregue','retirada'),/retirada.*concluída/i);
  const pagamento = mensagemStatus(1,'pagamento_confirmado','entrega');
  assert.match(pagamento, /Pedido #1 — pagamento confirmado/);
  assert.match(pagamento, /Avisaremos quando o preparo começar/);
});
