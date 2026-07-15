DELIMITER $$
DROP PROCEDURE IF EXISTS upsert_source_item $$
CREATE PROCEDURE upsert_source_item(
    IN p_source VARCHAR(32), IN p_external VARCHAR(255), IN p_url TEXT, IN p_title TEXT,
    IN p_desc MEDIUMTEXT, IN p_amount DECIMAL(12,2), IN p_currency CHAR(3),
    IN p_avail VARCHAR(20), IN p_site VARCHAR(30), IN p_images MEDIUMTEXT, IN p_price_str TEXT, IN p_last DATETIME)
BEGIN
    INSERT INTO source_items (id, source, external_id, url, title, description, price_amount, price_currency,
                              availability_state, site_status, images, raw, parse_error, first_seen, last_seen)
    VALUES (UUID(), p_source, p_external, p_url, LEFT(COALESCE(p_title,''),500), p_desc,
            IF(p_amount > 0 AND p_amount < 100000000, p_amount, NULL), p_currency,
            IF(p_avail IN ('in_stock','out_of_stock'), p_avail, 'unknown'), p_site,
            IF(p_images IS NOT NULL AND JSON_VALID(p_images), CAST(p_images AS JSON), NULL),
            JSON_OBJECT('price', p_price_str, 'via', 'trigger'),
            IF(COALESCE(p_price_str,'') <> '' AND (p_amount IS NULL OR p_amount <= 0 OR p_amount >= 100000000), 1, 0),
            NOW(), COALESCE(p_last, NOW()))
    ON DUPLICATE KEY UPDATE
        url = VALUES(url), title = VALUES(title), description = VALUES(description),
        price_amount = VALUES(price_amount), price_currency = VALUES(price_currency),
        availability_state = VALUES(availability_state), site_status = VALUES(site_status),
        images = COALESCE(VALUES(images), images),
        raw = JSON_MERGE_PATCH(COALESCE(raw, JSON_OBJECT()), VALUES(raw)),
        parse_error = VALUES(parse_error), last_seen = VALUES(last_seen);
END $$
DROP TRIGGER IF EXISTS trg_si_arrius_ai $$
CREATE TRIGGER trg_si_arrius_ai AFTER INSERT ON ArriusProducts FOR EACH ROW
CALL upsert_source_item('arrius', CONVERT(NEW.externalId, CHAR), NEW.url, NEW.title, NEW.description,
    CAST(NULLIF(REGEXP_REPLACE(REPLACE(COALESCE(NEW.price,''),',',''),'[^0-9.]',''),'') AS DECIMAL(12,2)), CASE WHEN NEW.price LIKE '%€%' THEN 'EUR' WHEN NEW.price LIKE '%£%' THEN 'GBP' WHEN COALESCE(NEW.price,'')='' THEN NULL ELSE 'USD' END, 'unknown', NEW.siteStatus, NEW.images, NEW.price,
    COALESCE(NEW.lastCheckedAt, NOW())) $$
DROP TRIGGER IF EXISTS trg_si_arrius_au $$
CREATE TRIGGER trg_si_arrius_au AFTER UPDATE ON ArriusProducts FOR EACH ROW
CALL upsert_source_item('arrius', CONVERT(NEW.externalId, CHAR), NEW.url, NEW.title, NEW.description,
    CAST(NULLIF(REGEXP_REPLACE(REPLACE(COALESCE(NEW.price,''),',',''),'[^0-9.]',''),'') AS DECIMAL(12,2)), CASE WHEN NEW.price LIKE '%€%' THEN 'EUR' WHEN NEW.price LIKE '%£%' THEN 'GBP' WHEN COALESCE(NEW.price,'')='' THEN NULL ELSE 'USD' END, 'unknown', NEW.siteStatus, NEW.images, NEW.price,
    COALESCE(NEW.lastCheckedAt, NOW())) $$
DROP TRIGGER IF EXISTS trg_si_alv_france_ai $$
CREATE TRIGGER trg_si_alv_france_ai AFTER INSERT ON AlvFranceProducts FOR EACH ROW
CALL upsert_source_item('alv-france', CONVERT(NEW.externalId, CHAR), NEW.url, NEW.title, NEW.description,
    CAST(NULLIF(REGEXP_REPLACE(REPLACE(REPLACE(COALESCE(NEW.price,''),' ',''),',',''),'[^0-9.]',''),'') AS DECIMAL(12,2)), CASE WHEN COALESCE(NEW.currency,'') REGEXP '^[A-Za-z]{3}$' THEN UPPER(NEW.currency) WHEN NEW.price LIKE '%€%' THEN 'EUR' WHEN NEW.price LIKE '%$%' THEN 'USD' ELSE NULL END, CASE LOWER(TRIM(COALESCE(NEW.availability,''))) WHEN 'in stock' THEN 'in_stock' WHEN 'out of stock' THEN 'out_of_stock' ELSE 'unknown' END, NEW.siteStatus, NEW.images, NEW.price,
    COALESCE(NEW.lastCheckedAt, NOW())) $$
DROP TRIGGER IF EXISTS trg_si_alv_france_au $$
CREATE TRIGGER trg_si_alv_france_au AFTER UPDATE ON AlvFranceProducts FOR EACH ROW
CALL upsert_source_item('alv-france', CONVERT(NEW.externalId, CHAR), NEW.url, NEW.title, NEW.description,
    CAST(NULLIF(REGEXP_REPLACE(REPLACE(REPLACE(COALESCE(NEW.price,''),' ',''),',',''),'[^0-9.]',''),'') AS DECIMAL(12,2)), CASE WHEN COALESCE(NEW.currency,'') REGEXP '^[A-Za-z]{3}$' THEN UPPER(NEW.currency) WHEN NEW.price LIKE '%€%' THEN 'EUR' WHEN NEW.price LIKE '%$%' THEN 'USD' ELSE NULL END, CASE LOWER(TRIM(COALESCE(NEW.availability,''))) WHEN 'in stock' THEN 'in_stock' WHEN 'out of stock' THEN 'out_of_stock' ELSE 'unknown' END, NEW.siteStatus, NEW.images, NEW.price,
    COALESCE(NEW.lastCheckedAt, NOW())) $$
DROP TRIGGER IF EXISTS trg_si_avls_ai $$
CREATE TRIGGER trg_si_avls_ai AFTER INSERT ON AvlsProducts FOR EACH ROW
CALL upsert_source_item('avls', CONVERT(NEW.externalId, CHAR), NEW.url, NEW.title, NEW.description,
    CAST(NULLIF(REGEXP_REPLACE(REPLACE(REPLACE(COALESCE(NEW.price,''),' ',''),',',''),'[^0-9.]',''),'') AS DECIMAL(12,2)), CASE WHEN COALESCE(NEW.currency,'') REGEXP '^[A-Za-z]{3}$' THEN UPPER(NEW.currency) WHEN NEW.price LIKE '%€%' THEN 'EUR' WHEN NEW.price LIKE '%$%' THEN 'USD' ELSE NULL END, CASE LOWER(TRIM(COALESCE(NEW.availability,''))) WHEN 'in stock' THEN 'in_stock' WHEN 'out of stock' THEN 'out_of_stock' ELSE 'unknown' END, NEW.siteStatus, NEW.images, NEW.price,
    COALESCE(NEW.lastCheckedAt, NOW())) $$
DROP TRIGGER IF EXISTS trg_si_avls_au $$
CREATE TRIGGER trg_si_avls_au AFTER UPDATE ON AvlsProducts FOR EACH ROW
CALL upsert_source_item('avls', CONVERT(NEW.externalId, CHAR), NEW.url, NEW.title, NEW.description,
    CAST(NULLIF(REGEXP_REPLACE(REPLACE(REPLACE(COALESCE(NEW.price,''),' ',''),',',''),'[^0-9.]',''),'') AS DECIMAL(12,2)), CASE WHEN COALESCE(NEW.currency,'') REGEXP '^[A-Za-z]{3}$' THEN UPPER(NEW.currency) WHEN NEW.price LIKE '%€%' THEN 'EUR' WHEN NEW.price LIKE '%$%' THEN 'USD' ELSE NULL END, CASE LOWER(TRIM(COALESCE(NEW.availability,''))) WHEN 'in stock' THEN 'in_stock' WHEN 'out of stock' THEN 'out_of_stock' ELSE 'unknown' END, NEW.siteStatus, NEW.images, NEW.price,
    COALESCE(NEW.lastCheckedAt, NOW())) $$
DROP TRIGGER IF EXISTS trg_si_pa_audio_ai $$
CREATE TRIGGER trg_si_pa_audio_ai AFTER INSERT ON PaAudioProducts FOR EACH ROW
CALL upsert_source_item('pa-audio', CONVERT(NEW.externalId, CHAR), NEW.url, NEW.title, NEW.description,
    CAST(NULLIF(REGEXP_REPLACE(REPLACE(REPLACE(COALESCE(NEW.price,''),' ',''),',',''),'[^0-9.]',''),'') AS DECIMAL(12,2)), CASE WHEN COALESCE(NEW.currency,'') REGEXP '^[A-Za-z]{3}$' THEN UPPER(NEW.currency) WHEN NEW.price LIKE '%€%' THEN 'EUR' WHEN NEW.price LIKE '%$%' THEN 'USD' ELSE NULL END, CASE LOWER(TRIM(COALESCE(NEW.availability,''))) WHEN 'in stock' THEN 'in_stock' WHEN 'out of stock' THEN 'out_of_stock' ELSE 'unknown' END, NEW.siteStatus, NEW.images, NEW.price,
    COALESCE(NEW.lastCheckedAt, NOW())) $$
DROP TRIGGER IF EXISTS trg_si_pa_audio_au $$
CREATE TRIGGER trg_si_pa_audio_au AFTER UPDATE ON PaAudioProducts FOR EACH ROW
CALL upsert_source_item('pa-audio', CONVERT(NEW.externalId, CHAR), NEW.url, NEW.title, NEW.description,
    CAST(NULLIF(REGEXP_REPLACE(REPLACE(REPLACE(COALESCE(NEW.price,''),' ',''),',',''),'[^0-9.]',''),'') AS DECIMAL(12,2)), CASE WHEN COALESCE(NEW.currency,'') REGEXP '^[A-Za-z]{3}$' THEN UPPER(NEW.currency) WHEN NEW.price LIKE '%€%' THEN 'EUR' WHEN NEW.price LIKE '%$%' THEN 'USD' ELSE NULL END, CASE LOWER(TRIM(COALESCE(NEW.availability,''))) WHEN 'in stock' THEN 'in_stock' WHEN 'out of stock' THEN 'out_of_stock' ELSE 'unknown' END, NEW.siteStatus, NEW.images, NEW.price,
    COALESCE(NEW.lastCheckedAt, NOW())) $$
DROP TRIGGER IF EXISTS trg_si_soundtrade_ai $$
CREATE TRIGGER trg_si_soundtrade_ai AFTER INSERT ON SoundtradeProducts FOR EACH ROW
CALL upsert_source_item('soundtrade', CONVERT(NEW.externalId, CHAR), NEW.url, NEW.title, NEW.description,
    CAST(NULLIF(REGEXP_REPLACE(REPLACE(REPLACE(COALESCE(NEW.price,''),' ',''),',',''),'[^0-9.]',''),'') AS DECIMAL(12,2)), CASE WHEN COALESCE(NEW.currency,'') REGEXP '^[A-Za-z]{3}$' THEN UPPER(NEW.currency) WHEN NEW.price LIKE '%€%' THEN 'EUR' WHEN NEW.price LIKE '%$%' THEN 'USD' ELSE NULL END, CASE LOWER(TRIM(COALESCE(NEW.availability,''))) WHEN 'in stock' THEN 'in_stock' WHEN 'out of stock' THEN 'out_of_stock' ELSE 'unknown' END, NEW.siteStatus, NEW.images, NEW.price,
    COALESCE(NEW.lastCheckedAt, NOW())) $$
DROP TRIGGER IF EXISTS trg_si_soundtrade_au $$
CREATE TRIGGER trg_si_soundtrade_au AFTER UPDATE ON SoundtradeProducts FOR EACH ROW
CALL upsert_source_item('soundtrade', CONVERT(NEW.externalId, CHAR), NEW.url, NEW.title, NEW.description,
    CAST(NULLIF(REGEXP_REPLACE(REPLACE(REPLACE(COALESCE(NEW.price,''),' ',''),',',''),'[^0-9.]',''),'') AS DECIMAL(12,2)), CASE WHEN COALESCE(NEW.currency,'') REGEXP '^[A-Za-z]{3}$' THEN UPPER(NEW.currency) WHEN NEW.price LIKE '%€%' THEN 'EUR' WHEN NEW.price LIKE '%$%' THEN 'USD' ELSE NULL END, CASE LOWER(TRIM(COALESCE(NEW.availability,''))) WHEN 'in stock' THEN 'in_stock' WHEN 'out of stock' THEN 'out_of_stock' ELSE 'unknown' END, NEW.siteStatus, NEW.images, NEW.price,
    COALESCE(NEW.lastCheckedAt, NOW())) $$
DROP TRIGGER IF EXISTS trg_si_deltalive_ai $$
CREATE TRIGGER trg_si_deltalive_ai AFTER INSERT ON DeltaLiveProducts FOR EACH ROW
CALL upsert_source_item('deltalive', CONVERT(NEW.externalId, CHAR), NEW.url, NEW.title, NEW.description,
    CAST(NULLIF(REGEXP_REPLACE(REPLACE(REPLACE(COALESCE(NEW.price,''),' ',''),',',''),'[^0-9.]',''),'') AS DECIMAL(12,2)), CASE WHEN COALESCE(NEW.currency,'') REGEXP '^[A-Za-z]{3}$' THEN UPPER(NEW.currency) WHEN NEW.price LIKE '%€%' THEN 'EUR' WHEN NEW.price LIKE '%$%' THEN 'USD' ELSE NULL END, 'unknown', NEW.siteStatus, NEW.images, NEW.price,
    COALESCE(NEW.lastCheckedAt, NOW())) $$
DROP TRIGGER IF EXISTS trg_si_deltalive_au $$
CREATE TRIGGER trg_si_deltalive_au AFTER UPDATE ON DeltaLiveProducts FOR EACH ROW
CALL upsert_source_item('deltalive', CONVERT(NEW.externalId, CHAR), NEW.url, NEW.title, NEW.description,
    CAST(NULLIF(REGEXP_REPLACE(REPLACE(REPLACE(COALESCE(NEW.price,''),' ',''),',',''),'[^0-9.]',''),'') AS DECIMAL(12,2)), CASE WHEN COALESCE(NEW.currency,'') REGEXP '^[A-Za-z]{3}$' THEN UPPER(NEW.currency) WHEN NEW.price LIKE '%€%' THEN 'EUR' WHEN NEW.price LIKE '%$%' THEN 'USD' ELSE NULL END, 'unknown', NEW.siteStatus, NEW.images, NEW.price,
    COALESCE(NEW.lastCheckedAt, NOW())) $$
DROP TRIGGER IF EXISTS trg_si_cuesale_ai $$
CREATE TRIGGER trg_si_cuesale_ai AFTER INSERT ON CuesaleProducts FOR EACH ROW
CALL upsert_source_item('cuesale', CONVERT(NEW.externalId, CHAR), NEW.url, NEW.title, NEW.description,
    CAST(NULLIF(REGEXP_REPLACE(REPLACE(REPLACE(COALESCE(NEW.price,''),' ',''),',',''),'[^0-9.]',''),'') AS DECIMAL(12,2)), CASE WHEN COALESCE(NEW.currency,'') REGEXP '^[A-Za-z]{3}$' THEN UPPER(NEW.currency) WHEN NEW.price LIKE '%€%' THEN 'EUR' WHEN NEW.price LIKE '%$%' THEN 'USD' ELSE NULL END, 'unknown', NEW.siteStatus, NEW.images, NEW.price,
    COALESCE(NEW.lastCheckedAt, NOW())) $$
DROP TRIGGER IF EXISTS trg_si_cuesale_au $$
CREATE TRIGGER trg_si_cuesale_au AFTER UPDATE ON CuesaleProducts FOR EACH ROW
CALL upsert_source_item('cuesale', CONVERT(NEW.externalId, CHAR), NEW.url, NEW.title, NEW.description,
    CAST(NULLIF(REGEXP_REPLACE(REPLACE(REPLACE(COALESCE(NEW.price,''),' ',''),',',''),'[^0-9.]',''),'') AS DECIMAL(12,2)), CASE WHEN COALESCE(NEW.currency,'') REGEXP '^[A-Za-z]{3}$' THEN UPPER(NEW.currency) WHEN NEW.price LIKE '%€%' THEN 'EUR' WHEN NEW.price LIKE '%$%' THEN 'USD' ELSE NULL END, 'unknown', NEW.siteStatus, NEW.images, NEW.price,
    COALESCE(NEW.lastCheckedAt, NOW())) $$
DROP TRIGGER IF EXISTS trg_si_kinxsound_ai $$
CREATE TRIGGER trg_si_kinxsound_ai AFTER INSERT ON KinxsoundProducts FOR EACH ROW
CALL upsert_source_item('kinxsound', CONVERT(NEW.externalId, CHAR), NEW.url, NEW.title, NEW.description,
    NULLIF(NEW.priceEur, 0), 'EUR', 'unknown', NEW.siteStatus, NEW.images, NEW.price,
    COALESCE(NEW.lastCheckedAt, NOW())) $$
DROP TRIGGER IF EXISTS trg_si_kinxsound_au $$
CREATE TRIGGER trg_si_kinxsound_au AFTER UPDATE ON KinxsoundProducts FOR EACH ROW
CALL upsert_source_item('kinxsound', CONVERT(NEW.externalId, CHAR), NEW.url, NEW.title, NEW.description,
    NULLIF(NEW.priceEur, 0), 'EUR', 'unknown', NEW.siteStatus, NEW.images, NEW.price,
    COALESCE(NEW.lastCheckedAt, NOW())) $$
DROP TRIGGER IF EXISTS trg_si_kinxconnect_ai $$
CREATE TRIGGER trg_si_kinxconnect_ai AFTER INSERT ON KinxConnectListings FOR EACH ROW
CALL upsert_source_item('kinxconnect', CONVERT(NEW.externalId, CHAR), NEW.url, NEW.title, NEW.description,
    NULLIF(NEW.priceRaw, 0), CASE WHEN COALESCE(NEW.currency,'') REGEXP '^[A-Za-z]{3}$' THEN UPPER(NEW.currency) ELSE NULL END, 'unknown', NEW.siteStatus, NEW.images, NEW.price,
    COALESCE(NEW.lastCheckedAt, NOW())) $$
DROP TRIGGER IF EXISTS trg_si_kinxconnect_au $$
CREATE TRIGGER trg_si_kinxconnect_au AFTER UPDATE ON KinxConnectListings FOR EACH ROW
CALL upsert_source_item('kinxconnect', CONVERT(NEW.externalId, CHAR), NEW.url, NEW.title, NEW.description,
    NULLIF(NEW.priceRaw, 0), CASE WHEN COALESCE(NEW.currency,'') REGEXP '^[A-Za-z]{3}$' THEN UPPER(NEW.currency) ELSE NULL END, 'unknown', NEW.siteStatus, NEW.images, NEW.price,
    COALESCE(NEW.lastCheckedAt, NOW())) $$
DROP TRIGGER IF EXISTS trg_si_gearwise_ai $$
CREATE TRIGGER trg_si_gearwise_ai AFTER INSERT ON GearwiseProducts FOR EACH ROW
CALL upsert_source_item('gearwise', CONVERT(NEW.externalId, CHAR), NEW.url, NEW.title, NEW.description,
    CAST(NULLIF(REPLACE(REGEXP_REPLACE(REPLACE(REPLACE(COALESCE(NEW.price,''),' ',''),'.',''),'[^0-9,]',''),',','.'),'') AS DECIMAL(12,2)), CASE WHEN COALESCE(NEW.price,'')='' THEN NULL ELSE 'EUR' END, 'unknown', NEW.siteStatus, NEW.images, NEW.price,
    COALESCE(NEW.lastCheckedAt, NOW())) $$
DROP TRIGGER IF EXISTS trg_si_gearwise_au $$
CREATE TRIGGER trg_si_gearwise_au AFTER UPDATE ON GearwiseProducts FOR EACH ROW
CALL upsert_source_item('gearwise', CONVERT(NEW.externalId, CHAR), NEW.url, NEW.title, NEW.description,
    CAST(NULLIF(REPLACE(REGEXP_REPLACE(REPLACE(REPLACE(COALESCE(NEW.price,''),' ',''),'.',''),'[^0-9,]',''),',','.'),'') AS DECIMAL(12,2)), CASE WHEN COALESCE(NEW.price,'')='' THEN NULL ELSE 'EUR' END, 'unknown', NEW.siteStatus, NEW.images, NEW.price,
    COALESCE(NEW.lastCheckedAt, NOW())) $$
DROP TRIGGER IF EXISTS trg_si_usedfull_ai $$
CREATE TRIGGER trg_si_usedfull_ai AFTER INSERT ON UsedfullProducts FOR EACH ROW
CALL upsert_source_item('usedfull', CONVERT(NEW.externalId, CHAR), NEW.url, NEW.title, NEW.description,
    CAST(NULLIF(REPLACE(REGEXP_REPLACE(REPLACE(REPLACE(COALESCE(NEW.price,''),' ',''),'.',''),'[^0-9,]',''),',','.'),'') AS DECIMAL(12,2)), CASE WHEN COALESCE(NEW.price,'')='' THEN NULL ELSE 'EUR' END, 'unknown', NEW.siteStatus, NEW.images, NEW.price,
    COALESCE(NEW.lastCheckedAt, NOW())) $$
DROP TRIGGER IF EXISTS trg_si_usedfull_au $$
CREATE TRIGGER trg_si_usedfull_au AFTER UPDATE ON UsedfullProducts FOR EACH ROW
CALL upsert_source_item('usedfull', CONVERT(NEW.externalId, CHAR), NEW.url, NEW.title, NEW.description,
    CAST(NULLIF(REPLACE(REGEXP_REPLACE(REPLACE(REPLACE(COALESCE(NEW.price,''),' ',''),'.',''),'[^0-9,]',''),',','.'),'') AS DECIMAL(12,2)), CASE WHEN COALESCE(NEW.price,'')='' THEN NULL ELSE 'EUR' END, 'unknown', NEW.siteStatus, NEW.images, NEW.price,
    COALESCE(NEW.lastCheckedAt, NOW())) $$
DROP TRIGGER IF EXISTS trg_si_jsfrance_ai $$
CREATE TRIGGER trg_si_jsfrance_ai AFTER INSERT ON JsFranceProducts FOR EACH ROW
CALL upsert_source_item('jsfrance', CONVERT(NEW.externalId, CHAR), NEW.url, NEW.title, NEW.description,
    CAST(NULLIF(REGEXP_REPLACE(REPLACE(REPLACE(CONVERT(COALESCE(NEW.priceTtc, NEW.priceHt, ''), CHAR),' ',''),',',''),'[^0-9.]',''),'') AS DECIMAL(12,2)), CASE WHEN COALESCE(NEW.currency,'') REGEXP '^[A-Za-z]{3}$' THEN UPPER(NEW.currency) ELSE 'EUR' END, 'unknown', NEW.siteStatus, NEW.images, CONVERT(COALESCE(NEW.priceTtc, NEW.priceHt), CHAR),
    COALESCE(NEW.lastCheckedAt, NOW())) $$
DROP TRIGGER IF EXISTS trg_si_jsfrance_au $$
CREATE TRIGGER trg_si_jsfrance_au AFTER UPDATE ON JsFranceProducts FOR EACH ROW
CALL upsert_source_item('jsfrance', CONVERT(NEW.externalId, CHAR), NEW.url, NEW.title, NEW.description,
    CAST(NULLIF(REGEXP_REPLACE(REPLACE(REPLACE(CONVERT(COALESCE(NEW.priceTtc, NEW.priceHt, ''), CHAR),' ',''),',',''),'[^0-9.]',''),'') AS DECIMAL(12,2)), CASE WHEN COALESCE(NEW.currency,'') REGEXP '^[A-Za-z]{3}$' THEN UPPER(NEW.currency) ELSE 'EUR' END, 'unknown', NEW.siteStatus, NEW.images, CONVERT(COALESCE(NEW.priceTtc, NEW.priceHt), CHAR),
    COALESCE(NEW.lastCheckedAt, NOW())) $$
DELIMITER ;
