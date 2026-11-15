import type { Produto } from '../types';
// Mostra apenas a foto cadastrada. Sem substituir um produto por outro parecido.
export function imagemParaProduto(produto:Produto):string|null{return produto.imagemUrl || null;}
