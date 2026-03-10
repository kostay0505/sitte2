'use client';
import { useEffect } from 'react';
import { usePageTitle } from '@/components/AuthWrapper';

export default function ParserPage() {
  const { setPageTitle } = usePageTitle();
  useEffect(() => { setPageTitle('Парсинг — Pa Audio'); }, [setPageTitle]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: '#94a3b8', gap: '16px' }}>
      <div style={{ fontSize: '48px' }}>🔄</div>
      <div style={{ fontSize: '20px', fontWeight: '600', color: '#475569' }}>Pa Audio</div>
      <div style={{ fontSize: '14px' }}>Парсер в разработке</div>
    </div>
  );
}
