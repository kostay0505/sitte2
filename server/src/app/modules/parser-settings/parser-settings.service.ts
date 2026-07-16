import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Database } from '../../../database/schema';

/**
 * Рантайм-переключатель парсеров (ТЗ правки 2026-07-16).
 * Флаг в таблице ParserSettings; каждый парсер проверяет isEnabled() в начале крона.
 * По умолчанию (нет строки) — включён.
 */
@Injectable()
export class ParserSettingsService {
    constructor(@Inject('DATABASE') private db: Database) {}

    async isEnabled(source: string): Promise<boolean> {
        const rows = (await this.db.execute(sql`
            SELECT enabled FROM ParserSettings WHERE source = ${source} LIMIT 1
        `)) as unknown as any[];
        const r = (rows[0] as any[])[0];
        return r ? !!r.enabled : true;
    }

    async list(): Promise<Array<{ source: string; enabled: boolean }>> {
        const rows = (await this.db.execute(sql`
            SELECT source, enabled FROM ParserSettings ORDER BY source
        `)) as unknown as any[];
        return (rows[0] as any[]).map(r => ({ source: r.source, enabled: !!r.enabled }));
    }

    async setEnabled(source: string, enabled: boolean): Promise<void> {
        await this.db.execute(sql`
            INSERT INTO ParserSettings (source, enabled) VALUES (${source}, ${enabled ? 1 : 0})
            ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)
        `);
    }

    async toggle(source: string): Promise<{ source: string; enabled: boolean }> {
        const cur = await this.isEnabled(source);
        await this.setEnabled(source, !cur);
        return { source, enabled: !cur };
    }
}
