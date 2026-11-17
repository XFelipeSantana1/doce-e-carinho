// Executar: node --env-file=.env.local scripts/verificar-meta.mjs
// Apenas consulta a configuração e o número; nunca envia mensagens nem registra o número.
const required=['META_API_VERSION','META_PHONE_NUMBER_ID','META_ACCESS_TOKEN','META_APP_SECRET','META_VERIFY_TOKEN','BOT_TEST_PHONE'];
const missing=required.filter(k=>!process.env[k]);
if(missing.length){console.error('Preencha no arquivo local: '+missing.join(', '));process.exit(1);}
if(!/^v\d+\.\d+$/.test(process.env.META_API_VERSION)||!/^\d+$/.test(process.env.META_PHONE_NUMBER_ID))throw new Error('Versão da API ou ID inválido');
try {
 const response=await fetch(`https://graph.facebook.com/${process.env.META_API_VERSION}/${process.env.META_PHONE_NUMBER_ID}?fields=id,display_phone_number,verified_name`,{headers:{Authorization:'Bearer '+process.env.META_ACCESS_TOKEN},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Cloud API HTTP '+response.status);
 const data=await response.json();
 console.log('Acesso à Cloud API confirmado.');
 const expected=process.env.META_EXPECTED_SHOP_PHONE?.replace(/\D/g,'');
 if(expected){
  const actual=String(data.display_phone_number||'').replace(/\D/g,'');
  if(actual!==expected)throw new Error('O número da Meta difere da loja esperada. Confira antes de ativar.');
  console.log('Número da loja conferido.');
 }else console.log('Confira display_phone_number no painel Meta antes de ativar; META_EXPECTED_SHOP_PHONE permite validar automaticamente.');
}catch(error){console.error(error.message);process.exitCode=1;}
