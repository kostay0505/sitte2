-- Рантайм-переключатель парсеров (правка 2026-07-16)
CREATE TABLE IF NOT EXISTS ParserSettings (
    source     VARCHAR(32) NOT NULL PRIMARY KEY,
    enabled    TINYINT(1)  NOT NULL DEFAULT 1,
    updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO ParserSettings (source, enabled) VALUES
 ('arrius',1),('alv-france',1),('avls',1),('pa-audio',1),('soundtrade',1),('deltalive',1),
 ('cuesale',1),('kinxsound',1),('kinxconnect',1),('gearwise',1),('usedfull',1),('jsfrance',1);

SELECT source, enabled FROM ParserSettings ORDER BY source;
