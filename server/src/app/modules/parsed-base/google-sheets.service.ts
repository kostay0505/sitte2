import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as https from 'https';
import * as fs from 'fs';

@Injectable()
export class GoogleSheetsService {
    private credentials: any;
    private readonly spreadsheetId: string;
    private readonly sheetName = 'Оборудование в Европе 2026';

    constructor() {
        const credPath = process.env.GOOGLE_SHEETS_CREDENTIALS_PATH
            || '/var/www/touring-test/server/google-sheets-credentials.json';
        this.credentials = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
        this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID
            || '1ZgJpLl9jH3TcjFobXj_5S1RFkeFPAvxSE7nyX_Fs7AI';
    }

    private async getAccessToken(): Promise<string> {
        const now = Math.floor(Date.now() / 1000);
        const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({
            iss: this.credentials.client_email,
            scope: 'https://www.googleapis.com/auth/spreadsheets',
            aud: 'https://oauth2.googleapis.com/token',
            exp: now + 3600,
            iat: now,
        })).toString('base64url');

        const toSign = `${header}.${payload}`;
        const sign = crypto.createSign('RSA-SHA256');
        sign.update(toSign);
        const signature = sign.sign(this.credentials.private_key, 'base64url');
        const jwt = `${toSign}.${signature}`;

        const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
        const response = await this.request('POST', 'oauth2.googleapis.com', '/token', body, 'application/x-www-form-urlencoded');
        const data = JSON.parse(response);
        if (!data.access_token) throw new Error('Google auth failed: ' + JSON.stringify(data));
        return data.access_token;
    }

    private request(method: string, hostname: string, path: string, body: string | null, contentType?: string, token?: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const headers: Record<string, string> = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;
            if (body !== null && contentType) {
                headers['Content-Type'] = contentType;
                headers['Content-Length'] = Buffer.byteLength(body).toString();
            }

            const req = https.request({ hostname, path, method, headers }, (res) => {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => resolve(data));
            });
            req.on('error', reject);
            if (body !== null) req.write(body);
            req.end();
        });
    }

    private encodeRange(range: string): string {
        // Encode Cyrillic/spaces but keep ! and : as-is for Sheets range notation
        return encodeURIComponent(range).replace(/%21/g, '!').replace(/%3A/gi, ':');
    }

    private async getNextRow(token: string): Promise<number> {
        const range = this.encodeRange(`'${this.sheetName}'!B:B`);
        const path = `/v4/spreadsheets/${this.spreadsheetId}/values/${range}`;
        const response = await this.request('GET', 'sheets.googleapis.com', path, null, undefined, token);
        const data = JSON.parse(response);
        if (data.error) throw new Error('Sheets read error: ' + data.error.message);
        return (data.values?.length ?? 0) + 1;
    }

    async appendRow(brand: string | null, description: string | null, price: string | null, url: string | null): Promise<void> {
        const token = await this.getAccessToken();
        const row = await this.getNextRow(token);
        const range = this.encodeRange(`'${this.sheetName}'!B${row}:E${row}`);
        const path = `/v4/spreadsheets/${this.spreadsheetId}/values/${range}?valueInputOption=RAW`;
        const body = JSON.stringify({ values: [[brand ?? '', description ?? '', price ?? '', url ?? '']] });
        const response = await this.request('PUT', 'sheets.googleapis.com', path, body, 'application/json', token);
        const data = JSON.parse(response);
        if (data.error) throw new Error('Sheets write error: ' + data.error.message);
    }
}
