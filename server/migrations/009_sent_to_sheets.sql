-- ТЗ №4 Ч4.4 — колонка sent_to_sheets + бэкфилл из легаси ParsedBase.sentToSheets
-- ⚠️ ВЫПОЛНИТЬ ДО дропа ParsedBase (Ч3)!
ALTER TABLE products ADD COLUMN sent_to_sheets TINYINT(1) NOT NULL DEFAULT 0;

UPDATE products p
JOIN ParsedBase pb ON pb.id = p.legacy_parsedbase_id
SET p.sent_to_sheets = 1
WHERE pb.sentToSheets = 1;

SELECT 'backfill done' msg, (SELECT COUNT(*) FROM products WHERE sent_to_sheets = 1) AS marked;
