-- ТЗ №2, A-2: cutover Products → view поверх новой `products`
-- 0) гибкий статус + флаг «товар каталога vs черновик базы»
ALTER TABLE products MODIFY moderation_status VARCHAR(20) NULL;
ALTER TABLE products ADD COLUMN is_catalog TINYINT(1) NOT NULL DEFAULT 1;
UPDATE products SET is_catalog = 0 WHERE legacy_product_id IS NULL AND legacy_parsedbase_id IS NOT NULL;

-- 1) финальный полный ресинк товарных строк из легаси (617 строк, включая статус sold)
UPDATE products n JOIN Products p ON p.id = n.id
SET n.custom_id = NULLIF(p.customId, ''), n.user_id = p.userId, n.title = p.name,
    n.slug = p.slug, n.brand_slug = p.brandSlug,
    n.price_amount = p.priceCash, n.price_noncash_amount = p.priceNonCash,
    n.price_currency = IF(p.currency REGEXP '^[A-Za-z]{3}$', UPPER(p.currency), p.currency),
    n.preview = p.preview,
    n.images = IF(JSON_VALID(p.files), CAST(p.files AS JSON), n.images),
    n.description = p.description, n.category_id = p.categoryId, n.brand_id = p.brandId,
    n.quantity = p.quantity, n.quantity_type = p.quantityType,
    n.moderation_status = p.status, n.is_active = p.isActive, n.is_deleted = p.isDeleted;

-- хвост: товары легаси, отсутствующие в новой (созданные после миграции)
INSERT INTO products (id, custom_id, user_id, title, slug, brand_slug, price_amount, price_noncash_amount,
    price_currency, preview, images, description, category_id, brand_id, quantity, quantity_type,
    moderation_status, is_active, is_deleted, is_catalog, legacy_product_id, created_at)
SELECT p.id, NULLIF(p.customId, ''), p.userId, p.name, p.slug, p.brandSlug, p.priceCash, p.priceNonCash,
       IF(p.currency REGEXP '^[A-Za-z]{3}$', UPPER(p.currency), p.currency), p.preview,
       IF(JSON_VALID(p.files), CAST(p.files AS JSON), NULL), p.description, p.categoryId, p.brandId,
       p.quantity, p.quantityType, p.status, p.isActive, p.isDeleted, 1, p.id, p.createdAt
FROM Products p LEFT JOIN products n ON n.id = p.id
WHERE n.id IS NULL;

-- 2) пересчёт visibility_status (единая формула, + sold)
UPDATE products SET visibility_status = CASE
    WHEN is_deleted = 1 THEN 'archived'
    WHEN moderation_status = 'sold' THEN 'sold'
    WHEN COALESCE(moderation_status, '') <> 'approved' THEN 'draft'
    WHEN is_active = 0 THEN 'hidden'
    ELSE 'published' END
WHERE is_catalog = 1;

-- 3) инвариант перед переключением
SELECT 'INVARIANT' k, (SELECT COUNT(*) FROM Products) legacy_cnt,
       (SELECT COUNT(*) FROM products WHERE is_catalog = 1) new_catalog_cnt,
       (SELECT COUNT(*) FROM Products p JOIN products n ON n.id = p.id
        WHERE n.price_amount <> p.priceCash OR n.is_active <> p.isActive OR n.is_deleted <> p.isDeleted) mismatches;
-- Часть 2 cutover: триггеры видимости, RENAME, VIEW, read-only легаси
DELIMITER $$

DROP TRIGGER IF EXISTS trg_products_vis_bi $$
CREATE TRIGGER trg_products_vis_bi BEFORE INSERT ON products FOR EACH ROW
BEGIN
    IF NEW.is_catalog = 1 THEN
        SET NEW.visibility_status = CASE
            WHEN NEW.is_deleted = 1 THEN 'archived'
            WHEN NEW.moderation_status = 'sold' THEN 'sold'
            WHEN COALESCE(NEW.moderation_status, '') <> 'approved' THEN 'draft'
            WHEN NEW.is_active = 0 THEN 'hidden'
            ELSE 'published' END;
    END IF;
END $$

DROP TRIGGER IF EXISTS trg_products_vis_bu $$
CREATE TRIGGER trg_products_vis_bu BEFORE UPDATE ON products FOR EACH ROW
BEGIN
    IF NEW.is_catalog = 1 THEN
        SET NEW.visibility_status = CASE
            WHEN NEW.is_deleted = 1 THEN 'archived'
            WHEN NEW.moderation_status = 'sold' THEN 'sold'
            WHEN COALESCE(NEW.moderation_status, '') <> 'approved' THEN 'draft'
            WHEN NEW.is_active = 0 THEN 'hidden'
            ELSE 'published' END;
    END IF;
END $$

DELIMITER ;

-- CUTOVER (атомарно)
RENAME TABLE Products TO ProductsLegacy;

CREATE VIEW Products AS
SELECT id, custom_id AS customId, user_id AS userId, title AS name, slug,
       brand_slug AS brandSlug, price_amount AS priceCash, price_noncash_amount AS priceNonCash,
       price_currency AS currency, preview,
       COALESCE(CAST(images AS CHAR), '[]') AS files, description,
       category_id AS categoryId, brand_id AS brandId, quantity, quantity_type AS quantityType,
       moderation_status AS status, is_active AS isActive, is_deleted AS isDeleted,
       created_at AS createdAt, updated_at AS updatedAt
FROM products WHERE is_catalog = 1;

-- Легаси: read-only страховка (минимум 2 недели, удаление — отдельным решением)
DELIMITER $$
CREATE TRIGGER trg_plegacy_ro_bi BEFORE INSERT ON ProductsLegacy FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ProductsLegacy is read-only (cutover 2026-07-14)'; END $$
CREATE TRIGGER trg_plegacy_ro_bu BEFORE UPDATE ON ProductsLegacy FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ProductsLegacy is read-only (cutover 2026-07-14)'; END $$
CREATE TRIGGER trg_plegacy_ro_bd BEFORE DELETE ON ProductsLegacy FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ProductsLegacy is read-only (cutover 2026-07-14)'; END $$
DELIMITER ;

SELECT 'CUTOVER DONE' msg;
SELECT COUNT(*) view_rows FROM Products;
