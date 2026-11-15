import type { Request, Response } from 'express';
import { buscarMidia } from '../services/uploadService.js';
export async function servirMidia(req:Request,res:Response){
 const midia=await buscarMidia(req.params.nome);
 if(!midia)return res.status(404).end();
 res.set({'Content-Type':midia.mime,'Content-Length':String(midia.conteudo.length),'Cache-Control':'public, max-age=604800, immutable','X-Content-Type-Options':'nosniff','ETag':'"'+midia.sha256+'"'});
 if(req.fresh)return res.status(304).end();
 return res.send(midia.conteudo);
}
