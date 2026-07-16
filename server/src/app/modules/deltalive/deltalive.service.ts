import { Injectable, Inject, Logger, forwardRef } from '@nestjs/common';
import { ParserSettingsService } from '../parser-settings/parser-settings.service';
import { Cron } from '@nestjs/schedule';
import * as https from 'https';
import * as http from 'http';
import * as zlib from 'zlib';
import { DeltaLiveRepository } from './deltalive.repository';
import { ParserNotificationService } from '../telegram/parser-notification.service';

@Injectable()
export class DeltaLiveService {
    private readonly logger = new Logger(DeltaLiveService.name);
    private readonly BASE_URL = 'https://www.deltalive.com';

    constructor(
        private readonly parserSettings: ParserSettingsService,
        private readonly repo: DeltaLiveRepository,
        @Inject(forwardRef(() => ParserNotificationService)) private readonly parserNotification: ParserNotificationService,
    ) {}

    private fetchUrl(url: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const protocol = url.startsWith('https') ? https : http;
            const req = protocol.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-GB,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                },
                timeout: 20000,
            }, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    const location = res.headers['location'];
                    if (location) return resolve(this.fetchUrl(location));
                    return reject(new Error('Redirect without location'));
                }
                if (res.statusCode === 404 || res.statusCode === 410) {
                    return reject(Object.assign(new Error('Not found'), { status: res.statusCode }));
                }

                const chunks: Buffer[] = [];
                const encoding = res.headers['content-encoding'];

                const stream = encoding === 'gzip' ? res.pipe(zlib.createGunzip())
                    : encoding === 'br' ? res.pipe(zlib.createBrotliDecompress())
                    : encoding === 'deflate' ? res.pipe(zlib.createInflate())
                    : res;

                stream.on('data', (c: Buffer) => chunks.push(c));
                stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
                stream.on('error', reject);
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        });
    }

    private async fetchSitemapUrls(): Promise<string[]> {
        const sitemapUrl = `${this.BASE_URL}/equipment-sitemap.xml`;
        const xml = await this.fetchUrl(sitemapUrl);
        const matches = xml.matchAll(/<loc>(https?:\/\/www\.deltalive\.com\/equipment\/[^<]+)<\/loc>/gi);
        const urls: string[] = [];
        for (const m of matches) {
            const url = m[1].trim();
            // Only product pages (not category pages like /equipment/used/)
            if (url.split('/').filter(Boolean).length >= 3) {
                urls.push(url);
            }
        }
        return urls;
    }

    private extractProduct(html: string, url: string): {
        title: string | null;
        description: string | null;
        price: string | null;
        currency: string | null;
        quantityAvailable: number | null;
        images: string[];
        siteStatus: 'available' | 'sold' | 'not_found';
    } | null {
        // Title from <title> or <h1>
        let title: string | null = null;
        const h1Match = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([^<]+)<\/h1>/i)
            || html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        if (h1Match) title = h1Match[1].trim();
        if (!title) {
            const titleMatch = html.match(/<title>([^|<]+)/i);
            if (titleMatch) title = titleMatch[1].trim();
        }

        // Description from Yoast JSON-LD
        let description: string | null = null;
        const jsonLdMatches = html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
        for (const m of jsonLdMatches) {
            try {
                const parsed = JSON.parse(m[1]);
                const items = parsed['@graph'] ? parsed['@graph'] : (Array.isArray(parsed) ? parsed : [parsed]);
                for (const item of items) {
                    if (item['@type'] === 'WebPage' || item['@type'] === 'ItemPage') {
                        if (item.description) { description = item.description; break; }
                    }
                }
                if (description) break;
            } catch { /* skip */ }
        }

        // Price from specs table: Price (ex-VAT): £30,000
        let price: string | null = null;
        let currency: string | null = 'GBP';
        const priceMatch = html.match(/Price\s*\(ex-VAT\):[^<]*<[^>]*>\s*([£$€]?[\d,]+(?:\.\d+)?)/i);
        if (priceMatch) {
            let raw = priceMatch[1].trim();
            // Remove currency symbol, keep numeric
            raw = raw.replace(/[£$€]/g, '').replace(/,/g, '');
            if (raw && !isNaN(parseFloat(raw))) {
                price = raw;
            }
        }

        // Check for "Contact Us" (no price listed)
        const contactMatch = html.match(/Price\s*\(ex-VAT\):[^<]*<[^>]*>\s*Contact\s*Us/i);
        if (contactMatch) price = null;

        // Quantity from specs table
        let quantityAvailable: number | null = null;
        const qtyMatch = html.match(/Number\s*Available:[^<]*<[^>]*>\s*(\d+)/i);
        if (qtyMatch) quantityAvailable = parseInt(qtyMatch[1], 10);

        // Site status
        let siteStatus: 'available' | 'sold' | 'not_found' = 'available';
        if (html.includes('SOLD') && html.includes('sold-thumb')) siteStatus = 'sold';
        if (quantityAvailable !== null && quantityAvailable === 0) siteStatus = 'sold';

        // Images: wp-content uploads
        const imgRegex = /(?:src|data-src)="((?:https?:\/\/(?:www\.)?deltalive\.com)?\/wp-content\/uploads\/[^"]+\.(?:jpg|jpeg|png|webp))"/gi;
        const imgSet = new Set<string>();
        for (const m of html.matchAll(imgRegex)) {
            let src = m[1];
            if (!src.startsWith('http')) src = this.BASE_URL + src;
            // Exclude thumbnails/icons
            if (!src.includes('-150x') && !src.includes('-300x') && !src.includes('logo') && !src.includes('icon')) {
                imgSet.add(src);
            }
        }
        const images = Array.from(imgSet).slice(0, 20);

        if (!title) return null;
        return { title, description, price, currency, quantityAvailable, images, siteStatus };
    }

    private extractExternalId(url: string): string {
        // Use the URL slug as external ID
        const parts = url.replace(/\/$/, '').split('/');
        return parts[parts.length - 1];
    }

    @Cron('0 17 * * *')
    async scheduledParse(): Promise<void> {
        if (process.env.NODE_APP_INSTANCE !== '0') return;
        if (!(await this.parserSettings.isEnabled('deltalive'))) return;
        await this.parseAndSave();
    }

    async parseAndSave(): Promise<{ added: number; updated: number; errors: number }> {
        let added = 0, updated = 0, errors = 0;
        const newItems: Array<{ title: string; url: string }> = [];

        const urls = await this.fetchSitemapUrls();
        this.logger.log(`DeltaLive sitemap: ${urls.length} URLs`);

        const existingIds = new Set(await this.repo.getAllExternalIds());

        // Mark items no longer in sitemap as archived
        const sitemapIds = new Set(
            urls.map(u => this.extractExternalId(u)).filter(Boolean)
        );
        for (const id of existingIds) {
            if (!sitemapIds.has(id)) {
                await this.repo.markNotFound(id);
            }
        }

        for (const url of urls) {
            const externalId = this.extractExternalId(url);
            if (!externalId) continue;

            try {
                const existing = await this.repo.findByExternalId(externalId);

                if (existing) {
                    // Restore if previously archived
                    if (existing.status === 'archived') {
                        await this.repo.markAvailable(externalId);
                    }
                    // Re-fetch if price is missing
                    if (!existing.price && existing.status !== 'blacklisted') {
                        const html = await this.fetchUrl(url);
                        const data = this.extractProduct(html, url);
                        if (data) {
                            await this.repo.updateData(existing.id, {
                                price: data.price,
                                currency: data.currency,
                                quantityAvailable: data.quantityAvailable,
                                description: data.description,
                                images: data.images,
                                siteStatus: data.siteStatus,
                            });
                            updated++;
                        }
                    }
                    continue;
                }

                const html = await this.fetchUrl(url);
                const data = this.extractProduct(html, url);
                if (!data) { errors++; continue; }

                await this.repo.create({
                    externalId,
                    url,
                    title: data.title!,
                    description: data.description,
                    price: data.price,
                    currency: data.currency,
                    quantityAvailable: data.quantityAvailable,
                    images: data.images,
                    siteStatus: data.siteStatus,
                });
                added++;
                newItems.push({ title: data.title!, url });
            } catch (e: any) {
                if (e.status === 404 || e.status === 410) {
                    await this.repo.markNotFound(externalId);
                } else {
                    this.logger.warn(`DeltaLive error ${url}: ${e.message}`);
                    errors++;
                }
            }

            await new Promise(r => setTimeout(r, 500));
        }

        this.logger.log(`DeltaLive done: +${added} upd${updated} err${errors}`);
        await this.parserNotification.notify('DeltaLive', 'deltalive.com', newItems);
        return { added, updated, errors };
    }
}
