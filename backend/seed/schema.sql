CREATE DATABASE IF NOT EXISTS confeitaria_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE confeitaria_db;

-- Carregue este arquivo (e o `seed.sql`) com o cliente MySQL já em utf8mb4:
--   mysql --default-character-set=utf8mb4 -u api_user -p<SENHA> confeitaria_db < schema.sql
-- Sem a opção, o cliente negocia latin1 e todo acento entra duplo-codificado
-- ("Pão de mel" vira "PÃ£o de mel"). As TABELAS já são utf8mb4; o que faltava
-- era o lado do cliente.

-- O schema roda inteiro contra uma base ja existente (e reaplicado a cada
-- setup), entao toda tabela precisa de IF NOT EXISTS. Sem isso o script morre
-- na segunda execucao e as tabelas novas nunca sao criadas.
CREATE TABLE IF NOT EXISTS usuarios (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    nome            VARCHAR(120)        NOT NULL,
    email           VARCHAR(150)        NOT NULL UNIQUE,
    senha_hash      VARCHAR(255)        NOT NULL,
    imagem_url      VARCHAR(255),
    cargo           ENUM('admin','gestor') NOT NULL DEFAULT 'gestor',
    ativo           BOOLEAN             NOT NULL DEFAULT TRUE,
    criado_em       DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS categorias (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    nome            VARCHAR(80)         NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS insumos (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    nome                VARCHAR(120)        NOT NULL,
    unidade_medida      ENUM('g','kg','ml','l','unidade') NOT NULL,
    quantidade_atual    DECIMAL(10,3)       NOT NULL DEFAULT 0,
    quantidade_minima   DECIMAL(10,3)       NOT NULL DEFAULT 0,
    custo_unitario      DECIMAL(10,2)       NOT NULL DEFAULT 0,
    criado_em           DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em       DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP
                                             ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS produtos (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    categoria_id    INT                 NULL,
    nome            VARCHAR(120)        NOT NULL,
    descricao       TEXT,
    preco           DECIMAL(10,2)       NOT NULL,
    imagem_url      VARCHAR(255),
    ativo           BOOLEAN             NOT NULL DEFAULT TRUE,
    criado_em       DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_produtos_categoria
        FOREIGN KEY (categoria_id) REFERENCES categorias(id)
        ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS produto_insumo (
    produto_id            INT             NOT NULL,
    insumo_id             INT             NOT NULL,
    quantidade_necessaria DECIMAL(10,3)   NOT NULL,
    PRIMARY KEY (produto_id, insumo_id),
    CONSTRAINT fk_pi_produto FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE,
    CONSTRAINT fk_pi_insumo  FOREIGN KEY (insumo_id)  REFERENCES insumos(id)  ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS clientes (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    nome            VARCHAR(120),
    whatsapp        VARCHAR(20)         NOT NULL UNIQUE,
    endereco        VARCHAR(255),
    criado_em       DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pedidos (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    cliente_id          INT                 NOT NULL,
    status              ENUM('pendente','em_preparo','pronto','saiu_para_entrega','entregue','cancelado')
                                             NOT NULL DEFAULT 'pendente',
    forma_pagamento     ENUM('pix','cartao','dinheiro','outro'),
    status_pagamento    ENUM('pendente','pago','estornado') NOT NULL DEFAULT 'pendente',
    valor_total         DECIMAL(10,2)       NOT NULL DEFAULT 0,
    origem              ENUM('whatsapp','painel') NOT NULL DEFAULT 'whatsapp',
    tipo_recebimento ENUM('retirada','entrega') NOT NULL DEFAULT 'retirada',
    entrega_cidade VARCHAR(80) NULL,
    entrega_endereco VARCHAR(255) NULL,
    entrega_complemento VARCHAR(150) NULL,
    taxa_entrega DECIMAL(10,2) NOT NULL DEFAULT 0,
    entrega_distancia_metros INT NULL,
    entrega_simulada BOOLEAN NOT NULL DEFAULT FALSE,
    chave_bot           VARCHAR(80) NULL UNIQUE,
    -- Código de 4 dígitos que o cliente apresenta na retirada (ou repassa ao
    -- motoboy). Gerado quando o pedido entra em "pronto"; quem conclui é o
    -- CÓDIGO validado (PATCH /:id/entregar), não um clique.
    codigo_entrega      CHAR(4) NULL,
    cancelamento_solicitado_em DATETIME NULL,
    codigo_tentativas INT NOT NULL DEFAULT 0,
    codigo_bloqueado_ate DATETIME NULL,
    aviso_pronto_estado ENUM('pendente','enviando','enviado','falha','incerto','bloqueado') NULL,
    aviso_pronto_enviado_em DATETIME NULL,
    criado_em           DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em       DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP
                                             ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_pedidos_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS itens_pedido (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    pedido_id       INT                 NOT NULL,
    produto_id      INT                 NOT NULL,
    quantidade      INT                 NOT NULL,
    preco_unitario  DECIMAL(10,2)       NOT NULL,
    subtotal        DECIMAL(10,2)       NOT NULL,
    CONSTRAINT fk_ip_pedido  FOREIGN KEY (pedido_id)  REFERENCES pedidos(id)  ON DELETE CASCADE,
    CONSTRAINT fk_ip_produto FOREIGN KEY (produto_id) REFERENCES produtos(id)
) ENGINE=InnoDB;

-- Trilha de auditoria: quem mexeu, em qual registro e no que.
-- Guarda o ANTIGO e o NOVO valor em JSON porque o painel edita por
-- COALESCE (campo omitido mantem o anterior). Sem o "antes" nao daria para
-- dizer o que mudou, e o gestor precisa dessa resposta numa indefisao.
-- ON DELETE SET NULL: apagar o usuario nao pode apagar o historico dele.
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

CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    insumo_id       INT                 NOT NULL,
    tipo            ENUM('entrada','saida','ajuste','perda') NOT NULL,
    quantidade      DECIMAL(10,3)       NOT NULL,
    pedido_id       INT                 NULL,
    observacao      VARCHAR(255),
    criado_em       DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_mov_insumo FOREIGN KEY (insumo_id) REFERENCES insumos(id),
    CONSTRAINT fk_mov_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
) ENGINE=InnoDB;

-- Os indices ficam no fim de migracoes.sql, nao aqui: o MySQL nao aceita
-- "CREATE INDEX IF NOT EXISTS", entao a unica forma de reaplicar este arquivo
-- sem quebrar seria escrever SQL dinamico. O schema e a base limpa; quem
-- precisa atualizar uma base que ja existe roda a migracao.

CREATE TABLE IF NOT EXISTS avisos_pedido (
  pedido_id INT NOT NULL,
  status VARCHAR(30) NOT NULL,
  estado ENUM('pendente','enviando','enviado','falha','incerto','bloqueado') NOT NULL DEFAULT 'pendente',
  enviado_em DATETIME NULL,
  PRIMARY KEY (pedido_id,status),
  CONSTRAINT fk_avisos_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Fotos persistidas junto do banco e incluídas no backup.
CREATE TABLE IF NOT EXISTS midias (
 nome VARCHAR(160) PRIMARY KEY,
 mime VARCHAR(30) NOT NULL,
 conteudo MEDIUMBLOB NOT NULL,
 sha256 CHAR(64) NOT NULL,
 criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
