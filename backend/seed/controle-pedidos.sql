-- Controle de pedidos: solicitações e tentativas de código.
SET @pedido_sql=(SELECT IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='pedidos' AND column_name='cancelamento_solicitado_em')>0,'SELECT 1','ALTER TABLE pedidos ADD COLUMN cancelamento_solicitado_em DATETIME NULL'));
PREPARE stmt_pedido FROM @pedido_sql; EXECUTE stmt_pedido; DEALLOCATE PREPARE stmt_pedido;
SET @pedido_sql=(SELECT IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='pedidos' AND column_name='codigo_tentativas')>0,'SELECT 1','ALTER TABLE pedidos ADD COLUMN codigo_tentativas INT NOT NULL DEFAULT 0'));
PREPARE stmt_pedido FROM @pedido_sql; EXECUTE stmt_pedido; DEALLOCATE PREPARE stmt_pedido;
SET @pedido_sql=(SELECT IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='pedidos' AND column_name='codigo_bloqueado_ate')>0,'SELECT 1','ALTER TABLE pedidos ADD COLUMN codigo_bloqueado_ate DATETIME NULL'));
PREPARE stmt_pedido FROM @pedido_sql; EXECUTE stmt_pedido; DEALLOCATE PREPARE stmt_pedido;
