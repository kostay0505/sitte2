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
