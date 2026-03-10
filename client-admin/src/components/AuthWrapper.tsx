'use client';

import { PropsWithChildren, useEffect, useState, createContext, useContext } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { SideNav } from './SideNav';
import { adminLogout } from '../api/auth/methods';
import { Button } from '@/components/ui/Button/Button';

const PUBLIC_ROUTES = ['/login'];

interface PageTitleContextType {
    pageTitle: string;
    setPageTitle: (title: string) => void;
}

const PageTitleContext = createContext<PageTitleContextType | undefined>(undefined);

export const usePageTitle = () => {
    const context = useContext(PageTitleContext);
    if (!context) throw new Error('usePageTitle должен использоваться внутри AuthWrapper');
    return context;
};

const sidebarCard: React.CSSProperties = {
    backgroundColor: '#ffffff',
    borderRadius: '20px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
    border: '1px solid rgba(255,255,255,0.9)',
};

const glassCard: React.CSSProperties = {
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    borderRadius: '20px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18)',
    border: '1px solid rgba(255,255,255,0.5)',
};

const bgStyle: React.CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    padding: '16px',
    gap: '16px',
    boxSizing: 'border-box',
};

export function AuthWrapper({ children }: PropsWithChildren) {
    const pathname = usePathname();
    const router = useRouter();
    const { isAuthenticated, loading } = useAdminAuth();
    const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
    const [pageTitle, setPageTitle] = useState('Административная панель');

    const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

    useEffect(() => {
        if (!loading && !isPublicRoute && isAuthenticated === false) {
            router.push('/login');
        }
    }, [loading, isPublicRoute, isAuthenticated, router]);

    if (loading) {
        return (
            <div style={{ ...bgStyle, alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ ...glassCard, padding: '32px 48px', fontSize: '15px', color: '#475569' }}>
                    Проверка авторизации...
                </div>
            </div>
        );
    }

    if (isPublicRoute) {
        return <>{children}</>;
    }

    if (!isAuthenticated) {
        return (
            <div style={{ ...bgStyle, alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ ...glassCard, padding: '32px 48px', fontSize: '15px', color: '#475569' }}>
                    Перенаправление на страницу входа...
                </div>
            </div>
        );
    }

    const handleLogout = async () => {
        try { await adminLogout(); } catch {}
        router.push('/login');
    };

    const sidebarHeight = 'calc(100vh - 32px)';

    return (
        <PageTitleContext.Provider value={{ pageTitle, setPageTitle }}>
            <div style={bgStyle}>
                {/* Sidebar */}
                <div className="desktop-sidenav" style={{
                    ...sidebarCard,
                    width: '230px',
                    flexShrink: 0,
                    height: sidebarHeight,
                    position: 'sticky',
                    top: 0,
                    overflowY: 'auto',
                }}>
                    <SideNav />
                </div>

                {/* Main area */}
                <main style={{
                    ...glassCard,
                    flex: 1,
                    height: sidebarHeight,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: 0,
                }}>
                    {/* Top bar */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '18px 24px',
                        borderBottom: '1px solid rgba(0,0,0,0.07)',
                        flexShrink: 0,
                    }}>
                        {/* Mobile burger */}
                        <button
                            className="mobile-toggle"
                            onClick={() => setIsMobileNavOpen(true)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'none' }}
                        >
                            <div style={{ width: '22px', height: '2px', background: '#374151', margin: '4px 0' }} />
                            <div style={{ width: '22px', height: '2px', background: '#374151', margin: '4px 0' }} />
                            <div style={{ width: '22px', height: '2px', background: '#374151', margin: '4px 0' }} />
                        </button>

                        <h1 style={{
                            margin: 0,
                            fontSize: '17px',
                            fontWeight: '600',
                            color: '#1e293b',
                        }}>
                            {pageTitle}
                        </h1>
                        <Button variant="danger" onClick={handleLogout}>
                            Выйти
                        </Button>
                    </div>

                    {/* Page content */}
                    <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
                        {children}
                    </div>
                </main>

                {/* Mobile overlay */}
                {isMobileNavOpen && (
                    <>
                        <div
                            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000 }}
                            onClick={() => setIsMobileNavOpen(false)}
                        />
                        <div style={{
                            ...sidebarCard,
                            position: 'fixed',
                            top: '16px',
                            left: '16px',
                            bottom: '16px',
                            width: '230px',
                            zIndex: 1001,
                            overflowY: 'auto',
                        }}>
                            <SideNav isMobile onClose={() => setIsMobileNavOpen(false)} />
                        </div>
                    </>
                )}
            </div>
        </PageTitleContext.Provider>
    );
}
