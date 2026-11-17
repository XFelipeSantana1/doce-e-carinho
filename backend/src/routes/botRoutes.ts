import { Router } from "express";
import { criarViaBot, solicitarCancelamento, consultarViaBot } from "../controllers/pedidoController.js";
import { listarDisponibilidadeBot } from "../controllers/produtoController.js";
import { cotarEntregaHttp } from '../services/entregaService.js';

const router = Router();
// Sem "autenticar" (JWT) - quem chama é o serviço do bot, protegido
// por API key própria (ver middleware apiKeyBot.ts, aplicado no server.ts)
router.post("/pedidos", criarViaBot);
router.get('/pedidos/:id', consultarViaBot);
router.post("/pedidos/:id/cancelamento", solicitarCancelamento);
router.get("/produtos", listarDisponibilidadeBot);
router.post('/entrega/cotar', cotarEntregaHttp);

export default router;
