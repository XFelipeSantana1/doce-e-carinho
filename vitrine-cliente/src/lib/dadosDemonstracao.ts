import type { Produto } from "../types";

// Fallback honesto para testar a interface sem API. As fotos ficam no próprio
// projeto, evitando imagens genéricas de bancos externos ou aparência de IA.
export const PRODUTOS_DEMONSTRACAO: Produto[] = [
  { id: 1, nome: "Brigadeiro tradicional", descricao: "Brigadeiro artesanal de chocolate com granulado.", preco: 3.5, imagemUrl: "/fotos/brigadeiro.jpg", categoria: "Doces de festa", ativo: true, quantidadeDisponivel: 20 },
  { id: 2, nome: "Beijinho de coco", descricao: "Leite condensado, coco ralado e uma finalização delicada.", preco: 3.5, imagemUrl: "/fotos/beijinho.jpg", categoria: "Bolos e sobremesas", ativo: true, quantidadeDisponivel: 20 },
];

export const CATEGORIAS_DEMONSTRACAO: string[] = ["Doces de festa", "Bolos e sobremesas"];
