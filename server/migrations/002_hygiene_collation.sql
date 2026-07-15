-- Фаза 7: гигиена
UPDATE Products SET customId = NULL WHERE customId = '';

-- Единый collation для строковых ключей (в аудите ParsedBase, Cuesale и Soundtrade были utf8mb4_unicode_ci)
ALTER TABLE ParsedBase CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE CuesaleProducts CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE SoundtradeProducts CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

SELECT 'phase7 done' AS msg;
SELECT COUNT(*) AS empty_customId_left FROM Products WHERE customId = '';
SELECT table_name, table_collation FROM information_schema.tables
WHERE table_schema='touring_db' AND table_name IN ('ParsedBase','CuesaleProducts','SoundtradeProducts');
