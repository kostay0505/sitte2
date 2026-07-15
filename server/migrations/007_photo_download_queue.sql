-- ТЗ №2-fix Шаг 3: очередь автоскачивания фото при «В товары»
-- Паттерн file_cleanup_queue: ретраи, потолок попыток, вне SQL-транзакций (D1.2)
CREATE TABLE IF NOT EXISTS photo_download_queue (
    id             CHAR(36)    NOT NULL PRIMARY KEY,
    product_id     CHAR(36)    NOT NULL,
    source_item_id CHAR(36)    NULL,
    urls           JSON        NOT NULL,
    total          INT         NOT NULL DEFAULT 0,
    downloaded     INT         NOT NULL DEFAULT 0,
    state          ENUM('pending','running','done','error') NOT NULL DEFAULT 'pending',
    attempts       INT         NOT NULL DEFAULT 0,
    is_force       TINYINT(1)  NOT NULL DEFAULT 0 COMMENT 'ручная перекачка: перезаписывает фото, загруженные вручную',
    last_error     TEXT        NULL,
    enqueued_at    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_state (state),
    KEY idx_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SELECT 'photo queue done' msg;
