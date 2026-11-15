import { randomUUID, createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RowDataPacket } from 'mysql2';
import pool from '../config/db.js';
import { decodificarImagem, mimeDaImagem, TAMANHO_MAXIMO } from '../lib/imagem.js';
export { TAMANHO_MAXIMO, ErroUpload } from '../lib/imagem.js';
// Caminho relativo ao módulo: funciona com tsx e com dist, de qualquer cwd.
export const PASTA_UPLOAD=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');
const EXTENSOES:Record<string,string>={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'};
export const SQL_MIDIAS=`CREATE TABLE IF NOT EXISTS midias (
 nome VARCHAR(160) PRIMARY KEY,
 mime VARCHAR(30) NOT NULL,
 conteudo MEDIUMBLOB NOT NULL,
 sha256 CHAR(64) NOT NULL,
 criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB`;
export async function prepararMidias():Promise<void>{await pool.query(SQL_MIDIAS);}
export async function guardarMidia(nome:string,mime:string,bytes:Buffer):Promise<void>{
 await pool.execute('INSERT IGNORE INTO midias (nome,mime,conteudo,sha256) VALUES (?,?,?,?)',[nome,mime,bytes,createHash('sha256').update(bytes).digest('hex')]);
}
export async function salvarImagem(dadosBase64:string,mime:string):Promise<{caminho:string}>{
 const bytes=decodificarImagem(dadosBase64,mime);
 const nome=randomUUID()+EXTENSOES[mime];
 await guardarMidia(nome,mime,bytes);
 return {caminho:'/uploads/'+nome};
}
interface Midia extends RowDataPacket {mime:string;conteudo:Buffer;sha256:string}
export async function buscarMidia(nome:string):Promise<Midia|null>{
 if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/.test(nome))return null;
 const [rows]=await pool.execute<Midia[]>('SELECT mime,conteudo,sha256 FROM midias WHERE nome=?',[nome]);
 return rows[0]??null;
}
// Migração idempotente: preserva os caminhos e os arquivos antigos; não sobrescreve fotos.
export async function migrarUploadsLocais():Promise<number>{
 let arquivos;try{arquivos=await readdir(PASTA_UPLOAD,{withFileTypes:true});}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return 0;throw e;}
 let total=0;
 for(const arquivo of arquivos){
  if(!arquivo.isFile() || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/.test(arquivo.name))continue;
  const [existentes]=await pool.query<RowDataPacket[]>('SELECT nome FROM midias WHERE nome=?',[arquivo.name]);if(existentes.length)continue;
  const bytes=await readFile(path.join(PASTA_UPLOAD,arquivo.name));const mime=mimeDaImagem(bytes);
  if(!mime || bytes.length>TAMANHO_MAXIMO){console.warn('[midias] Arquivo legado não migrado:',arquivo.name);continue;}
  await guardarMidia(arquivo.name,mime,bytes);total++;
 }
 return total;
}
