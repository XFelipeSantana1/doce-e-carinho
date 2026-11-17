/** Complementa a demonstração com dois doces clássicos e fotos reais. */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../src/config/db.js";
import { guardarMidia, prepararMidias } from "../src/services/uploadService.js";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
interface LinhaId extends RowDataPacket { id: number }

async function idDaCategoria(nome: string): Promise<number> {
  await pool.execute("INSERT IGNORE INTO categorias (nome) VALUES (?)", [nome]);
  const [linhas] = await pool.execute<LinhaId[]>("SELECT id FROM categorias WHERE nome = ?", [nome]);
  return linhas[0].id;
}
async function idDoInsumo(nome: string, unidade: "g" | "ml", estoque: number, minimo: number, custo: number): Promise<number> {
  await pool.execute("INSERT IGNORE INTO insumos (nome, unidade_medida, quantidade_atual, quantidade_minima, custo_unitario) VALUES (?, ?, ?, ?, ?)", [nome, unidade, estoque, minimo, custo]);
  const [linhas] = await pool.execute<LinhaId[]>("SELECT id FROM insumos WHERE nome = ?", [nome]);
  return linhas[0].id;
}
async function importarFoto(nome: string): Promise<string> {
  const bytes = await readFile(path.join(raiz, "midias", "catalogo-tradicional", nome));
  await guardarMidia(nome, "image/jpeg", bytes);
  return `/uploads/${nome}`;
}
async function criarProduto(nome: string, descricao: string, preco: number, categoriaId: number, imagemUrl: string, ficha: Array<[number, number]>): Promise<void> {
  await pool.execute<ResultSetHeader>("INSERT IGNORE INTO produtos (nome, descricao, preco, categoria_id, imagem_url) VALUES (?, ?, ?, ?, ?)", [nome, descricao, preco, categoriaId, imagemUrl]);
  const [produtos] = await pool.execute<LinhaId[]>("SELECT id FROM produtos WHERE nome = ?", [nome]);
  await pool.query("INSERT IGNORE INTO produto_insumo (produto_id, insumo_id, quantidade_necessaria) VALUES ?", [ficha.map(([insumoId, quantidade]) => [produtos[0].id, insumoId, quantidade])]);
}
async function executar(): Promise<void> {
  await prepararMidias();
  const [docesId, sobremesasId] = await Promise.all([idDaCategoria("Doces de festa"), idDaCategoria("Bolos e sobremesas")]);
  const [leite, chocolate, coco, manteiga] = await Promise.all([
    idDoInsumo("Leite condensado", "ml", 6000, 1500, 0.012), idDoInsumo("Chocolate meio amargo", "g", 1800, 500, 0.018),
    idDoInsumo("Coco ralado", "g", 1200, 300, 0.016), idDoInsumo("Manteiga", "g", 900, 250, 0.024),
  ]);
  const [brigadeiro, beijinho] = await Promise.all([importarFoto("brigadeiro.jpg"), importarFoto("beijinho.jpg")]);
  await criarProduto("Brigadeiro tradicional", "Brigadeiro de chocolate com granulado, preparado artesanalmente.", 3.5, docesId, brigadeiro, [[leite, 25], [chocolate, 10], [manteiga, 3]]);
  await criarProduto("Beijinho de coco", "Doce de leite condensado, coco ralado e finalização delicada.", 3.5, sobremesasId, beijinho, [[leite, 25], [coco, 12], [manteiga, 3]]);
  console.log("Catálogo tradicional incluído com sucesso.");
}
void executar().catch((erro: unknown) => { console.error("Não foi possível incluir o catálogo tradicional:", erro); process.exitCode = 1; }).finally(async () => { await pool.end(); });
