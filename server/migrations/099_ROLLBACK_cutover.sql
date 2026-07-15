-- ПЛАН ОТКАТА cutover (ТЗ №2, A-3). Выполнять ТОЛЬКО при провале смоук-теста.
-- 1) вернуть легаси-таблицу на место:
DROP VIEW IF EXISTS Products;
DROP TRIGGER IF EXISTS trg_plegacy_ro_bi;
DROP TRIGGER IF EXISTS trg_plegacy_ro_bu;
DROP TRIGGER IF EXISTS trg_plegacy_ro_bd;
RENAME TABLE ProductsLegacy TO Products;
-- 2) код: git revert последнего коммита cutover + пересборка:
--    cd /var/www/touring-test && sudo -u touring git revert --no-edit <sha_cutover>
--    sudo -u touring -H bash -lc 'cd /var/www/touring-test/server && npm run build && pm2 restart touring-backend'
-- 3) товары, созданные в новую схему между cutover и откатом, при необходимости
--    перенести вручную из `products` (WHERE created_at > время cutover) в Products.
