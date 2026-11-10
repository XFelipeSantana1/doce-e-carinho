import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const config = Object.fromEntries(readFileSync(fileURLToPath(new URL('.env.local', import.meta.url)), 'utf8')
  .split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => {
    const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)];
  }));
const headers = { 'X-Api-Key': config.WAHA_API_KEY, 'Content-Type': 'application/json' };
const base = 'http://127.0.0.1:3001';
async function ensureSession() {
  const response = await fetch(`${base}/api/sessions/default`, {headers, signal:AbortSignal.timeout(10000)});
  if (response.status === 404) {
    const created = await fetch(`${base}/api/sessions`, {method:'POST',headers,
      body:JSON.stringify({name:'default',start:true,config:{ignore:{groups:true,status:true,broadcast:true}}}),signal:AbortSignal.timeout(30000)});
    if (!created.ok) throw new Error(`Nao foi possivel criar sessao: ${created.status}`);
  } else {
    if (!response.ok) throw new Error(`Servico WhatsApp: ${response.status}`);
    const session = await response.json();
    if (session.status === 'STOPPED') {
      const started = await fetch(`${base}/api/sessions/default/start`, {method:'POST',headers,signal:AbortSignal.timeout(30000)});
      if (!started.ok) throw new Error(`Nao foi possivel iniciar sessao: ${started.status}`);
    }
  }
}
const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conectar WhatsApp da loja</title>
<style>body{font:17px system-ui;background:#fdf8f3;color:#2b1e17;margin:0;padding:32px}main{max-width:620px;margin:auto;background:white;border:1px solid #e8ddd1;border-radius:16px;padding:28px}h1{font-size:26px}img{display:block;width:300px;max-width:100%;margin:24px auto}#status{font-weight:600}small{color:#6e5c4e}</style>
<main><h1>Conectar WhatsApp da loja</h1><p>No celular com o numero <b>(15) 99648-6867</b>, abra o WhatsApp, entre em <b>Aparelhos conectados</b> e toque em <b>Conectar um aparelho</b>.</p><p id="status">Preparando QR Code…</p><button id="retry" hidden>Tentar novamente</button><img id="qr" alt="QR Code para conectar o WhatsApp da loja" hidden><small>A imagem se atualiza automaticamente. Depois da conexao, ainda precisamos ativar e testar o atendimento.</small></main>
<script>const statusEl=document.querySelector('#status'),qr=document.querySelector('#qr');let lastQr=0;
const retry=document.querySelector('#retry');retry.onclick=async()=>{retry.disabled=true;try{const response=await fetch('/restart',{method:'POST'});if(!response.ok)throw new Error();lastQr=0;await update();}catch{statusEl.textContent='Nao foi possivel reiniciar. Tente novamente.';}finally{retry.disabled=false;}};
async function update(){try{const response=await fetch('/status');const state=await response.json();if(!response.ok)throw new Error();retry.hidden=!['FAILED','STOPPED'].includes(state.status);
if(state.status==='WORKING'){qr.hidden=true;statusEl.textContent='WhatsApp conectado! Avise no chat para continuarmos a integracao.';return;}
if(['FAILED','STOPPED'].includes(state.status)){qr.hidden=true;statusEl.textContent='A conexao foi interrompida. Clique em Tentar novamente para gerar outro QR Code.';return;}
if(state.status==='SCAN_QR_CODE'){statusEl.textContent='Escaneie o QR Code com o WhatsApp da loja.';if(Date.now()-lastQr>15000){qr.src='/qr?t='+Date.now();lastQr=Date.now();qr.hidden=false;}}
else{qr.hidden=true;statusEl.textContent='Preparando a conexao… Aguarde.';}}catch{statusEl.textContent='Aguardando o servico do WhatsApp iniciar…';}}
qr.onerror=()=>{qr.hidden=true;lastQr=0};update();setInterval(update,4000);</script></html>`;

const server = http.createServer(async (req,res) => {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if (!['127.0.0.1:3003','localhost:3003'].includes(req.headers.host)) {res.writeHead(403);res.end();return;}
  const url = new URL(req.url,'http://127.0.0.1:3003');
  if(req.method === 'POST' && url.pathname === '/restart') {
    if(req.headers.origin !== `http://${req.headers.host}`){res.writeHead(403);res.end();return;}
    try {
      const response=await fetch(`${base}/api/sessions/default/restart`,{method:'POST',headers,signal:AbortSignal.timeout(30000)});
      res.writeHead(response.ok ? 200 : 503,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:response.ok}));
    } catch {res.writeHead(503);res.end();}
    return;
  }
  if(req.method !== 'GET'){res.writeHead(405);res.end();return;}
  try {
    if(url.pathname === '/') {res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
    if(url.pathname === '/status') {
      const response = await fetch(`${base}/api/sessions/default`,{headers,signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error('Sessao indisponivel');
      const session=await response.json();res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({status:session.status}));return;
    }
    if(url.pathname === '/qr') {
      const response=await fetch(`${base}/api/default/auth/qr`,{headers:{...headers,Accept:'image/png'},signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error('QR indisponivel');
      res.setHeader('Content-Type','image/png');res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    res.writeHead(404);res.end();
  }catch{res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({erro:'Servico ainda indisponivel'}));}
});
await ensureSession();
server.listen(3003,'127.0.0.1',()=>console.log('Conectar WhatsApp: http://localhost:3003'));
