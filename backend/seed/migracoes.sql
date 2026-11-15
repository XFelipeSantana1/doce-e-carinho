-- Migrations: mudancas de estrutura em bases que JA existem.
SET @aviso_estado = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pedidos' AND column_name = 'aviso_pronto_estado') > 0,
  'SELECT 1', "ALTER TABLE pedidos ADD COLUMN aviso_pronto_estado ENUM('pendente','enviando','enviado','falha','incerto','bloqueado') NULL"
));
PREPARE stmt_aviso FROM @aviso_estado; EXECUTE stmt_aviso; DEALLOCATE PREPARE stmt_aviso;
SET @aviso_data = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pedidos' AND column_name = 'aviso_pronto_enviado_em') > 0,
  'SELECT 1', 'ALTER TABLE pedidos ADD COLUMN aviso_pronto_enviado_em DATETIME NULL'
));
PREPARE stmt_aviso FROM @aviso_data; EXECUTE stmt_aviso; DEALLOCATE PREPARE stmt_aviso;
-- Confirmações repetidas pelo bot não podem gerar duas baixas de estoque.
SET @sql_bot = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE()
    AND table_name = 'pedidos' AND column_name = 'chave_bot') > 0,
  'SELECT 1', 'ALTER TABLE pedidos ADD COLUMN chave_bot VARCHAR(80) NULL UNIQUE'
));
PREPARE stmt_bot FROM @sql_bot; EXECUTE stmt_bot; DEALLOCATE PREPARE stmt_bot;
--
-- O schema.sql monta a base do zero e nao e reaplicavel (CREATE TABLE sem IF
-- NOT EXISTS morre na segunda vez). Aqui cada migration e um passo isolado e
-- idempotente, para rodar quantas vezes for preciso.
--
-- O MySQL nao tem "CREATE INDEX IF NOT EXISTS", entao os indices usam o
-- information_schema: se o nome ja existir, nao faz nada.

-- ----------------------------------------------------------------
-- 001 - Trilha de auditoria (registros)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS registros (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id      INT                 NULL,
    usuario_nome    VARCHAR(120)        NOT NULL,
    acao            ENUM('criar','atualizar','excluir','mover','entrar','sair')
                                             NOT NULL,
    tabela          VARCHAR(40)         NOT NULL,
    registro_id     INT                 NULL,
    descricao       VARCHAR(255)        NOT NULL,
    antes           JSON                NULL,
    depois          JSON                NULL,
    criado_em       DATETIME(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_registros_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
                                             ON DELETE SET NULL
) ENGINE=InnoDB;

-- Indice so no criado_em: a tela de log sempre pergunta "os mais recentes",
-- e sem indice o LIMIT vira varredura da tabela inteira (cresce sem parar).
SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'registros'
      AND index_name = 'idx_registros_criado_em') > 0,
  'SELECT 1',
  'CREATE INDEX idx_registros_criado_em ON registros (criado_em)'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'registros'
      AND index_name = 'idx_registros_tabela') > 0,
  'SELECT 1',
  'CREATE INDEX idx_registros_tabela ON registros (tabela, registro_id)'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Foto do perfil do gestor. A coluna entra aqui (e nao so no schema.sql)
-- porque quem ja tem a base criada precisa do mesmo resultado que quem roda o
-- schema do zero: os dois caminhos tem que deixar a tabela igual.
SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'usuarios'
      AND column_name = 'imagem_url') > 0,
  'SELECT 1',
  'ALTER TABLE usuarios ADD COLUMN imagem_url VARCHAR(255) NULL AFTER senha_hash'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Recebimento e cotacao de entrega do pedido
SET @entrega_sql = (SELECT IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='pedidos' AND column_name='tipo_recebimento')>0, 'SELECT 1', 'ALTER TABLE pedidos ADD COLUMN tipo_recebimento ENUM(''retirada'',''entrega'') NOT NULL DEFAULT ''retirada'''));
PREPARE stmt_entrega FROM @entrega_sql; EXECUTE stmt_entrega; DEALLOCATE PREPARE stmt_entrega;
SET @entrega_sql = (SELECT IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='pedidos' AND column_name='entrega_endereco')>0, 'SELECT 1', 'ALTER TABLE pedidos ADD COLUMN entrega_endereco VARCHAR(255) NULL'));
PREPARE stmt_entrega FROM @entrega_sql; EXECUTE stmt_entrega; DEALLOCATE PREPARE stmt_entrega;
SET @entrega_sql = (SELECT IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='pedidos' AND column_name='taxa_entrega')>0, 'SELECT 1', 'ALTER TABLE pedidos ADD COLUMN taxa_entrega DECIMAL(10,2) NOT NULL DEFAULT 0'));
PREPARE stmt_entrega FROM @entrega_sql; EXECUTE stmt_entrega; DEALLOCATE PREPARE stmt_entrega;
SET @entrega_sql = (SELECT IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='pedidos' AND column_name='entrega_complemento')>0, 'SELECT 1', 'ALTER TABLE pedidos ADD COLUMN entrega_complemento VARCHAR(150) NULL'));
PREPARE stmt_entrega FROM @entrega_sql; EXECUTE stmt_entrega; DEALLOCATE PREPARE stmt_entrega;
SET @entrega_sql = (SELECT IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='pedidos' AND column_name='entrega_distancia_metros')>0, 'SELECT 1', 'ALTER TABLE pedidos ADD COLUMN entrega_distancia_metros INT NULL'));
PREPARE stmt_entrega FROM @entrega_sql; EXECUTE stmt_entrega; DEALLOCATE PREPARE stmt_entrega;
SET @entrega_sql = (SELECT IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='pedidos' AND column_name='entrega_cidade')>0, 'SELECT 1', 'ALTER TABLE pedidos ADD COLUMN entrega_cidade VARCHAR(80) NULL'));
PREPARE stmt_entrega FROM @entrega_sql; EXECUTE stmt_entrega; DEALLOCATE PREPARE stmt_entrega;

ALTER TABLE pedidos MODIFY COLUMN status ENUM('pendente','em_preparo','pronto','saiu_para_entrega','entregue','cancelado') NOT NULL DEFAULT 'pendente';

CREATE TABLE IF NOT EXISTS avisos_pedido (
  pedido_id INT NOT NULL,
  status VARCHAR(30) NOT NULL,
  estado ENUM('pendente','enviando','enviado','falha','incerto','bloqueado') NOT NULL DEFAULT 'pendente',
  enviado_em DATETIME NULL,
  PRIMARY KEY (pedido_id,status),
  CONSTRAINT fk_avisos_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE
) ENGINE=InnoDB;
INSERT IGNORE INTO avisos_pedido (pedido_id,status,estado,enviado_em) SELECT id,'pronto',aviso_pronto_estado,aviso_pronto_enviado_em FROM pedidos WHERE aviso_pronto_estado IS NOT NULL;

SET @sim_sql=(SELECT IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='pedidos' AND column_name='entrega_simulada')>0,'SELECT 1','ALTER TABLE pedidos ADD COLUMN entrega_simulada BOOLEAN NOT NULL DEFAULT FALSE'));
PREPARE stmt_sim FROM @sim_sql; EXECUTE stmt_sim; DEALLOCATE PREPARE stmt_sim;

-- Código de confirmação da entrega/retirada: gerado quando o pedido entra em
-- "pronto"; a baixa (entregue) só acontece com o código digitado no painel.
SET @codigo_sql=(SELECT IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='pedidos' AND column_name='codigo_entrega')>0,'SELECT 1','ALTER TABLE pedidos ADD COLUMN codigo_entrega CHAR(4) NULL'));
PREPARE stmt_codigo FROM @codigo_sql; EXECUTE stmt_codigo; DEALLOCATE PREPARE stmt_codigo;
-- Controle de pedidos: solicitações e tentativas de código.
SET @pedido_sql=(SELECT IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='pedidos' AND column_name='cancelamento_solicitado_em')>0,'SELECT 1','ALTER TABLE pedidos ADD COLUMN cancelamento_solicitado_em DATETIME NULL'));
PREPARE stmt_pedido FROM @pedido_sql; EXECUTE stmt_pedido; DEALLOCATE PREPARE stmt_pedido;
SET @pedido_sql=(SELECT IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='pedidos' AND column_name='codigo_tentativas')>0,'SELECT 1','ALTER TABLE pedidos ADD COLUMN codigo_tentativas INT NOT NULL DEFAULT 0'));
PREPARE stmt_pedido FROM @pedido_sql; EXECUTE stmt_pedido; DEALLOCATE PREPARE stmt_pedido;
SET @pedido_sql=(SELECT IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='pedidos' AND column_name='codigo_bloqueado_ate')>0,'SELECT 1','ALTER TABLE pedidos ADD COLUMN codigo_bloqueado_ate DATETIME NULL'));
PREPARE stmt_pedido FROM @pedido_sql; EXECUTE stmt_pedido; DEALLOCATE PREPARE stmt_pedido;

-- Fotos persistidas junto do banco e incluídas no backup.
CREATE TABLE IF NOT EXISTS midias (
 nome VARCHAR(160) PRIMARY KEY,
 mime VARCHAR(30) NOT NULL,
 conteudo MEDIUMBLOB NOT NULL,
 sha256 CHAR(64) NOT NULL,
 criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
