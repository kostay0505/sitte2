'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePageTitle } from '@/components/AuthWrapper';
import { api } from '@/api/api';

const DISK_TOTAL = 20 * 1024 * 1024 * 1024; // 20 GB shown as max

function useSetPageTitle(title: string) {
    const { setPageTitle } = usePageTitle();
    useEffect(() => { setPageTitle(title); }, [title, setPageTitle]);
}

async function apiFetch(path: string, options?: RequestInit) {
    const method = (options?.method || 'GET').toUpperCase();
    const body = options?.body;
    const isFormData = body instanceof FormData;
    const isDownload = path.includes('/download');
    try {
        let res: any;
        if (method === 'GET') {
            res = await api.get(path, isDownload ? { responseType: 'blob' } : {});
        } else {
            res = await api.request({
                method: method as any,
                url: path,
                data: body ? (isFormData ? body : JSON.parse(body as string)) : undefined,
            });
        }
        const data = res.data;
        return {
            ok: true,
            json: async () => data,
            blob: async () => (data instanceof Blob ? data : new Blob([JSON.stringify(data)])),
            text: async () => (typeof data === 'string' ? data : JSON.stringify(data)),
        };
    } catch (e: any) {
        return { ok: false, json: async () => ({}), blob: async () => new Blob([]), text: async () => '' };
    }
}

interface DriveFolder { id: string; name: string; parentId: string | null; createdBy: string; createdAt: string; }
interface DriveFile   { id: string; name: string; storedName: string; mimeType: string; size: number; folderId: string | null; createdAt: string; }
interface PathItem    { id: string; name: string; }

function fmt(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function fmtGB(bytes: number) {
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function getExt(name: string) {
    const m = name.match(/\.([^.]+)$/);
    return m ? m[1].toUpperCase() : '?';
}

function getMimeCategory(mime: string, name: string): 'media' | 'document' | 'other' {
    if (mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/')) return 'media';
    if (mime.includes('pdf') || mime.includes('word') || mime.includes('excel') ||
        mime.includes('spreadsheet') || mime.includes('presentation') ||
        mime.includes('text') || /\.(txt|md|json|xml|csv|docx?|xlsx?|pptx?|odt|ods)$/.test(name)) return 'document';
    return 'other';
}

function canPreview(mime: string, name: string) {
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.includes('pdf')) return 'pdf';
    if (mime.includes('text') || /\.(txt|md|json|xml|yaml|yml|ts|js|py|sh|env|log|csv)$/.test(name)) return 'text';
    return 'none';
}

const FOLDER_COLORS = ['#d94f4f', '#4caf6a', '#4a7fe8', '#e8b84a', '#9c5fe8', '#e8834a'];

function FolderSVG({ color }: { color: string }) {
    return (
        <svg width="64" height="52" viewBox="0 0 64 52" fill="none">
            <path d="M0 10C0 7.79 1.79 6 4 6H26L30 2H60C62.21 2 64 3.79 64 6V48C64 50.21 62.21 52 60 52H4C1.79 52 0 50.21 0 48V10Z" fill={color} opacity="0.85"/>
            <path d="M0 16C0 13.79 1.79 12 4 12H60C62.21 12 64 13.79 64 16V48C64 50.21 62.21 52 60 52H4C1.79 52 0 50.21 0 48V16Z" fill={color}/>
            <path d="M0 16C0 13.79 1.79 12 4 12H60C62.21 12 64 13.79 64 16V22H0V16Z" fill="rgba(255,255,255,0.15)"/>
        </svg>
    );
}

function FileTypeBadge({ ext, mime }: { ext: string; mime: string }) {
    const colors: Record<string, { bg: string; text: string }> = {
        JPG: { bg: '#4a7fe8', text: '#fff' }, JPEG: { bg: '#4a7fe8', text: '#fff' },
        PNG: { bg: '#22c55e', text: '#fff' }, GIF: { bg: '#a855f7', text: '#fff' },
        WEBP: { bg: '#06b6d4', text: '#fff' }, SVG: { bg: '#f97316', text: '#fff' },
        PDF: { bg: '#ef4444', text: '#fff' },
        XLSX: { bg: '#16a34a', text: '#fff' }, XLS: { bg: '#16a34a', text: '#fff' },
        CSV: { bg: '#15803d', text: '#fff' },
        DOCX: { bg: '#2563eb', text: '#fff' }, DOC: { bg: '#2563eb', text: '#fff' },
        PPTX: { bg: '#ea580c', text: '#fff' }, PPT: { bg: '#ea580c', text: '#fff' },
        MP4: { bg: '#7c3aed', text: '#fff' }, MOV: { bg: '#7c3aed', text: '#fff' },
        MP3: { bg: '#db2777', text: '#fff' }, WAV: { bg: '#db2777', text: '#fff' },
        ZIP: { bg: '#78716c', text: '#fff' }, RAR: { bg: '#78716c', text: '#fff' },
        JSON: { bg: '#ca8a04', text: '#fff' }, XML: { bg: '#0891b2', text: '#fff' },
        TXT: { bg: '#64748b', text: '#fff' }, MD: { bg: '#475569', text: '#fff' },
    };
    const c = colors[ext] || { bg: '#94a3b8', text: '#fff' };
    return (
        <div style={{
            backgroundColor: c.bg, color: c.text,
            fontSize: '10px', fontWeight: '800',
            padding: '2px 6px', borderRadius: '4px',
            letterSpacing: '0.04em', lineHeight: 1.4,
            display: 'inline-block',
        }}>{ext}</div>
    );
}

// Document icon SVG (white card with folded corner)
function DocIcon({ ext, mime }: { ext: string; mime: string }) {
    return (
        <div style={{ position: 'relative', width: '56px', height: '68px', margin: '0 auto 8px' }}>
            <svg width="56" height="68" viewBox="0 0 56 68" fill="none">
                <path d="M4 0H40L56 16V64C56 66.2 54.2 68 52 68H4C1.8 68 0 66.2 0 64V4C0 1.8 1.8 0 4 0Z" fill="white"/>
                <path d="M40 0L56 16H44C41.8 16 40 14.2 40 12V0Z" fill="#e2e8f0"/>
                <rect x="10" y="28" width="36" height="3" rx="1.5" fill="#e2e8f0"/>
                <rect x="10" y="36" width="28" height="3" rx="1.5" fill="#e2e8f0"/>
                <rect x="10" y="44" width="32" height="3" rx="1.5" fill="#e2e8f0"/>
            </svg>
            <div style={{ position: 'absolute', bottom: '-2px', left: '50%', transform: 'translateX(-50%)' }}>
                <FileTypeBadge ext={ext} mime={mime} />
            </div>
        </div>
    );
}

// ─── Preview Modal ─────────────────────────────────────────────────────────────
function PreviewModal({ file, onClose, onDownload, onRename }: {
    file: DriveFile; onClose: () => void;
    onDownload: (f: DriveFile) => void; onRename: (f: DriveFile) => void;
}) {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [textContent, setTextContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const mode = canPreview(file.mimeType, file.name);

    useEffect(() => {
        let url: string | null = null;
        (async () => {
            try {
                if (mode === 'none') { setLoading(false); return; }
                const res = await apiFetch(`/drive/files/${file.id}/download`);
                const blob = await res.blob();
                if (mode === 'text') { setTextContent(await blob.text()); }
                else { url = URL.createObjectURL(blob); setBlobUrl(url); }
            } finally { setLoading(false); }
        })();
        return () => { if (url) URL.revokeObjectURL(url); };
    }, [file.id, mode]);

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [onClose]);

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 2000, backgroundColor: 'rgba(15,23,42,0.8)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div onClick={e => e.stopPropagation()} style={{ backgroundColor: '#fff', borderRadius: '20px', boxShadow: '0 24px 80px rgba(0,0,0,0.4)', width: '100%', maxWidth: '900px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
                    <FileTypeBadge ext={getExt(file.name)} mime={file.mimeType} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>{fmt(file.size)} · {new Date(file.createdAt).toLocaleDateString('ru-RU')}</div>
                    </div>
                    <button onClick={() => onRename(file)} style={hdrBtn}>✏️ Переименовать</button>
                    <button onClick={() => onDownload(file)} style={{ ...hdrBtn, backgroundColor: '#1e293b', color: '#fff', border: 'none' }}>⬇️ Скачать</button>
                    <button onClick={onClose} style={{ ...hdrBtn, padding: '6px 12px', fontSize: '20px', lineHeight: 1 }}>×</button>
                </div>
                <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', minHeight: 0 }}>
                    {loading ? <div style={{ color: '#94a3b8' }}>Загрузка...</div>
                    : mode === 'image' && blobUrl ? <img src={blobUrl} alt={file.name} style={{ maxWidth: '100%', maxHeight: '65vh', objectFit: 'contain', borderRadius: '8px' }} />
                    : mode === 'video' && blobUrl ? <video src={blobUrl} controls style={{ maxWidth: '100%', maxHeight: '65vh', borderRadius: '8px' }} />
                    : mode === 'audio' && blobUrl ? <div style={{ textAlign: 'center' }}><div style={{ fontSize: '64px', marginBottom: '20px' }}>🎵</div><audio src={blobUrl} controls style={{ width: '100%', maxWidth: '480px' }} /></div>
                    : mode === 'pdf' && blobUrl ? <iframe src={blobUrl} title={file.name} style={{ width: '100%', height: '65vh', border: 'none', borderRadius: '8px' }} />
                    : mode === 'text' && textContent !== null ? <pre style={{ width: '100%', maxHeight: '65vh', overflow: 'auto', fontSize: '13px', lineHeight: 1.6, color: '#1e293b', backgroundColor: '#f8fafc', borderRadius: '12px', padding: '20px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontFamily: 'monospace' }}>{textContent}</pre>
                    : <div style={{ textAlign: 'center', color: '#64748b' }}>
                        <div style={{ fontSize: '64px', marginBottom: '16px' }}>📎</div>
                        <div style={{ fontSize: '15px', fontWeight: '500', marginBottom: '8px' }}>Предпросмотр недоступен</div>
                        <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '20px' }}>Этот тип файла нельзя отобразить в браузере</div>
                        <button onClick={() => onDownload(file)} style={{ padding: '10px 24px', borderRadius: '10px', border: 'none', backgroundColor: '#1e293b', color: '#fff', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}>⬇️ Скачать файл</button>
                    </div>}
                </div>
            </div>
        </div>
    );
}

const hdrBtn: React.CSSProperties = { padding: '6px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', backgroundColor: 'transparent', color: '#1e293b', fontSize: '13px', cursor: 'pointer', fontWeight: '500', whiteSpace: 'nowrap' };

// ─── Rename Modal ──────────────────────────────────────────────────────────────
function RenameModal({ initialName, onConfirm, onCancel }: { initialName: string; onConfirm: (n: string) => void; onCancel: () => void; }) {
    const [name, setName] = useState(initialName);
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [onCancel]);
    return (
        <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 3000, backgroundColor: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', width: '380px', boxShadow: '0 16px 48px rgba(0,0,0,0.25)' }}>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>✏️ Переименовать</div>
                <input ref={ref} value={name} onChange={e => setName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onConfirm(name.trim()); }}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
                    <button onClick={onCancel} style={{ padding: '8px 20px', borderRadius: '10px', border: '1.5px solid #e2e8f0', backgroundColor: 'transparent', fontSize: '13px', cursor: 'pointer' }}>Отмена</button>
                    <button onClick={() => name.trim() && onConfirm(name.trim())} style={{ padding: '8px 20px', borderRadius: '10px', border: 'none', backgroundColor: '#1e293b', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Сохранить</button>
                </div>
            </div>
        </div>
    );
}

// ─── Folder Card ───────────────────────────────────────────────────────────────
function FolderCard({ folder, color, onOpen, onRename, onDelete }: {
    folder: DriveFolder; color: string;
    onOpen: () => void; onRename: () => void; onDelete: () => void;
}) {
    const [menuOpen, setMenuOpen] = useState(false);
    return (
        <div
            onDoubleClick={onOpen}
            style={{ backgroundColor: 'rgba(255,255,255,0.13)', backdropFilter: 'blur(12px)', borderRadius: '16px', padding: '16px 14px 12px', cursor: 'pointer', position: 'relative', border: '1px solid rgba(255,255,255,0.18)', transition: 'background 0.15s' }}
        >
            {/* 3-dot menu */}
            <button
                onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
                style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', fontSize: '16px', lineHeight: 1, padding: '2px 6px', borderRadius: '6px' }}
            >⋮</button>
            {menuOpen && (
                <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: '32px', right: '10px', zIndex: 100, backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', padding: '4px', minWidth: '140px' }}>
                    <button onClick={() => { onOpen(); setMenuOpen(false); }} style={dropItem}>📂 Открыть</button>
                    <button onClick={() => { onRename(); setMenuOpen(false); }} style={dropItem}>✏️ Переименовать</button>
                    <div style={{ height: '1px', backgroundColor: '#f1f5f9', margin: '2px 0' }} />
                    <button onClick={() => { onDelete(); setMenuOpen(false); }} style={{ ...dropItem, color: '#ef4444' }}>🗑️ Удалить</button>
                </div>
            )}
            <div style={{ marginBottom: '10px' }}>
                <FolderSVG color={color} />
            </div>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#fff', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)' }}>
                {new Date(folder.createdAt).toLocaleDateString('ru-RU')}
            </div>
        </div>
    );
}

// ─── File Card ─────────────────────────────────────────────────────────────────
function FileCard({ file, onPreview, onDownload, onRename, onDelete }: {
    file: DriveFile; onPreview: () => void;
    onDownload: () => void; onRename: () => void; onDelete: () => void;
}) {
    const [menuOpen, setMenuOpen] = useState(false);
    const ext = getExt(file.name);

    return (
        <div
            onClick={onPreview}
            style={{ backgroundColor: 'rgba(255,255,255,0.13)', backdropFilter: 'blur(12px)', borderRadius: '16px', padding: '16px 14px 12px', cursor: 'pointer', position: 'relative', border: '1px solid rgba(255,255,255,0.18)', transition: 'background 0.15s' }}
        >
            <button
                onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
                style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', fontSize: '16px', lineHeight: 1, padding: '2px 6px', borderRadius: '6px' }}
            >⋮</button>
            {menuOpen && (
                <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: '32px', right: '10px', zIndex: 100, backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', padding: '4px', minWidth: '140px' }}>
                    <button onClick={() => { onPreview(); setMenuOpen(false); }} style={dropItem}>👁️ Просмотр</button>
                    <button onClick={() => { onDownload(); setMenuOpen(false); }} style={dropItem}>⬇️ Скачать</button>
                    <button onClick={() => { onRename(); setMenuOpen(false); }} style={dropItem}>✏️ Переименовать</button>
                    <div style={{ height: '1px', backgroundColor: '#f1f5f9', margin: '2px 0' }} />
                    <button onClick={() => { onDelete(); setMenuOpen(false); }} style={{ ...dropItem, color: '#ef4444' }}>🗑️ Удалить</button>
                </div>
            )}
            <DocIcon ext={ext} mime={file.mimeType} />
            <div style={{ fontSize: '11px', fontWeight: '500', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '3px' }}>{file.name}</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>{fmt(file.size)}</div>
        </div>
    );
}

const dropItem: React.CSSProperties = { display: 'block', width: '100%', padding: '7px 12px', borderRadius: '7px', border: 'none', backgroundColor: 'transparent', textAlign: 'left', fontSize: '13px', cursor: 'pointer', color: '#1e293b' };

// ─── Upload Button ─────────────────────────────────────────────────────────────
function UploadBtn({ onUpload, uploading }: { onUpload: () => void; uploading: boolean }) {
    const [hover, setHover] = useState(false);
    return (
        <button
            onClick={onUpload}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{ width: '100%', padding: '24px 16px', borderRadius: '16px', border: '2px dashed rgba(255,255,255,0.35)', backgroundColor: hover ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}
        >
            <svg width="48" height="40" viewBox="0 0 48 40" fill="none">
                <path d="M36 16C36 9.37 30.63 4 24 4C18.48 4 13.84 7.67 12.36 12.74C8.16 13.29 5 16.88 5 21.2C5 25.9 8.8 29.7 13.5 29.7H34.5C38.64 29.7 42 26.34 42 22.2C42 18.26 39 15.04 35.12 14.64C35.38 15.07 36 15.5 36 16Z" fill="rgba(255,255,255,0.5)"/>
                <path d="M24 18L18 24H22V36H26V24H30L24 18Z" fill="rgba(255,255,255,0.8)"/>
            </svg>
            <span style={{ fontSize: '13px', fontWeight: '600', color: 'rgba(255,255,255,0.8)' }}>
                {uploading ? 'Загрузка...' : 'Upload Your File'}
            </span>
        </button>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function DrivePage() {
    useSetPageTitle('Файловый диск');

    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
    const [folders, setFolders] = useState<DriveFolder[]>([]);
    const [files, setFiles] = useState<DriveFile[]>([]);
    const [path, setPath] = useState<PathItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<{ fileCount: number; totalSize: number; folderCount: number } | null>(null);

    const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
    const [renameTarget, setRenameTarget] = useState<{ type: 'folder' | 'file'; id: string; name: string } | null>(null);
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [search, setSearch] = useState('');

    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadFolder = useCallback(async (folderId?: string | null) => {
        setLoading(true);
        try {
            const res = await apiFetch(`/drive/list${folderId ? `?folderId=${folderId}` : ''}`);
            const data = await res.json();
            setFolders(data.folders || []);
            setFiles(data.files || []);
            setPath(data.path || []);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, []);

    const loadStats = useCallback(async () => {
        const res = await apiFetch('/drive/stats');
        setStats(await res.json());
    }, []);

    useEffect(() => { loadFolder(currentFolderId); loadStats(); }, [currentFolderId, loadFolder, loadStats]);

    // Close dropdowns on outside click
    useEffect(() => {
        const h = () => {};
        document.addEventListener('click', h);
        return () => document.removeEventListener('click', h);
    }, []);

    const uploadFiles = async (list: File[]) => {
        setUploading(true);
        for (const f of list) {
            const fd = new FormData(); fd.append('file', f);
            const url = currentFolderId ? `/drive/upload?folderId=${currentFolderId}` : '/drive/upload';
            await apiFetch(url, { method: 'POST', body: fd });
        }
        setUploading(false);
        await loadFolder(currentFolderId); await loadStats();
    };

    const doRename = async (newName: string) => {
        if (!renameTarget) return;
        if (renameTarget.type === 'folder') {
            await apiFetch(`/drive/folders/${renameTarget.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName }) });
        } else {
            await apiFetch(`/drive/files/${renameTarget.id}/rename`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName }) });
            if (previewFile?.id === renameTarget.id) setPreviewFile(p => p ? { ...p, name: newName } : null);
        }
        setRenameTarget(null);
        await loadFolder(currentFolderId);
    };

    const deleteFolder = async (id: string) => {
        if (!confirm('Удалить папку со всем содержимым?')) return;
        await apiFetch(`/drive/folders/${id}`, { method: 'DELETE' });
        await loadFolder(currentFolderId); await loadStats();
    };

    const deleteFile = async (id: string) => {
        if (!confirm('Удалить файл?')) return;
        await apiFetch(`/drive/files/${id}`, { method: 'DELETE' });
        if (previewFile?.id === id) setPreviewFile(null);
        await loadFolder(currentFolderId); await loadStats();
    };

    const downloadFile = (file: DriveFile) => {
        api.get(`/drive/files/${file.id}/download`, { responseType: 'blob' }).then(res => {
            const url = URL.createObjectURL(res.data);
            const a = document.createElement('a');
            a.href = url; a.download = file.name;
            document.body.appendChild(a); a.click();
            document.body.removeChild(a); URL.revokeObjectURL(url);
        });
    };

    // Filtered by search
    const filteredFolders = folders.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));
    const filteredFiles = files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));

    // Stats breakdown by category
    const mediaSize = files.filter(f => getMimeCategory(f.mimeType, f.name) === 'media').reduce((s, f) => s + f.size, 0);
    const docSize   = files.filter(f => getMimeCategory(f.mimeType, f.name) === 'document').reduce((s, f) => s + f.size, 0);
    const otherSize = files.filter(f => getMimeCategory(f.mimeType, f.name) === 'other').reduce((s, f) => s + f.size, 0);
    const usedSize  = stats?.totalSize ?? 0;
    const usedPct   = Math.min((usedSize / DISK_TOTAL) * 100, 100);

    return (
        <div
            onDrop={e => { e.preventDefault(); setDragOver(false); const l = Array.from(e.dataTransfer.files); if (l.length) uploadFiles(l); }}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            style={{ minHeight: '100vh', padding: '28px 24px', display: 'flex', gap: '20px', alignItems: 'flex-start', boxSizing: 'border-box', outline: dragOver ? '3px dashed rgba(255,255,255,0.6)' : '3px solid transparent', borderRadius: '12px', transition: 'outline 0.2s' }}
        >
            {/* ── Left: main area ── */}
            <div style={{ flex: 1, minWidth: 0 }}>
                {/* Search + breadcrumb */}
                <div style={{ marginBottom: '20px' }}>
                    <div style={{ position: 'relative', marginBottom: '12px' }}>
                        <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.5)', fontSize: '15px' }}>🔍</span>
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search"
                            style={{ width: '100%', maxWidth: '320px', padding: '10px 16px 10px 40px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(12px)', color: '#fff', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                        />
                    </div>
                    {/* Breadcrumb */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                        <button onClick={() => setCurrentFolderId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: currentFolderId ? 'rgba(255,255,255,0.55)' : '#fff', fontWeight: '600', fontSize: '13px', padding: 0 }}>
                            Диск
                        </button>
                        {path.map((item, i) => (
                            <span key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ color: 'rgba(255,255,255,0.4)' }}>›</span>
                                <button onClick={() => setCurrentFolderId(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: i === path.length - 1 ? '#fff' : 'rgba(255,255,255,0.55)', fontWeight: i === path.length - 1 ? '600' : '400', fontSize: '13px', padding: 0 }}>
                                    {item.name}
                                </button>
                            </span>
                        ))}
                    </div>
                </div>

                {loading ? (
                    <div style={{ color: 'rgba(255,255,255,0.5)', padding: '40px 0', textAlign: 'center' }}>Загрузка...</div>
                ) : (
                    <>
                        {/* Folders */}
                        {filteredFolders.length > 0 && (
                            <div style={{ marginBottom: '24px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px' }}>
                                    {filteredFolders.map((f, i) => (
                                        <FolderCard key={f.id} folder={f} color={FOLDER_COLORS[i % FOLDER_COLORS.length]}
                                            onOpen={() => setCurrentFolderId(f.id)}
                                            onRename={() => setRenameTarget({ type: 'folder', id: f.id, name: f.name })}
                                            onDelete={() => deleteFolder(f.id)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Files */}
                        {filteredFiles.length > 0 && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px' }}>
                                {filteredFiles.map(f => (
                                    <FileCard key={f.id} file={f}
                                        onPreview={() => setPreviewFile(f)}
                                        onDownload={() => downloadFile(f)}
                                        onRename={() => setRenameTarget({ type: 'file', id: f.id, name: f.name })}
                                        onDelete={() => deleteFile(f.id)}
                                    />
                                ))}
                            </div>
                        )}

                        {filteredFolders.length === 0 && filteredFiles.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.4)' }}>
                                <div style={{ fontSize: '48px', marginBottom: '12px' }}>📂</div>
                                <div style={{ fontSize: '15px' }}>{search ? 'Ничего не найдено' : 'Папка пуста'}</div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ── Right sidebar ── */}
            <div style={{ width: '185px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Used Space */}
                <div style={{ backgroundColor: 'rgba(255,255,255,0.13)', backdropFilter: 'blur(12px)', borderRadius: '16px', padding: '16px', border: '1px solid rgba(255,255,255,0.18)' }}>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Used Space</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#fff', marginBottom: '2px' }}>{fmtGB(usedSize)}</div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', marginBottom: '10px' }}>/ {fmtGB(DISK_TOTAL)}</div>
                    <div style={{ height: '6px', borderRadius: '3px', backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${usedPct}%`, borderRadius: '3px', background: 'linear-gradient(90deg, #4a7fe8, #7c3aed)', transition: 'width 0.4s ease' }} />
                    </div>
                </div>

                {/* Category breakdown */}
                <div style={{ backgroundColor: 'rgba(255,255,255,0.13)', backdropFilter: 'blur(12px)', borderRadius: '16px', padding: '12px', border: '1px solid rgba(255,255,255,0.18)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[
                        { label: 'Media', size: mediaSize, color: '#f472b6', bg: 'rgba(244,114,182,0.15)' },
                        { label: 'Documents', size: docSize, color: '#4ade80', bg: 'rgba(74,222,128,0.15)' },
                        { label: 'Others', size: otherSize, color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
                    ].map(c => (
                        <div key={c.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderRadius: '10px', backgroundColor: c.bg }}>
                            <span style={{ fontSize: '12px', fontWeight: '600', color: c.color }}>{c.label}</span>
                            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', fontWeight: '500' }}>{fmt(c.size)}</span>
                        </div>
                    ))}
                </div>

                {/* Upload */}
                <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }}
                    onChange={e => { if (e.target.files) uploadFiles(Array.from(e.target.files)); e.target.value = ''; }} />
                <UploadBtn onUpload={() => fileInputRef.current?.click()} uploading={uploading} />

                {/* New folder */}
                <button
                    onClick={() => {
                        const name = prompt('Название папки:');
                        if (!name?.trim()) return;
                        const body: any = { name: name.trim() };
                        if (currentFolderId) body.parentId = currentFolderId;
                        apiFetch('/drive/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
                            .then(() => { loadFolder(currentFolderId); loadStats(); });
                    }}
                    style={{ width: '100%', padding: '10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}
                >
                    + Новая папка
                </button>
            </div>

            {/* Modals */}
            {previewFile && (
                <PreviewModal file={previewFile} onClose={() => setPreviewFile(null)} onDownload={downloadFile}
                    onRename={f => setRenameTarget({ type: 'file', id: f.id, name: f.name })} />
            )}
            {renameTarget && (
                <RenameModal initialName={renameTarget.name} onConfirm={doRename} onCancel={() => setRenameTarget(null)} />
            )}
        </div>
    );
}
