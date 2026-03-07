'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Plus, GripVertical, Pencil, Trash2, Check, ChevronLeft,
  Type, ImageIcon, Store, Images, Phone, AlignLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/utils/cn';
import { getMyBusinessPage, upsertBusinessPage } from '@/api/business-page/methods';
import { uploadFile } from '@/api/files/methods';
import { toImageSrc } from '@/utils/toImageSrc';
import { useCategoryFilterOptions } from '@/features/category/hooks';
import type {
  Block, BlockType, BusinessPage,
  TextBannerBlock, PhotoLeftBlock, PhotoRightBlock,
  ShowcaseBlock, PhotoCarouselBlock, ContactsBlock,
  BLOCK_TYPE_META,
} from '@/api/business-page/types';
import { BLOCK_TYPE_META as META } from '@/api/business-page/types';

// ─── helpers ─────────────────────────────────────────────────────────────────

function newBlock(type: BlockType): Block {
  const id = crypto.randomUUID();
  switch (type) {
    case 'text_banner': return { id, type, title: '', text: '' };
    case 'photo_left': return { id, type, title: '', text: '', photoUrl: '' };
    case 'photo_right': return { id, type, title: '', text: '', photoUrl: '' };
    case 'showcase': return { id, type, title: '', categoryId: null };
    case 'photo_carousel': return { id, type, title: '', items: [] };
    case 'contacts': return { id, type, phone: '', email: '', address: '' };
  }
}

const BLOCK_ICONS: Record<BlockType, React.ReactNode> = {
  text_banner: <Type className='w-6 h-6' />,
  photo_left: <ImageIcon className='w-6 h-6' />,
  photo_right: <ImageIcon className='w-6 h-6' />,
  showcase: <Store className='w-6 h-6' />,
  photo_carousel: <Images className='w-6 h-6' />,
  contacts: <Phone className='w-6 h-6' />,
};

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type View = 'list' | 'picker' | 'edit';

export function BusinessPageEditor({ isOpen, onClose }: Props) {
  const [page, setPage] = useState<BusinessPage | null>(null);
  const [slug, setSlug] = useState('');
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [view, setView] = useState<View>('list');
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [slugError, setSlugError] = useState('');

  // DnD
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    getMyBusinessPage()
      .then(p => {
        if (p) {
          setPage(p);
          setSlug(p.slug);
          setBlocks(p.blocks ?? []);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [isOpen]);

  const handleSlugChange = (v: string) => {
    const clean = v.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    setSlug(clean);
    if (clean.length > 0 && clean.length < 3) setSlugError('Минимум 3 символа');
    else setSlugError('');
  };

  const handleSave = async () => {
    if (!slug || slug.length < 3) { toast.error('Введите адрес страницы (минимум 3 символа)'); return; }
    setIsSaving(true);
    try {
      const saved = await upsertBusinessPage(slug, blocks);
      setPage(saved);
      toast.success('Страница сохранена');
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? e?.message ?? 'Ошибка сохранения');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddBlock = (type: BlockType) => {
    const block = newBlock(type);
    setBlocks(prev => [...prev, block]);
    setEditingBlock(block);
    setView('edit');
  };

  const handleEditBlock = (block: Block) => {
    setEditingBlock({ ...block });
    setView('edit');
  };

  const handleSaveBlock = (updated: Block) => {
    setBlocks(prev => prev.map(b => (b.id === updated.id ? updated : b)));
    setEditingBlock(null);
    setView('list');
  };

  const handleDeleteBlock = (id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
  };

  // DnD
  const reorder = useCallback((from: number, to: number) => {
    setBlocks(prev => {
      const arr = [...prev];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr;
    });
  }, []);

  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 z-[200] flex items-center justify-center bg-black/50'>
      <div className='bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col mx-4 overflow-hidden'>

        {/* Header */}
        <div className='flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0'>
          <div className='flex items-center gap-3'>
            {view !== 'list' && (
              <button
                onClick={() => { setView('list'); setEditingBlock(null); }}
                className='p-1 rounded-lg hover:bg-gray-100 transition'
              >
                <ChevronLeft className='w-5 h-5 text-gray-500' />
              </button>
            )}
            <h2 className='text-base font-semibold text-gray-900'>
              {view === 'list' ? 'Редактор бизнес-страницы'
                : view === 'picker' ? 'Добавить блок'
                  : 'Редактировать блок'}
            </h2>
          </div>
          <button onClick={onClose} className='p-2 rounded-xl hover:bg-gray-100 transition'>
            <X className='w-5 h-5 text-gray-500' />
          </button>
        </div>

        {/* Body */}
        <div className='flex-1 overflow-y-auto'>
          {isLoading ? (
            <div className='flex items-center justify-center py-20'>
              <div className='w-8 h-8 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin' />
            </div>
          ) : view === 'list' ? (
            <ListView
              slug={slug}
              slugError={slugError}
              onSlugChange={handleSlugChange}
              blocks={blocks}
              onAddBlock={() => setView('picker')}
              onEditBlock={handleEditBlock}
              onDeleteBlock={handleDeleteBlock}
              dragIndex={dragIndex}
              overIndex={overIndex}
              onDragStart={setDragIndex}
              onDragOver={(i) => { setOverIndex(i); if (dragIndex !== null && dragIndex !== i) reorder(dragIndex, i); setDragIndex(i); }}
              onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
            />
          ) : view === 'picker' ? (
            <BlockPicker onSelect={handleAddBlock} />
          ) : editingBlock ? (
            <BlockEditForm
              block={editingBlock}
              onSave={handleSaveBlock}
              onCancel={() => { setView('list'); setEditingBlock(null); }}
            />
          ) : null}
        </div>

        {/* Footer — save */}
        {view === 'list' && (
          <div className='flex items-center justify-between px-6 py-4 border-t border-gray-100 flex-shrink-0'>
            {page?.slug ? (
              <a
                href={`/shop/${page.slug}`}
                target='_blank'
                rel='noopener noreferrer'
                className='text-xs text-blue-600 hover:underline truncate max-w-[60%]'
              >
                /shop/{page.slug}
              </a>
            ) : <span />}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className='px-6 py-2 bg-black text-white text-sm rounded-xl hover:bg-gray-800 disabled:opacity-50 transition'
            >
              {isSaving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── List view ────────────────────────────────────────────────────────────────

function ListView({
  slug, slugError, onSlugChange, blocks,
  onAddBlock, onEditBlock, onDeleteBlock,
  dragIndex, overIndex, onDragStart, onDragOver, onDragEnd,
}: {
  slug: string; slugError: string; onSlugChange: (v: string) => void;
  blocks: Block[];
  onAddBlock: () => void;
  onEditBlock: (b: Block) => void;
  onDeleteBlock: (id: string) => void;
  dragIndex: number | null; overIndex: number | null;
  onDragStart: (i: number) => void;
  onDragOver: (i: number) => void;
  onDragEnd: () => void;
}) {
  return (
    <div className='p-6 space-y-6'>
      {/* Slug */}
      <div>
        <label className='block text-xs font-medium text-gray-500 mb-1'>Адрес страницы</label>
        <div className='flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:border-gray-400 transition'>
          <span className='px-3 py-2.5 text-sm text-gray-400 bg-gray-50 border-r border-gray-200 whitespace-nowrap'>/shop/</span>
          <input
            type='text'
            value={slug}
            onChange={e => onSlugChange(e.target.value)}
            placeholder='my-company'
            className='flex-1 px-3 py-2.5 text-sm outline-none bg-white'
          />
        </div>
        {slugError && <p className='text-xs text-red-500 mt-1'>{slugError}</p>}
        <p className='text-xs text-gray-400 mt-1'>Только строчные буквы a-z, цифры, дефис, подчёркивание</p>
      </div>

      {/* Blocks */}
      <div>
        <p className='text-xs font-medium text-gray-500 mb-3'>Блоки страницы</p>
        {blocks.length === 0 ? (
          <div className='text-center py-8 text-gray-400 text-sm'>Блоков пока нет</div>
        ) : (
          <div className='space-y-2'>
            {blocks.map((block, i) => (
              <div
                key={block.id}
                draggable
                onDragStart={() => onDragStart(i)}
                onDragOver={e => { e.preventDefault(); onDragOver(i); }}
                onDragEnd={onDragEnd}
                className={cn(
                  'flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 transition',
                  dragIndex === i && 'opacity-40',
                  overIndex === i && dragIndex !== i && 'border-gray-900 bg-gray-100',
                )}
              >
                <GripVertical className='w-4 h-4 text-gray-400 cursor-grab flex-shrink-0' />
                <div className='text-gray-400 flex-shrink-0'>{BLOCK_ICONS[block.type]}</div>
                <div className='flex-1 min-w-0'>
                  <p className='text-sm font-medium text-gray-800 truncate'>{META[block.type].label}</p>
                  {(block as any).title && (
                    <p className='text-xs text-gray-400 truncate'>{(block as any).title}</p>
                  )}
                </div>
                <button onClick={() => onEditBlock(block)} className='p-1.5 rounded-lg hover:bg-white transition flex-shrink-0'>
                  <Pencil className='w-4 h-4 text-gray-400' />
                </button>
                <button onClick={() => onDeleteBlock(block.id)} className='p-1.5 rounded-lg hover:bg-white transition flex-shrink-0'>
                  <Trash2 className='w-4 h-4 text-red-400' />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add button */}
      <button
        onClick={onAddBlock}
        className='w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 transition'
      >
        <Plus className='w-4 h-4' />
        Добавить блок
      </button>
    </div>
  );
}

// ─── Block picker ─────────────────────────────────────────────────────────────

function BlockPicker({ onSelect }: { onSelect: (type: BlockType) => void }) {
  const types: BlockType[] = ['text_banner', 'photo_left', 'photo_right', 'showcase', 'photo_carousel', 'contacts'];
  return (
    <div className='p-6'>
      <p className='text-sm text-gray-500 mb-4'>Выберите тип блока</p>
      <div className='grid grid-cols-2 gap-3'>
        {types.map(type => (
          <button
            key={type}
            onClick={() => onSelect(type)}
            className='flex flex-col items-start gap-2 p-4 bg-gray-50 border border-gray-200 rounded-xl hover:border-gray-400 hover:bg-white transition text-left'
          >
            <div className='text-gray-600'>{BLOCK_ICONS[type]}</div>
            <div>
              <p className='text-sm font-medium text-gray-800'>{META[type].label}</p>
              <p className='text-xs text-gray-400 mt-0.5'>{META[type].description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Block edit form ──────────────────────────────────────────────────────────

function BlockEditForm({
  block, onSave, onCancel,
}: {
  block: Block;
  onSave: (b: Block) => void;
  onCancel: () => void;
}) {
  const [local, setLocal] = useState<Block>({ ...block });
  const { all: categories } = useCategoryFilterOptions();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const carouselRef = useRef<HTMLInputElement>(null);

  const set = (key: string, value: any) => setLocal(prev => ({ ...prev, [key]: value } as any));

  const handlePhotoUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { filename } = await uploadFile(fd);
      set('photoUrl', filename);
    } catch {
      toast.error('Ошибка загрузки фото');
    } finally {
      setUploading(false);
    }
  };

  const handleCarouselUpload = async (files: FileList) => {
    const carousel = local as PhotoCarouselBlock;
    if (carousel.items.length + files.length > 12) {
      toast.error('Максимум 12 элементов'); return;
    }
    setUploading(true);
    try {
      const VIDEO_EXT = /\.(mp4|webm|ogg|mov|avi|mkv)$/i;
      const newItems: PhotoCarouselBlock['items'] = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        const { filename } = await uploadFile(fd);
        newItems.push({ url: filename, mediaType: VIDEO_EXT.test(file.name) ? 'video' : 'image' });
      }
      set('items', [...carousel.items, ...newItems]);
    } catch {
      toast.error('Ошибка загрузки');
    } finally {
      setUploading(false);
    }
  };

  const removeCarouselItem = (idx: number) => {
    const carousel = local as PhotoCarouselBlock;
    set('items', carousel.items.filter((_, i) => i !== idx));
  };

  return (
    <div className='p-6 space-y-4'>
      <p className='text-xs font-medium text-gray-500'>{META[block.type].label}</p>

      {/* title for most blocks */}
      {block.type !== 'contacts' && (
        <Field label='Заголовок'>
          <input
            type='text'
            value={(local as any).title ?? ''}
            onChange={e => set('title', e.target.value)}
            placeholder='Введите заголовок...'
            className='w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-gray-400 transition'
          />
        </Field>
      )}

      {/* text for banners */}
      {(block.type === 'text_banner' || block.type === 'photo_left' || block.type === 'photo_right') && (
        <Field label='Текст'>
          <textarea
            value={(local as any).text ?? ''}
            onChange={e => set('text', e.target.value)}
            placeholder='Введите текст...'
            rows={4}
            className='w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-gray-400 transition resize-none'
          />
        </Field>
      )}

      {/* photo for photo_left / photo_right */}
      {(block.type === 'photo_left' || block.type === 'photo_right') && (
        <Field label='Фотография'>
          <input ref={fileRef} type='file' accept='image/*' className='hidden'
            onChange={e => e.target.files?.[0] && handlePhotoUpload(e.target.files[0])} />
          {(local as PhotoLeftBlock).photoUrl ? (
            <div className='relative inline-block'>
              <img src={toImageSrc((local as PhotoLeftBlock).photoUrl)} alt='' className='h-32 w-auto rounded-xl object-cover border border-gray-200' />
              <button onClick={() => set('photoUrl', '')} className='absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs'>
                <X className='w-3 h-3' />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className='w-full h-28 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-gray-400 transition text-sm'
            >
              <ImageIcon className='w-6 h-6' />
              {uploading ? 'Загрузка...' : 'Нажмите для загрузки фото'}
            </button>
          )}
        </Field>
      )}

      {/* category for showcase */}
      {block.type === 'showcase' && (
        <Field label='Категория (оставьте пустым — все товары)'>
          <select
            value={(local as ShowcaseBlock).categoryId ?? ''}
            onChange={e => set('categoryId', e.target.value || null)}
            className='w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-gray-400 transition bg-white'
          >
            <option value=''>Все товары</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.parentId ? `  └ ${c.name}` : c.name}</option>
            ))}
          </select>
        </Field>
      )}

      {/* items for photo_carousel */}
      {block.type === 'photo_carousel' && (
        <Field label={`Медиафайлы (${(local as PhotoCarouselBlock).items.length}/12)`}>
          <input ref={carouselRef} type='file' accept='image/*,video/*' multiple className='hidden'
            onChange={e => e.target.files && handleCarouselUpload(e.target.files)} />
          <div className='grid grid-cols-4 gap-2'>
            {(local as PhotoCarouselBlock).items.map((item, idx) => (
              <div key={idx} className='relative aspect-square bg-gray-100 rounded-lg overflow-hidden'>
                {item.mediaType === 'video'
                  ? <video src={toImageSrc(item.url)} className='w-full h-full object-cover' />
                  : <img src={toImageSrc(item.url)} alt='' className='w-full h-full object-cover' />}
                <button
                  onClick={() => removeCarouselItem(idx)}
                  className='absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center'
                >
                  <X className='w-3 h-3' />
                </button>
              </div>
            ))}
            {(local as PhotoCarouselBlock).items.length < 12 && (
              <button
                onClick={() => carouselRef.current?.click()}
                disabled={uploading}
                className='aspect-square border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center text-gray-400 hover:border-gray-400 transition'
              >
                {uploading ? <div className='w-4 h-4 border border-gray-400 border-t-transparent rounded-full animate-spin' /> : <Plus className='w-5 h-5' />}
              </button>
            )}
          </div>
        </Field>
      )}

      {/* contacts fields */}
      {block.type === 'contacts' && (
        <>
          <Field label='Телефон'>
            <input type='tel' value={(local as ContactsBlock).phone} onChange={e => set('phone', e.target.value)}
              placeholder='+7 (999) 000-00-00'
              className='w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-gray-400 transition' />
          </Field>
          <Field label='Email'>
            <input type='email' value={(local as ContactsBlock).email} onChange={e => set('email', e.target.value)}
              placeholder='info@company.ru'
              className='w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-gray-400 transition' />
          </Field>
          <Field label='Адрес'>
            <input type='text' value={(local as ContactsBlock).address} onChange={e => set('address', e.target.value)}
              placeholder='г. Москва, ул. Примерная, 1'
              className='w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-gray-400 transition' />
          </Field>
        </>
      )}

      <div className='flex gap-3 pt-2'>
        <button
          onClick={onCancel}
          className='flex-1 py-2.5 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 transition'
        >
          Отмена
        </button>
        <button
          onClick={() => onSave(local)}
          className='flex-1 py-2.5 text-sm bg-black text-white rounded-xl hover:bg-gray-800 transition'
        >
          Готово
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='space-y-1.5'>
      <label className='block text-xs font-medium text-gray-500'>{label}</label>
      {children}
    </div>
  );
}
