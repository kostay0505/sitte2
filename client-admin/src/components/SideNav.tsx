'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

interface NavItem {
  title: string;
  path: string;
}

interface NavGroup {
  label: string;
  icon: string;
  items: NavItem[];
}

type NavEntry =
  | { type: 'link'; title: string; icon: string; path: string }
  | { type: 'group'; label: string; icon: string; items: NavItem[] };

const navStructure: NavEntry[] = [
  {
    type: 'link',
    title: 'Dashboard',
    icon: '🏠',
    path: '/dashboard',
  },
  {
    type: 'link',
    title: 'CRM',
    icon: '🤝',
    path: '/crm',
  },
  {
    type: 'group',
    label: 'Сайт',
    icon: '🌐',
    items: [
      { title: 'Аккаунты',       path: '/accounts' },
      { title: 'Пользователи',   path: '/users' },
      { title: 'Категории',      path: '/categories' },
      { title: 'Товары',         path: '/products' },
      { title: 'Резюме',         path: '/resumes' },
      { title: 'Вакансии',       path: '/vacancies' },
      { title: 'Подписки',       path: '/newsletter-subscriptions' },
      { title: 'Контент сайта',  path: '/site-content' },
      { title: 'Поддержка',      path: '/support' },
    ],
  },
  {
    type: 'group',
    label: 'Блог',
    icon: '✍️',
    items: [
      { title: 'Статьи',            path: '/articles' },
      { title: 'Категории статей',  path: '/article-categories' },
    ],
  },
  {
    type: 'group',
    label: 'База данных',
    icon: '🗄️',
    items: [
      { title: 'Объявления', path: '/listings' },
      { title: 'Бренды',   path: '/brands' },
      { title: 'Города',   path: '/cities' },
      { title: 'Страны',   path: '/countries' },
    ],
  },
  {
    type: 'link',
    title: 'Документы',
    icon: '📄',
    path: '/documents',
  },
  {
    type: 'link',
    title: 'Таблицы',
    icon: '📊',
    path: '/tables',
  },
  {
    type: 'link',
    title: 'Почта',
    icon: '✉️',
    path: '/mail',
  },
  {
    type: 'group',
    label: 'Парсинг',
    icon: '🔄',
    items: [
      { title: 'Arrius',      path: '/parsing/arrius' },
      { title: 'Gebraucht',   path: '/parsing/gebraucht' },
      { title: 'AVL France',  path: '/parsing/avl-france' },
      { title: 'UsedFull',    path: '/parsing/usedfull' },
      { title: 'CueSale',     path: '/parsing/cuesale' },
      { title: 'PA Audio',    path: '/parsing/pa-audio' },
      { title: 'GearWise',    path: '/parsing/gearwise' },
      { title: 'AVLS',        path: '/parsing/avls' },
    ],
  },
  {
    type: 'link',
    title: 'Диск',
    icon: '💾',
    path: '/drive',
  },
];

interface SideNavProps {
  isMobile?: boolean;
  onClose?: () => void;
}

export const SideNav = ({ isMobile = false, onClose }: SideNavProps) => {
  const pathname = usePathname();

  // Determine which group contains the current path
  const activeGroupLabel = (() => {
    for (const entry of navStructure) {
      if (entry.type === 'group') {
        if (entry.items.some(item => item.path === pathname)) return entry.label;
      }
    }
    return null;
  })();

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (activeGroupLabel) initial.add(activeGroupLabel);
    return initial;
  });

  // Open the active group when pathname changes
  useEffect(() => {
    if (activeGroupLabel) {
      setOpenGroups(prev => {
        if (prev.has(activeGroupLabel)) return prev;
        const next = new Set(prev);
        next.add(activeGroupLabel);
        return next;
      });
    }
  }, [activeGroupLabel]);

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const linkStyle = (isActive: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '9px 20px',
    textDecoration: 'none',
    fontSize: '13px',
    fontWeight: isActive ? '600' : '400',
    color: isActive ? '#1e293b' : '#475569',
    backgroundColor: isActive ? 'rgba(255,255,255,0.6)' : 'transparent',
    borderLeft: isActive ? '3px solid #334155' : '3px solid transparent',
    borderRadius: isActive ? '0 10px 10px 0' : '0',
    transition: 'all 0.15s ease',
    marginRight: '12px',
    cursor: 'pointer',
  });

  const subLinkStyle = (isActive: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 20px 7px 36px',
    textDecoration: 'none',
    fontSize: '12.5px',
    fontWeight: isActive ? '600' : '400',
    color: isActive ? '#1e293b' : '#64748b',
    backgroundColor: isActive ? 'rgba(255,255,255,0.55)' : 'transparent',
    borderLeft: isActive ? '3px solid #64748b' : '3px solid transparent',
    borderRadius: isActive ? '0 8px 8px 0' : '0',
    transition: 'all 0.12s ease',
    marginRight: '12px',
    cursor: 'pointer',
  });

  const groupHeaderStyle = (isOpen: boolean, hasActive: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '9px 20px',
    fontSize: '13px',
    fontWeight: hasActive ? '600' : '500',
    color: hasActive ? '#1e293b' : '#374151',
    backgroundColor: hasActive ? 'rgba(255,255,255,0.25)' : 'transparent',
    borderLeft: hasActive ? '3px solid #94a3b8' : '3px solid transparent',
    borderRadius: hasActive ? '0 10px 10px 0' : '0',
    marginRight: '12px',
    cursor: 'pointer',
    border: 'none',
    width: 'calc(100% - 12px)',
    textAlign: 'left',
    transition: 'all 0.15s ease',
  });

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      padding: '24px 0',
      overflowY: 'auto',
    }}>
      {isMobile && (
        <button onClick={onClose} style={{
          position: 'absolute', top: '16px', right: '16px',
          background: 'none', border: 'none', fontSize: '24px',
          cursor: 'pointer', color: '#374151',
        }}>×</button>
      )}

      {/* Logo */}
      <div style={{ padding: '0 20px', marginBottom: '28px' }}>
        <div style={{
          fontSize: '13px',
          fontWeight: '800',
          letterSpacing: '0.08em',
          color: '#1e293b',
          textTransform: 'uppercase',
          lineHeight: 1.2,
        }}>
          Touring<br />Expert
        </div>
        <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', letterSpacing: '0.05em' }}>
          Admin Panel
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1 }}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {navStructure.map((entry, idx) => {
            if (entry.type === 'link') {
              const isActive = pathname === entry.path;
              return (
                <li key={entry.path}>
                  <Link href={entry.path} style={linkStyle(isActive)} onClick={isMobile ? onClose : undefined}>
                    <span>{entry.icon}</span>
                    <span>{entry.title}</span>
                  </Link>
                </li>
              );
            }

            // Group
            const isOpen = openGroups.has(entry.label);
            const hasActive = entry.items.some(item => item.path === pathname);

            return (
              <li key={entry.label} style={{ marginBottom: '2px' }}>
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(entry.label)}
                  style={groupHeaderStyle(isOpen, hasActive)}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{entry.icon}</span>
                    <span>{entry.label}</span>
                  </span>
                  <span style={{
                    fontSize: '10px',
                    color: '#94a3b8',
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                    display: 'inline-block',
                  }}>▼</span>
                </button>

                {/* Sub-items */}
                <div style={{
                  maxHeight: isOpen ? `${entry.items.length * 40}px` : '0',
                  overflow: 'hidden',
                  transition: 'max-height 0.25s ease',
                }}>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {entry.items.map(item => {
                      const isActive = pathname === item.path;
                      return (
                        <li key={item.path}>
                          <Link
                            href={item.path}
                            style={subLinkStyle(isActive)}
                            onClick={isMobile ? onClose : undefined}
                          >
                            <span style={{
                              width: '4px',
                              height: '4px',
                              borderRadius: '50%',
                              backgroundColor: isActive ? '#334155' : '#cbd5e1',
                              flexShrink: 0,
                            }} />
                            {item.title}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
};
