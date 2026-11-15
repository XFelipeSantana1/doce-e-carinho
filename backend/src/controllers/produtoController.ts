import pool from "../config/db.js";
import { Request, Response } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { ehDuplicado, ehReferenciaInvalida, temCodigo } from "../lib/erros.js";
import {
  auditarAtualizacao,
  auditarCriacao,
  auditarExclusao,
  prepararAtualizacao,
} from "../services/produtoAuditoria.js";
import type { RequisicaoAutenticada } from "../middleware/auth.js";

/** Um item de ficha técnica já validado. */
interface ItemFicha {
  insumo_id: number;
  quantidade_necessaria: number;
}

// Limites espelhados do schema. Sem checar aqui, um nome de 200 caracteres
// chega ao MySQL e volta como ER_DATA_TOO_LONG: 500 com "erro interno" para o
// que é problema de formulário.
const LIMITE = { nome: 120, descricao: 500, imagemUrl: 255 } as const;

/** Só o que a consulta precisa para provar que o produto existe. */
interface LinhaId extends RowDataPacket {
  id: number;
}

interface LinhaNome extends RowDataPacket {
  nome: string;
}

interface ItemFichaBruta {
  insumo_id?: unknown;
  quantidade_necessaria?: unknown;
}

// Valida a ficha técnica antes de qualquer INSERT: evita 500 de FK com
// mensagem de banco e barra quantidade zerada/negativa na receita.
function fichaValida(ficha_tecnica: unknown): ficha_tecnica is ItemFicha[] {
  if (!Array.isArray(ficha_tecnica)) return false;
  return ficha_tecnica.every((bruto: ItemFichaBruta) => {
    if (!bruto || typeof bruto !== "object") return false;
    const insumo = Number(bruto.insumo_id);
    const quantidade = Number(bruto.quantidade_necessaria);
    return (
      Number.isInteger(insumo) &&
      insumo > 0 &&
      Number.isFinite(quantidade) &&
      quantidade > 0
    );
  });
}

// O mesmo insumo duas vezes na receita viola a PK (produto_id, insumo_id).
// Sem este caso a tela recebia 500 "erro interno" — e o painel chegou a dizer
// que o backend barrava, então a pessoa achava que era erro de dedo.
function respostaDuplicado(erro: unknown, res: Response): boolean {
  if (!ehDuplicado(erro)) return false;
  res.status(400).json({
    erro: "O mesmo insumo aparece duas vezes na ficha técnica. Some uma das linhas.",
  });
  return true;
}

/** Valida nome/preço/descrição/URL. Devolve a mensagem de erro, ou null. */
function erroNosCampos(campos: {
  nome?: unknown;
  preco?: unknown;
  descricao?: unknown;
  imagem_url?: unknown;
}): string | null {
  if (campos.nome !== undefined) {
    if (typeof campos.nome !== "string" || campos.nome.trim() === "") {
      return "Nome do produto é obrigatório.";
    }
    if (campos.nome.trim().length > LIMITE.nome) {
      return `O nome pode ter no máximo ${LIMITE.nome} caracteres.`;
    }
  }
  if (campos.preco !== undefined && campos.preco !== null) {
    const preco = Number(campos.preco);
    if (!Number.isFinite(preco) || preco <= 0) {
      return "Preço deve ser maior que zero.";
    }
  }
  if (typeof campos.descricao === "string" && campos.descricao.length > LIMITE.descricao) {
    return `A descrição pode ter no máximo ${LIMITE.descricao} caracteres.`;
  }
  if (campos.descricao != null && typeof campos.descricao !== "string") return "Descrição inválida.";
  if (campos.imagem_url != null && typeof campos.imagem_url !== "string") return "Caminho da imagem inválido.";
  if (typeof campos.imagem_url === "string" && campos.imagem_url !== "" && !/^((https?:\/\/)|\/uploads\/[a-zA-Z0-9][a-zA-Z0-9._-]*$)/.test(campos.imagem_url)) return "Informe uma foto enviada ao servidor ou uma URL HTTP válida.";
  if (typeof campos.imagem_url === "string" && campos.imagem_url.length > LIMITE.imagemUrl) {
    return "O caminho da imagem é longo demais.";
  }
  return null;
}

// Traduz violação de FK em resposta de negócio (404 do dono do vínculo).
function respostaFk(err: unknown, res: Response): boolean {
  if (!ehReferenciaInvalida(err)) return false;
  const mensagem: string = (err as { sqlMessage?: string } | null)?.sqlMessage ?? "";
  if (mensagem.includes("fk_produtos_categoria")) {
    res.status(404).json({ erro: "Categoria informada não existe." });
  } else if (mensagem.includes("fk_pi_insumo")) {
    res.status(404).json({ erro: "Um dos insumos da ficha técnica não existe." });
  } else {
    res.status(400).json({ erro: "Referência inválida nos dados enviados." });
  }
  return true;
}

// GET /api/produtos -> vitrine do cliente (só produtos ativos)
export async function listarPublico(req: Request, res: Response) {
  const [rows] = await pool.query(
    `SELECT p.id, p.nome, p.descricao, p.preco, p.imagem_url, c.nome AS categoria,
       COALESCE(capacidade.quantidade_disponivel, 0) AS quantidade_disponivel
     FROM produtos p
     LEFT JOIN categorias c ON c.id = p.categoria_id
     LEFT JOIN (SELECT pi.produto_id,
       GREATEST(0, FLOOR(MIN(i.quantidade_atual / NULLIF(pi.quantidade_necessaria, 0)))) AS quantidade_disponivel
       FROM produto_insumo pi JOIN insumos i ON i.id = pi.insumo_id GROUP BY pi.produto_id
     ) capacidade ON capacidade.produto_id = p.id
     WHERE p.ativo = TRUE
     ORDER BY c.nome, p.nome`
  );
  res.json(rows);
}

// GET /api/bot/produtos -> bot (apenas produtos ativos, com capacidade atual)
// O ingrediente que acaba primeiro limita a capacidade de cada produto.
export async function listarDisponibilidadeBot(_req: Request, res: Response) {
  const [rows] = await pool.query(
    `SELECT p.id, p.nome, p.preco, c.nome AS categoria,
       capacidade.quantidade_disponivel
     FROM produtos p
     LEFT JOIN categorias c ON c.id = p.categoria_id
     LEFT JOIN (
       SELECT pi.produto_id,
         GREATEST(0, FLOOR(MIN(i.quantidade_atual / NULLIF(pi.quantidade_necessaria, 0)))) AS quantidade_disponivel
       FROM produto_insumo pi
       JOIN insumos i ON i.id = pi.insumo_id
       GROUP BY pi.produto_id
     ) capacidade ON capacidade.produto_id = p.id
     WHERE p.ativo = TRUE
     ORDER BY c.nome, p.nome`
  );
  res.set('Cache-Control', 'no-store');
  res.json(rows);
}

// GET /api/produtos/admin/todos -> painel (inclui inativos)
export async function listarTodos(req: Request, res: Response) {
  const [rows] = await pool.query(
    `SELECT p.*, c.nome AS categoria
     FROM produtos p
     LEFT JOIN categorias c ON c.id = p.categoria_id
     ORDER BY p.nome`
  );
  res.json(rows);
}

// GET /api/produtos/admin/:id -> painel (COM ficha técnica para edição).
export async function buscarPorIdAdmin(req: Request, res: Response) {
  const id = Number(req.params.id);

  const [produtoRows] = await pool.query<RowDataPacket[]>("SELECT * FROM produtos WHERE id = ?", [id]);
  if (!produtoRows[0]) return res.status(404).json({ erro: "Produto não encontrado." });

  const [insumos] = await pool.query(
    `SELECT i.id, i.nome, i.unidade_medida, pi.quantidade_necessaria
     FROM produto_insumo pi
     JOIN insumos i ON i.id = pi.insumo_id
     WHERE pi.produto_id = ?`,
    [id]
  );

  res.json({ ...produtoRows[0], ficha_tecnica: insumos });
}

// POST /api/produtos
// Body: { nome, descricao, preco, categoria_id, imagem_url,
//         ficha_tecnica: [{ insumo_id, quantidade_necessaria }] }
export async function criar(req: RequisicaoAutenticada, res: Response) {
  const { nome, descricao, preco, categoria_id, imagem_url, ficha_tecnica } = req.body;
  if (!nome || preco == null) {
    return res.status(400).json({ erro: "Nome e preço são obrigatórios." });
  }
  const erroDosCampos = erroNosCampos({ nome, preco, descricao, imagem_url });
  if (erroDosCampos) {
    return res.status(400).json({ erro: erroDosCampos });
  }
  // Ficha técnica OBRIGATÓRIA (decisão de negócio): sem receita o produto
  // não tem controle de estoque — a baixa automática não acontece e ele
  // seria vendido infinitamente mesmo sem insumo na bancada. Cadastra
  // primeiro, completa a receita depois? Não: produto sem ficha não deve
  // nem existir no catálogo.
  if (!fichaValida(ficha_tecnica) || ficha_tecnica.length === 0) {
    return res.status(400).json({
      erro: "Cadastre a ficha técnica (insumos e quantidades) junto com o produto: sem ela o sistema não consegue controlar o estoque e o produto apareceria como disponível para sempre.",
    });
  }

  const conexao = await pool.getConnection();
  try {
    await conexao.beginTransaction();

    const [result] = await conexao.query<ResultSetHeader>(
      `INSERT INTO produtos (nome, descricao, preco, categoria_id, imagem_url)
       VALUES (?, ?, ?, ?, ?)`,
      [nome, descricao || null, preco, categoria_id || null, imagem_url || null]
    );
    const produtoId = result.insertId;

    const valores = ficha_tecnica.map((item) => [produtoId, item.insumo_id, item.quantidade_necessaria]);
    await conexao.query(
      "INSERT INTO produto_insumo (produto_id, insumo_id, quantidade_necessaria) VALUES ?",
      [valores]
    );

    await conexao.commit();
    // Auditoria depois do commit: se falhasse antes, o produto existiria sem
    // registro. O inverso (log sem produto) é bem menos grave.
    await auditarCriacao(req, produtoId, nome);
    res.status(201).json({ id: produtoId, nome });
  } catch (err) {
    await conexao.rollback();
    if (respostaFk(err, res)) return;
    if (respostaDuplicado(err, res)) return;
    throw err;
  } finally {
    conexao.release();
  }
}

// PUT /api/produtos/:id - atualização parcial dos dados básicos
export async function atualizar(req: RequisicaoAutenticada, res: Response) {
  const id = Number(req.params.id);
  const { nome, descricao, preco, categoria_id, imagem_url, ativo, ficha_tecnica } = req.body;
  const erroDosCampos = erroNosCampos({ nome, preco, descricao, imagem_url });
  if (erroDosCampos) return res.status(400).json({ erro: erroDosCampos });
  if (ativo !== undefined && typeof ativo !== 'boolean' && ativo !== 0 && ativo !== 1) return res.status(400).json({ erro: "Valor de 'ativo' inválido." });
  if (categoria_id !== undefined && categoria_id !== null && (!Number.isInteger(categoria_id) || categoria_id <= 0)) return res.status(400).json({ erro: 'Categoria inválida.' });
  if (ficha_tecnica !== undefined && (!fichaValida(ficha_tecnica) || ficha_tecnica.length === 0)) return res.status(400).json({ erro: 'A ficha técnica precisa de pelo menos um insumo com quantidade positiva.' });
  const antes = await prepararAtualizacao(id);
  const conexao = await pool.getConnection();
  try {
    await conexao.beginTransaction();
    const [existentes] = await conexao.query<LinhaId[]>('SELECT id FROM produtos WHERE id = ? FOR UPDATE', [id]);
    if (!existentes.length) { await conexao.rollback(); return res.status(404).json({ erro: 'Produto não encontrado.' }); }
    // Campo omitido mantém o valor; null explícito remove foto/categoria/descrição.
    await conexao.query(`UPDATE produtos SET
      nome = COALESCE(?, nome), preco = COALESCE(?, preco),
      descricao = IF(?, ?, descricao), categoria_id = IF(?, ?, categoria_id),
      imagem_url = IF(?, ?, imagem_url), ativo = COALESCE(?, ativo) WHERE id = ?`,
      [nome ?? null, preco ?? null, descricao !== undefined, descricao || null,
        categoria_id !== undefined, categoria_id ?? null, imagem_url !== undefined, imagem_url || null, ativo ?? null, id]);
    if (ficha_tecnica !== undefined) {
      await conexao.query('DELETE FROM produto_insumo WHERE produto_id = ?', [id]);
      await conexao.query('INSERT INTO produto_insumo (produto_id, insumo_id, quantidade_necessaria) VALUES ?', [ficha_tecnica.map((item: ItemFicha) => [id, item.insumo_id, item.quantidade_necessaria])]);
    }
    await conexao.commit();
  } catch (erro) {
    await conexao.rollback();
    if (respostaFk(erro, res) || respostaDuplicado(erro, res)) return;
    throw erro;
  } finally { conexao.release(); }
  await auditarAtualizacao(req, id, antes);
  res.json({ mensagem: 'Produto atualizado com sucesso.' });
}

// PUT /api/produtos/:id/ficha-tecnica - substitui a receita inteira.
// Primeiro confirma que o produto existe (antes respondia 200 em id fantasma).
// Receita vazia é recusada: apagar TODOS os insumos de um produto já à venda
// deixaria ele sem controle de estoque (disponível para sempre). Para tirar um
// produto do ar, use o ativo/inativo — a ficha registra o que ele usa.
export async function atualizarFichaTecnica(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { ficha_tecnica } = req.body;

  if (!fichaValida(ficha_tecnica) || ficha_tecnica.length === 0) {
    return res.status(400).json({
      erro: "A ficha técnica não pode ficar vazia: cada produto precisa de pelo menos um insumo para o sistema controlar o estoque. Para tirar o produto do catálogo, use a opção 'ativo'.",
    });
  }

  const conexao = await pool.getConnection();
  try {
    await conexao.beginTransaction();

    const [produtoRows] = await conexao.query<LinhaId[]>("SELECT id FROM produtos WHERE id = ?", [id]);
    if (!produtoRows[0]) {
      await conexao.rollback();
      return res.status(404).json({ erro: "Produto não encontrado." });
    }

    await conexao.query("DELETE FROM produto_insumo WHERE produto_id = ?", [id]);

    const valores = ficha_tecnica.map((item) => [id, item.insumo_id, item.quantidade_necessaria]);
    await conexao.query(
      "INSERT INTO produto_insumo (produto_id, insumo_id, quantidade_necessaria) VALUES ?",
      [valores]
    );

    await conexao.commit();
    res.json({ mensagem: "Ficha técnica atualizada." });
  } catch (err) {
    await conexao.rollback();
    if (respostaFk(err, res)) return;
    if (respostaDuplicado(err, res)) return;
    throw err;
  } finally {
    conexao.release();
  }
}

// GET /api/produtos/admin/mais-vendidos -> dashboard do painel
export async function maisVendidos(req: Request, res: Response) {
  const [rows] = await pool.query(
    `SELECT p.id, p.nome, SUM(ip.quantidade) AS total_vendido
     FROM itens_pedido ip
     JOIN produtos p ON p.id = ip.produto_id
     JOIN pedidos pe ON pe.id = ip.pedido_id
     WHERE pe.status != 'cancelado'
     GROUP BY p.id
     ORDER BY total_vendido DESC
     LIMIT 10`
  );
  res.json(rows);
}

export async function remover(req: RequisicaoAutenticada, res: Response) {
  const id = Number(req.params.id);
  try {
    // Nome lido antes: some com a linha no DELETE, e um log dizendo "excluiu o
    // produto 3" não ajuda o gestor a lembrar o que era.
    const [antes] = await pool.query<LinhaNome[]>("SELECT nome FROM produtos WHERE id = ?", [id]);
    const nome = antes[0]?.nome;

    const [result] = await pool.query<ResultSetHeader>("DELETE FROM produtos WHERE id = ?", [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ erro: "Produto não encontrado." });
    }
    if (nome) {
      await auditarExclusao(req, id, nome);
    }
    res.status(204).send();
  } catch (erro: unknown) {
    // Tem itens de pedido vinculados: 409 explicando, não 500.
    if (temCodigo(erro, "ER_ROW_IS_REFERENCED_2")) {
      return res.status(409).json({ erro: "Produto possui vendas vinculadas e não pode ser removido." });
    }
    throw erro;
  }
}
