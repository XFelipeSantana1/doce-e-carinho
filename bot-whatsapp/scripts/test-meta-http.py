"""HTTP/Redis isolados: sem banco real, sessão WAHA ou acesso externo."""
import pathlib, subprocess, uuid, sys
root = pathlib.Path(__file__).resolve().parents[1]
gemini = '--gemini' in sys.argv
tag = ('doce-gemini-smoke-' if gemini else 'doce-meta-smoke-') + uuid.uuid4().hex[:12]
network, redis, bot = tag, tag+'-redis', tag+'-bot'
def run(*args, **kwargs):
 return subprocess.run(['docker', *args], check=True, text=True, **kwargs)
bootstrap = '''
import {createClient} from 'redis';
const store=createClient({socket:{host:'redis'},password:'smoke-password'});await store.connect();
const realFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
 if(String(url).startsWith('https://generativelanguage.googleapis.com/')){
  await store.incr('smoke:gemini');
  await new Promise(resolve=>setTimeout(resolve,120));
  const text=JSON.parse(JSON.parse(options.body).contents[0].parts[0].text).mensagem;
  const answer={acao:text.includes('dois doces')?'adicionar_itens':'desconhecido',opcao:'',assunto:'',termo:'',quantidade:0,itens:text.includes('dois doces')?[{produto_id:7,quantidade:2}]:[]};
  return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(answer)}]}}]}));
 }
 if(String(url).startsWith('http://waha:3000/api/sendText')){await store.rPush('smoke:out',options.body);if(await store.getDel('smoke:falhar-envio'))throw Error('Timeout simulado depois do aceite');return new Response(JSON.stringify({id:'waha.mock'}));}
 if(String(url).startsWith('https://graph.facebook.com/')){await store.rPush('smoke:out',options.body);return new Response(JSON.stringify({messages:[{id:'wamid.mock'}]}));}
 if(String(url).startsWith('http://backend.invalid/')){
  if(String(url).endsWith('/bot/produtos'))return new Response(JSON.stringify([{id:7,nome:'Doce teste',preco:5,quantidade_disponivel:20}]));
  if(String(url).includes('/bot/pedidos/42?'))return new Response(JSON.stringify({id:42,status:'em_preparo',status_pagamento:'pago',tipo_recebimento:'retirada'}));
  if(String(url).endsWith('/bot/pedidos')){await store.incr('smoke:pedidos');return new Response(JSON.stringify({id:42,valor_total:10}));}
  throw Error('Rota inesperada');
 }
 return realFetch(url,options);
};
await import('./src/server.mjs');
'''
try:
 run('compose','--env-file','.env.local','-f','compose.local.yaml','build','atendimento',cwd=root,stdout=subprocess.DEVNULL)
 run('network','create','--internal',network,stdout=subprocess.DEVNULL)
 run('run','-d','--name',redis,'--network',network,'--network-alias','redis','redis:7-alpine','redis-server','--requirepass','smoke-password',stdout=subprocess.DEVNULL)
 args=['run','-d','--name',bot,'--network',network]
 if gemini:args.extend(['-e','GEMINI_ENABLED=true','-e','GEMINI_API_KEY=fake-key','-e','GEMINI_MAX_PER_MINUTE=1','-e','GEMINI_MAX_PER_DAY=2','-e','WAHA_API_KEY=fake-key'])
 for k,v in {'WHATSAPP_PROVIDER':('waha' if gemini else 'meta'),'REDIS_PASSWORD':'smoke-password','BOT_API_KEY':'smoke-api','BOT_WEBHOOK_KEY':'smoke-webhook','BOT_TEST_PHONE':'5515999998888','META_PHONE_NUMBER_ID':'1234','META_API_VERSION':'v27.0','META_ACCESS_TOKEN':'fake-token','META_APP_SECRET':'fake-secret','META_VERIFY_TOKEN':'verify-test','BACKEND_URL':'http://backend.invalid/api'}.items():args.extend(['-e',k+'='+v])
 run(*args,'confeitaria-bot-local-atendimento','node','--input-type=module','-e',bootstrap,stdout=subprocess.DEVNULL)
 run('exec','-i',bot,'node','--input-type=module',input=(root/('scripts/smoke-gemini-check.mjs' if gemini else 'scripts/smoke-meta-check.mjs')).read_text())
except subprocess.CalledProcessError:
 subprocess.run(['docker','logs','--tail','15',bot],check=False)
 raise
finally:
 # Somente recursos temporários desta execução; nenhum volume.
 for name in [bot,redis]:subprocess.run(['docker','rm','-f',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=False)
 subprocess.run(['docker','network','rm',network],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=False)
