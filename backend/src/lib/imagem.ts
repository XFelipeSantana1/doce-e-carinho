export const TAMANHO_MAXIMO = 5 * 1024 * 1024;
export class ErroUpload extends Error { status = 400; }
export function mimeDaImagem(bytes: Buffer): string | null {
 if(bytes.length>=12 && bytes.subarray(0,3).equals(Buffer.from([255,216,255])))return 'image/jpeg';
 if(bytes.length>=24 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(bytes.length>=16 && bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP')return 'image/webp';
 return null;
}
export function decodificarImagem(texto:string,mime:string):Buffer {
 if(!['image/jpeg','image/png','image/webp'].includes(mime))throw new ErroUpload('Formato não aceito. Use JPG, PNG ou WebP.');
 if(texto.startsWith('data:') && !texto.startsWith('data:'+mime+';base64,'))throw new ErroUpload('Formato informado não corresponde à imagem.');
 const conteudo=texto.includes(',')?texto.slice(texto.indexOf(',')+1):texto;
 if(conteudo.length>Math.ceil(TAMANHO_MAXIMO/3)*4)throw new ErroUpload('Foto muito grande. O limite é 5 MB.');
 if(!conteudo || conteudo.length%4!==0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(conteudo))throw new ErroUpload('Imagem vazia ou base64 inválido.');
 const bytes=Buffer.from(conteudo,'base64');
 if(bytes.length>TAMANHO_MAXIMO)throw new ErroUpload('Foto muito grande. O limite é 5 MB.');
 if(mimeDaImagem(bytes)!==mime)throw new ErroUpload('O conteúdo não corresponde a uma foto JPG, PNG ou WebP válida.');
 return bytes;
}
