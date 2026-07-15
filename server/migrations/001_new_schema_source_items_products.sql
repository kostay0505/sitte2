-- Фаза 1: новые таблицы + настоящие FK (ТЗ v1.1)
-- lower_case_table_names=0: `products` и легаси `Products` сосуществуют.

CREATE TABLE IF NOT EXISTS source_items (
    id            CHAR(36)     NOT NULL PRIMARY KEY,
    source        VARCHAR(32)  NOT NULL,
    external_id   VARCHAR(255) NOT NULL,
    url           TEXT         NULL,
    title         VARCHAR(500) NULL,
    description   MEDIUMTEXT   NULL,
    price_amount  DECIMAL(12,2) NULL,
    price_currency CHAR(3)     NULL,
    availability_state ENUM('in_stock','out_of_stock','unknown') NOT NULL DEFAULT 'unknown',
    site_status   VARCHAR(30)  NULL,
    images        JSON         NULL,
    extra         JSON         NULL,
    raw           JSON         NULL,
    parse_error   TINYINT(1)   NOT NULL DEFAULT 0,
    first_seen    DATETIME     NULL,
    last_seen     DATETIME     NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_source_external (source, external_id),
    KEY idx_parse_error (parse_error)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS products (
    id             CHAR(36)     NOT NULL PRIMARY KEY,
    custom_id      VARCHAR(50)  NULL,
    source_item_id CHAR(36)     NULL,
    source         VARCHAR(32)  NULL,
    external_id    VARCHAR(255) NULL,
    user_id        VARCHAR(255) NULL,
    visibility_status ENUM('draft','published','hidden','archived','sold') NOT NULL DEFAULT 'draft',
    origin_status  ENUM('active','blacklisted') NOT NULL DEFAULT 'active',
    title          VARCHAR(500) NULL,
    description    MEDIUMTEXT   NULL,
    price_amount   DECIMAL(12,2) NULL,
    price_currency CHAR(3)      NULL,
    category_id    CHAR(36)     NULL,
    brand_id       CHAR(36)     NULL,
    slug           VARCHAR(255) NULL,
    brand_slug     VARCHAR(100) NULL,
    preview        VARCHAR(255) NULL,
    images         JSON         NULL,
    edited_fields  JSON         NULL,
    has_pending_review TINYINT(1) NOT NULL DEFAULT 0,
    last_synced_at DATETIME     NULL,
    legacy_product_id    CHAR(36) NULL,
    legacy_parsedbase_id CHAR(36) NULL,
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_custom_id (custom_id),
    KEY idx_source_ext (source, external_id),
    KEY idx_visibility (visibility_status),
    KEY idx_user (user_id),
    KEY idx_legacy_product (legacy_product_id),
    CONSTRAINT fk_products_source_item FOREIGN KEY (source_item_id)
        REFERENCES source_items(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sync_session (
    id          CHAR(36)    NOT NULL PRIMARY KEY,
    source      VARCHAR(32) NOT NULL,
    started_at  DATETIME    NOT NULL,
    finished_at DATETIME    NULL,
    items_seen  INT         NULL,
    items_expected_baseline INT NULL,
    fill_rate   DECIMAL(5,4) NULL,
    http_error_rate DECIMAL(5,4) NULL,
    verdict     ENUM('healthy','parked','failed') NULL,
    created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS review_queue (
    id          CHAR(36)    NOT NULL PRIMARY KEY,
    product_id  CHAR(36)    NOT NULL,
    field       VARCHAR(64) NULL,
    old_value   TEXT        NULL,
    new_value   TEXT        NULL,
    reason      VARCHAR(64) NOT NULL,
    confidence  VARCHAR(16) NULL,
    session_id  CHAR(36)    NULL,
    state       ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME    NULL,
    KEY idx_product (product_id),
    KEY idx_state (state),
    KEY idx_reason (reason),
    CONSTRAINT fk_rq_product FOREIGN KEY (product_id)
        REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT fk_rq_session FOREIGN KEY (session_id)
        REFERENCES sync_session(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Связь постов с каталогом (immutable items не трогаем)
ALTER TABLE TelegramPosts
    ADD COLUMN product_id CHAR(36) NULL,
    ADD CONSTRAINT fk_tp_product FOREIGN KEY (product_id)
        REFERENCES products(id) ON DELETE SET NULL;

-- Атомарный счётчик TEM (Фаза 6); seed = максимум из ParsedBase.sku и Products.customId
CREATE TABLE IF NOT EXISTS SkuCounter (
    id      TINYINT NOT NULL PRIMARY KEY,
    nextVal INT     NOT NULL
) ENGINE=InnoDB;

INSERT INTO SkuCounter (id, nextVal)
SELECT 1, GREATEST(
    COALESCE((SELECT MAX(CAST(SUBSTRING(sku, 5) AS UNSIGNED)) FROM ParsedBase WHERE sku LIKE 'TEM-%'), 0),
    COALESCE((SELECT MAX(CAST(SUBSTRING(customId, 5) AS UNSIGNED)) FROM Products WHERE customId LIKE 'TEM-%'), 0)
)
ON DUPLICATE KEY UPDATE nextVal = nextVal;

SELECT 'phase1 done' AS msg;
SHOW TABLES LIKE 'source_items';
SELECT nextVal AS sku_counter_seed FROM SkuCounter WHERE id = 1;
