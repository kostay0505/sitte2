'use client';

import { useEffect, useState } from 'react';
import { usePageTitle } from '@/components/AuthWrapper';
import { api } from '@/api/api';

// --- Types ---
interface OverallStats {
  completed: number;
  lost: number;
  leads: number;
  negotiation: number;
  agreed: number;
  paid: number;
  totalUsers: number;
  totalProducts: number;
}
interface DayView { day: string; views: number; }
interface Task { id: string; text: string; completed: number; createdAt: string; }
interface Notification { type: string; title: string; createdAt: string; }
interface Lead {
  id: string;
  title: string | null;
  stage: string;
  amount: number | null;
  currency: string;
  buyerFirstName: string | null;
  buyerUsername: string | null;
  buyerPhoto: string | null;
  productName: string | null;
  productPreview: string | null;
  updatedAt: string;
}

// --- Helpers ---
const DAYS_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function buildWeekData(rows: DayView[]) {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    const dayStr = d.toISOString().split('T')[0];
    const found = rows.find(r => String(r.day).startsWith(dayStr));
    return {
      label: DAYS_RU[d.getDay()],
      views: found ? Number(found.views) : 0,
      isToday: i === 6,
    };
  });
}

function timeAgo(dt: string) {
  const diff = Date.now() - new Date(dt).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  return `${Math.floor(h / 24)} дн назад`;
}

const STAGE_LABELS: Record<string, string> = {
  lead: 'Лид', negotiation: 'Переговоры', agreed: 'Согласовано',
  paid: 'Оплачено', completed: 'Завершено', lost: 'Сорвано',
};
const STAGE_COLORS: Record<string, string> = {
  lead: '#6366f1', negotiation: '#f59e0b', agreed: '#3b82f6',
  paid: '#8b5cf6', completed: '#10b981', lost: '#ef4444',
};

function notifIcon(type: string) {
  if (type === 'new_user') return '👤';
  if (type === 'new_lead') return '🤝';
  return '📦';
}
function notifLabel(type: string) {
  if (type === 'new_user') return 'Новый пользователь';
  if (type === 'new_lead') return 'Новый лид';
  return 'Новый товар';
}

// --- Line Chart ---
function LineChart({ data }: { data: { label: string; views: number; isToday: boolean }[] }) {
  const W = 400, H = 110, PAD_X = 16, PAD_TOP = 16, PAD_BOT = 22;
  const max = Math.max(...data.map(d => d.views), 1);
  const pts = data.map((d, i) => {
    const x = PAD_X + (i / (data.length - 1)) * (W - PAD_X * 2);
    const y = PAD_TOP + (1 - d.views / max) * (H - PAD_TOP - PAD_BOT);
    return { x, y, ...d };
  });
  const poly = pts.map(p => `${p.x},${p.y}`).join(' ');
  const area = `${pts[0].x},${H - PAD_BOT} ${poly} ${pts[pts.length - 1].x},${H - PAD_BOT}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '110px' }}>
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#chartGrad)" />
      <polyline points={poly} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <g key={i}>
          {p.isToday && (
            <circle cx={p.x} cy={p.y} r={9} fill="#6366f1" opacity={0.12} />
          )}
          <circle
            cx={p.x} cy={p.y}
            r={p.isToday ? 5 : 3}
            fill={p.isToday ? '#6366f1' : '#818cf8'}
            stroke="white" strokeWidth={p.isToday ? 2 : 1.5}
          />
          <text x={p.x} y={H - 4} textAnchor="middle" fontSize="9" fill={p.isToday ? '#6366f1' : '#94a3b8'} fontWeight={p.isToday ? '700' : '400'}>
            {p.label}
          </text>
          {p.views > 0 && (
            <text x={p.x} y={p.y - 9} textAnchor="middle" fontSize="9" fill={p.isToday ? '#6366f1' : '#94a3b8'} fontWeight="600">
              {p.views}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

// --- Card ---
function Card({ title, icon, children, style }: {
  title: string; icon: string; children: React.ReactNode; style?: React.CSSProperties;
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.55)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderRadius: '16px',
      border: '1px solid rgba(255,255,255,0.65)',
      boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '17px' }}>{icon}</span>
        <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b', letterSpacing: '0.01em' }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

// --- Stat Pill ---
function StatPill({ icon, label, value }: { icon: string; label: string; value: number | string }) {
  return (
    <div style={{
      flex: 1,
      background: 'rgba(255,255,255,0.65)',
      borderRadius: '10px',
      padding: '10px 8px',
      border: '1px solid rgba(0,0,0,0.06)',
      textAlign: 'center',
      minWidth: '70px',
    }}>
      <div style={{ fontSize: '16px', lineHeight: 1 }}>{icon}</div>
      <div style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', margin: '4px 0 2px' }}>{value}</div>
      <div style={{ fontSize: '10px', color: '#94a3b8', lineHeight: 1.3 }}>{label}</div>
    </div>
  );
}

// --- Main Page ---
export default function DashboardPage() {
  const { setPageTitle } = usePageTitle();
  useEffect(() => { setPageTitle('Dashboard'); }, [setPageTitle]);

  const [stats, setStats] = useState<OverallStats | null>(null);
  const [weekData, setWeekData] = useState<{ label: string; views: number; isToday: boolean }[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTask, setNewTask] = useState('');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const ASSETS = (process.env.NEXT_PUBLIC_API_URL ?? '').replace('/api', '') + '/files/';

  useEffect(() => {
    Promise.all([
      api.get('/dashboard/stats').then(r => setStats(r.data)).catch(() => {}),
      api.get('/dashboard/weekly-views').then(r => setWeekData(buildWeekData(r.data))).catch(() => {}),
      api.get('/dashboard/tasks').then(r => setTasks(r.data)).catch(() => {}),
      api.get('/dashboard/notifications').then(r => setNotifications(r.data)).catch(() => {}),
      api.get('/dashboard/active-leads').then(r => setLeads(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const addTask = async () => {
    if (!newTask.trim()) return;
    try {
      const r = await api.post('/dashboard/tasks', { text: newTask.trim() });
      setTasks(prev => [r.data, ...prev]);
      setNewTask('');
    } catch {}
  };

  const toggleTask = async (task: Task) => {
    try {
      const r = await api.patch(`/dashboard/tasks/${task.id}`, { completed: !task.completed });
      setTasks(prev => prev.map(t => t.id === task.id ? r.data : t));
    } catch {}
  };

  const deleteTask = async (id: string) => {
    try {
      await api.delete(`/dashboard/tasks/${id}`);
      setTasks(prev => prev.filter(t => t.id !== id));
    } catch {}
  };

  const totalDeals = stats
    ? stats.completed + stats.lost + stats.leads + stats.negotiation + stats.agreed + stats.paid
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Row 1: Overall Info + Weekly Chart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        {/* Overall Information */}
        <Card title="Общая информация" icon="📊">
          {/* Deal results */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{
              flex: 1,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              borderRadius: '12px', padding: '14px 16px', color: 'white',
            }}>
              <div style={{ fontSize: '26px', fontWeight: '800', lineHeight: 1 }}>{stats?.completed ?? '—'}</div>
              <div style={{ fontSize: '11px', opacity: 0.9, marginTop: '4px' }}>Завершённых сделок</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', color: '#94a3b8', fontSize: '18px', fontWeight: '300' }}>|</div>
            <div style={{
              flex: 1,
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              borderRadius: '12px', padding: '14px 16px', color: 'white',
            }}>
              <div style={{ fontSize: '26px', fontWeight: '800', lineHeight: 1 }}>{stats?.lost ?? '—'}</div>
              <div style={{ fontSize: '11px', opacity: 0.9, marginTop: '4px' }}>Сорванных сделок</div>
            </div>
          </div>

          {/* Sub-stats */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <StatPill icon="📋" label="Всего запросов" value={totalDeals} />
            <StatPill icon="📨" label="Согласовано КП" value={stats?.agreed ?? '—'} />
            <StatPill icon="🚢" label="Грузов в пути" value={stats?.paid ?? '—'} />
          </div>

          {/* Users / Products */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '-4px' }}>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: '8px',
              background: 'rgba(255,255,255,0.6)', borderRadius: '10px',
              padding: '8px 12px', border: '1px solid rgba(0,0,0,0.05)',
            }}>
              <span style={{ fontSize: '16px' }}>👥</span>
              <div>
                <div style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b' }}>{stats?.totalUsers ?? '—'}</div>
                <div style={{ fontSize: '10px', color: '#94a3b8' }}>Пользователей</div>
              </div>
            </div>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: '8px',
              background: 'rgba(255,255,255,0.6)', borderRadius: '10px',
              padding: '8px 12px', border: '1px solid rgba(0,0,0,0.05)',
            }}>
              <span style={{ fontSize: '16px' }}>📦</span>
              <div>
                <div style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b' }}>{stats?.totalProducts ?? '—'}</div>
                <div style={{ fontSize: '10px', color: '#94a3b8' }}>Товаров</div>
              </div>
            </div>
          </div>
        </Card>

        {/* Weekly Views Chart */}
        <Card title="Просмотры товаров за неделю" icon="📈">
          {weekData.length > 0 ? (
            <>
              <LineChart data={weekData} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginTop: '-4px' }}>
                <span>За 7 дней: <strong style={{ color: '#475569' }}>{weekData.reduce((s, d) => s + d.views, 0)}</strong></span>
                <span>Сегодня: <strong style={{ color: '#6366f1' }}>{weekData.find(d => d.isToday)?.views ?? 0}</strong></span>
              </div>
            </>
          ) : loading ? (
            <div style={{ height: '110px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '13px' }}>
              Загрузка...
            </div>
          ) : (
            <div style={{ height: '110px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '13px' }}>
              Нет данных за неделю
            </div>
          )}
        </Card>
      </div>

      {/* Row 2: Tasks + Notifications */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        {/* Tasks */}
        <Card title="Задачи" icon="✅">
          {/* Input */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              value={newTask}
              onChange={e => setNewTask(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTask()}
              placeholder="Добавить задачу..."
              style={{
                flex: 1,
                border: '1px solid rgba(0,0,0,0.1)',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '13px',
                background: 'rgba(255,255,255,0.7)',
                outline: 'none',
                color: '#374151',
              }}
            />
            <button
              onClick={addTask}
              style={{
                padding: '8px 14px',
                background: '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: '400',
                lineHeight: 1,
              }}
            >+</button>
          </div>

          {/* Task list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '220px', overflowY: 'auto' }}>
            {tasks.length === 0 && (
              <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '13px', padding: '24px 0' }}>
                Задачи не добавлены
              </div>
            )}
            {tasks.map(task => (
              <div key={task.id} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 10px', borderRadius: '8px',
                background: task.completed ? 'rgba(16,185,129,0.07)' : 'rgba(255,255,255,0.55)',
                border: `1px solid ${task.completed ? 'rgba(16,185,129,0.2)' : 'rgba(0,0,0,0.06)'}`,
                transition: 'all 0.15s ease',
              }}>
                <input
                  type="checkbox"
                  checked={!!task.completed}
                  onChange={() => toggleTask(task)}
                  style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: '#6366f1', flexShrink: 0 }}
                />
                <span style={{
                  flex: 1,
                  fontSize: '13px',
                  color: task.completed ? '#94a3b8' : '#374151',
                  textDecoration: task.completed ? 'line-through' : 'none',
                }}>{task.text}</span>
                <button
                  onClick={() => deleteTask(task.id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#cbd5e1', fontSize: '16px', padding: '0 2px',
                    lineHeight: 1, flexShrink: 0,
                  }}
                >×</button>
              </div>
            ))}
          </div>
        </Card>

        {/* Notifications */}
        <Card title="Уведомления" icon="🔔">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '280px', overflowY: 'auto' }}>
            {notifications.length === 0 && (
              <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '13px', padding: '24px 0' }}>
                Нет уведомлений
              </div>
            )}
            {notifications.map((n, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '8px 10px', borderRadius: '8px',
                background: 'rgba(255,255,255,0.55)',
                border: '1px solid rgba(0,0,0,0.06)',
              }}>
                <span style={{ fontSize: '18px', flexShrink: 0 }}>{notifIcon(n.type)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: '#374151' }}>{notifLabel(n.type)}</div>
                  <div style={{
                    fontSize: '12px', color: '#64748b',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{n.title}</div>
                </div>
                <div style={{ fontSize: '10px', color: '#94a3b8', flexShrink: 0, textAlign: 'right' }}>
                  {timeAgo(n.createdAt)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Row 3: Active Leads */}
      <Card title="Активные лиды (CRM)" icon="🤝">
        {leads.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '13px', padding: '20px 0' }}>
            {loading ? 'Загрузка...' : 'Нет активных лидов'}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '4px' }}>
            {leads.map(lead => (
              <div key={lead.id} style={{
                flexShrink: 0, width: '190px',
                background: 'rgba(255,255,255,0.65)',
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: '12px', padding: '14px',
                display: 'flex', flexDirection: 'column', gap: '8px',
              }}>
                {/* Stage badge + amount */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                  <span style={{
                    fontSize: '10px', fontWeight: '600',
                    padding: '2px 8px', borderRadius: '20px',
                    color: 'white',
                    background: STAGE_COLORS[lead.stage] ?? '#64748b',
                    flexShrink: 0,
                  }}>{STAGE_LABELS[lead.stage] ?? lead.stage}</span>
                  {lead.amount && (
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#1e293b', textAlign: 'right' }}>
                      {Number(lead.amount).toLocaleString('ru')} {lead.currency}
                    </span>
                  )}
                </div>

                {/* Product name */}
                <div style={{
                  fontSize: '12px', fontWeight: '600', color: '#1e293b',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  lineHeight: 1.3,
                }}>
                  {lead.productName ?? lead.title ?? 'Без названия'}
                </div>

                {/* Product image */}
                {lead.productPreview && (
                  <div style={{
                    width: '100%', height: '80px', borderRadius: '8px',
                    overflow: 'hidden', background: '#f1f5f9',
                  }}>
                    <img
                      src={ASSETS + lead.productPreview}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                )}

                {/* Buyer */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {lead.buyerPhoto ? (
                    <img
                      src={ASSETS + lead.buyerPhoto}
                      alt=""
                      style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                    />
                  ) : (
                    <div style={{
                      width: '22px', height: '22px', borderRadius: '50%',
                      background: '#e2e8f0', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: '10px', flexShrink: 0,
                    }}>👤</div>
                  )}
                  <span style={{
                    fontSize: '11px', color: '#64748b',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {lead.buyerFirstName ?? lead.buyerUsername ?? 'Неизвестен'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

    </div>
  );
}
