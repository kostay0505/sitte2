-- ТЗ №2 Блок C + дополнение D1/D2: корзина source_items + очередь удаления файлов
ALTER TABLE source_items
    ADD COLUMN archived_at DATETIME NULL COMMENT 'ручной архив админом (авто-архив живёт в site_status)',
    ADD COLUMN trashed_at DATETIME NULL,
    ADD COLUMN delete_after DATETIME NULL,
    ADD COLUMN trash_reason VARCHAR(64) NULL COMMENT 'manual | url_dead (зарезервировано, ТЗ сверки)',
    ADD KEY idx_trash (trashed_at, delete_after),
    ADD KEY idx_archived (archived_at);

CREATE TABLE IF NOT EXISTS file_cleanup_queue (
    id              CHAR(36)    NOT NULL PRIMARY KEY,
    owner_type      VARCHAR(16) NOT NULL,
    owner_id        CHAR(36)    NOT NULL,
    local_paths     JSON        NULL,
    drive_folder_id VARCHAR(64) NULL,
    enqueued_at     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    attempts        INT         NOT NULL DEFAULT 0,
    last_error      TEXT        NULL,
    state           ENUM('pending','done','failed') NOT NULL DEFAULT 'pending',
    KEY idx_state (state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SELECT 'block_c schema done' msg;
