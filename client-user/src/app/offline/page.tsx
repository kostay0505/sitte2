import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Нет соединения',
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 24,
        textAlign: 'center',
        color: '#1a1a1a',
        background: '#ffffff',
        minHeight: '60vh',
      }}
    >
      <div style={{ fontSize: 48 }}>📡</div>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Нет соединения</h1>
      <p style={{ fontSize: 15, color: '#555', maxWidth: 320 }}>
        Проверьте подключение к интернету и попробуйте ещё раз.
      </p>
      <a
        href='/'
        style={{
          marginTop: 8,
          padding: '10px 24px',
          borderRadius: 8,
          background: '#1a1a1a',
          color: '#fff',
          textDecoration: 'none',
          fontSize: 15,
        }}
      >
        Повторить
      </a>
    </div>
  );
}
