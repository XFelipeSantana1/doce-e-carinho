import { Router } from "express";
import { listar, buscarPorId, atualizarStatus, atualizarPagamento, confirmarEntrega, manterPedido } from "../controllers/pedidoController.js";
import { autenticar } from "../middleware/auth.js";

const router = Router();
router.use(autenticar); // pedidos só são consultados/gerenciados logado

router.get("/", listar);
router.get("/:id", buscarPorId);
router.patch("/:id/status", atualizarStatus);
router.patch("/:id/manter", manterPedido);
router.patch("/:id/entregar", confirmarEntrega); // conclusão por código de confirmação
router.patch("/:id/pagamento", atualizarPagamento);

export default router;
