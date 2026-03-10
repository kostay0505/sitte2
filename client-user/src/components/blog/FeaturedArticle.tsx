'use client';

import React from 'react';
import Link from 'next/link';
import { ArticleItem } from '@/api/articles/types';
import { toImageSrc } from '@/utils/toImageSrc';

interface FeaturedArticleProps {
  article: ArticleItem;
  sectionPath: string;
}

export const FeaturedArticle: React.FC<FeaturedArticleProps> = ({ article, sectionPath }) => {
  const href = `${sectionPath}/${article.slug}`;

  return (
    <div className='flex flex-col md:flex-row gap-0 mb-10'>
      {/* Image */}
      <Link href={href} className='block md:w-[58%] aspect-[4/3] md:aspect-auto md:min-h-[320px] bg-gray-200 overflow-hidden flex-shrink-0'>
        {article.coverImage ? (
          <img
            src={toImageSrc(article.coverImage)}
            alt={article.title}
            className='w-full h-full object-cover hover:scale-105 transition-transform duration-300'
          />
        ) : (
          <div className='w-full h-full bg-gray-200' />
        )}
      </Link>

      {/* Info */}
      <div className='md:w-[42%] p-6 md:p-10 flex flex-col justify-center bg-white'>
        {article.categoryName && (
          <p className='text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3'>
            {article.categoryName}
          </p>
        )}
        <Link href={href}>
          <h2 className='text-2xl md:text-3xl font-medium text-gray-900 leading-snug mb-4 hover:underline'>
            {article.title}
          </h2>
        </Link>
        {article.excerpt && (
          <p className='text-sm text-gray-500 mb-6 line-clamp-3'>{article.excerpt}</p>
        )}
        <Link
          href={href}
          className='inline-block border border-gray-300 text-sm px-5 py-2 text-gray-700 hover:bg-gray-50 transition w-fit'
        >
          Read article
        </Link>
      </div>
    </div>
  );
};
