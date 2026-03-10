'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArticleCard } from './ArticleCard';
import { FeaturedArticle } from './FeaturedArticle';
import { getArticleCategories, getArticles, getFeaturedArticle } from '@/api/articles/methods';
import { ArticleSection } from '@/api/articles/types';

interface BlogPageClientProps {
  section: ArticleSection;
  title: string;
  sectionPath: string;
}

export const BlogPageClient: React.FC<BlogPageClientProps> = ({ section, title, sectionPath }) => {
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data: categories = [] } = useQuery({
    queryKey: ['articleCategories', section],
    queryFn: () => getArticleCategories(section),
    staleTime: 5 * 60 * 1000,
  });

  const { data: featured } = useQuery({
    queryKey: ['featuredArticle', section],
    queryFn: () => getFeaturedArticle(section),
    staleTime: 5 * 60 * 1000,
  });

  const { data: articlesData, isFetching } = useQuery({
    queryKey: ['articles', section, activeCategoryId, search, page],
    queryFn: () => getArticles({
      section,
      categoryId: activeCategoryId ?? undefined,
      search: search || undefined,
      page,
      limit: 9,
    }),
    staleTime: 2 * 60 * 1000,
  });

  const articles = articlesData?.items ?? [];
  const total = articlesData?.total ?? 0;
  const totalPages = Math.ceil(total / 9);

  const handleCategoryChange = (id: string | null) => {
    setActiveCategoryId(id);
    setPage(1);
  };

  return (
    <div className='max-w-[1200px] mx-auto px-6 pt-16 pb-10'>
      {/* Header */}
      <div className='flex flex-col md:flex-row md:items-center gap-4 mb-8'>
        <h1 className='text-3xl md:text-4xl font-medium text-gray-900 flex-shrink-0'>{title}</h1>
        <div className='flex items-center gap-6 md:ml-8'>
          <button
            onClick={() => { setActiveCategoryId(null); setPage(1); setSearch(''); }}
            className='text-sm font-medium text-gray-900 hover:underline'
          >
            Home
          </button>
          <button
            onClick={() => { setActiveCategoryId(null); setPage(1); }}
            className='text-sm text-gray-500 hover:text-gray-900 hover:underline'
          >
            News & Guides
          </button>
        </div>
        {/* Search */}
        <div className='md:ml-auto flex items-center border border-gray-300 px-3 py-1.5 gap-2 bg-white'>
          <svg className='w-4 h-4 text-gray-400' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' />
          </svg>
          <input
            type='text'
            placeholder='Search'
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className='text-sm outline-none w-40 bg-transparent placeholder-gray-400'
          />
        </div>
      </div>

      {/* Featured */}
      {featured && !activeCategoryId && !search && page === 1 && (
        <FeaturedArticle article={featured} sectionPath={sectionPath} />
      )}

      {/* Category tabs */}
      <div className='flex items-center gap-6 border-b border-gray-200 mb-8 flex-wrap'>
        <button
          onClick={() => handleCategoryChange(null)}
          className={[
            'pb-3 text-sm whitespace-nowrap flex-shrink-0 transition-colors',
            !activeCategoryId ? 'font-semibold text-gray-900 border-b-2 border-gray-900 -mb-px' : 'text-gray-500 hover:text-gray-700',
          ].join(' ')}
        >
          All posts
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => handleCategoryChange(cat.id)}
            className={[
              'pb-3 text-sm whitespace-nowrap flex-shrink-0 transition-colors',
              activeCategoryId === cat.id ? 'font-semibold text-gray-900 border-b-2 border-gray-900 -mb-px' : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Article grid */}
      {isFetching ? (
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8'>
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className='animate-pulse'>
              <div className='aspect-[4/3] bg-gray-200 mb-3' />
              <div className='h-3 bg-gray-200 rounded w-1/3 mb-2' />
              <div className='h-4 bg-gray-200 rounded w-3/4 mb-1' />
              <div className='h-4 bg-gray-200 rounded w-1/2' />
            </div>
          ))}
        </div>
      ) : articles.length > 0 ? (
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8'>
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} sectionPath={sectionPath} />
          ))}
        </div>
      ) : (
        <div className='text-center py-16 text-gray-400 text-sm'>
          Статей пока нет
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className='flex items-center justify-center gap-2 mt-12'>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className='px-4 py-2 text-sm border border-gray-200 disabled:opacity-40 hover:bg-gray-50'
          >
            ←
          </button>
          {Array.from({ length: totalPages }).map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i + 1)}
              className={[
                'w-9 h-9 text-sm border',
                page === i + 1 ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 hover:bg-gray-50',
              ].join(' ')}
            >
              {i + 1}
            </button>
          ))}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className='px-4 py-2 text-sm border border-gray-200 disabled:opacity-40 hover:bg-gray-50'
          >
            →
          </button>
        </div>
      )}
    </div>
  );
};
