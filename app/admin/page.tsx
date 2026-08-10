'use client';

import { useEffect, useState } from 'react';
import { Card, PageTitle, StatCard } from '@/components/UI';

type UserStats = {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  recentActiveUsers: number;
};

type CrewStats = {
  totalCrews: number;
  recruitingCrews: number;
  closedCrews: number;
  activeBattles: number;
};

type AdminUser = {
  userId: string;
  userName: string;
  nickname: string;
  email: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'WITHDRAWN';
  createdAt: string;
  lastLoginAt: string | null;
  isAdmin: boolean;
};

type AdminCrew = {
  crewId: string;
  crewName: string;
  status: 'RECRUITING' | 'FULL' | 'CLOSED';
  maxMembers: number;
  memberCount: number;
  ownerUserId: string;
  createdAt: string;
};

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
}

function DashboardTab() {
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [crewStats, setCrewStats] = useState<CrewStats | null>(null);

  useEffect(() => {
    fetch('/api/auth/admin/stats').then((res) => (res.ok ? res.json() : null)).then(setUserStats);
    fetch('/api/crew/admin/stats').then((res) => (res.ok ? res.json() : null)).then(setCrewStats);
  }, []);

  return (
    <Card>
      <div className="admin-stats-grid">
        <StatCard icon="👥" label="전체 회원" value={userStats ? String(userStats.totalUsers) : '-'} suffix="명" />
        <StatCard icon="🟢" label="정상 회원" value={userStats ? String(userStats.activeUsers) : '-'} suffix="명" />
        <StatCard icon="⛔" label="정지된 회원" value={userStats ? String(userStats.suspendedUsers) : '-'} suffix="명" />
        <StatCard icon="🏃" label="최근 7일 로그인" value={userStats ? String(userStats.recentActiveUsers) : '-'} suffix="명" />
        <StatCard icon="🏳️" label="전체 크루" value={crewStats ? String(crewStats.totalCrews) : '-'} suffix="개" />
        <StatCard icon="📣" label="모집 중 크루" value={crewStats ? String(crewStats.recruitingCrews) : '-'} suffix="개" />
        <StatCard icon="🔒" label="마감된 크루" value={crewStats ? String(crewStats.closedCrews) : '-'} suffix="개" />
        <StatCard icon="⚔️" label="진행 중 배틀" value={crewStats ? String(crewStats.activeBattles) : '-'} suffix="건" />
      </div>
    </Card>
  );
}

function UsersTab() {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function search(reset: boolean) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set('query', query);
      if (!reset && cursor) params.set('cursor', cursor);
      const res = await fetch(`/api/auth/admin/users?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      setUsers((prev) => (reset ? data.users : [...prev, ...data.users]));
      setCursor(data.nextCursor);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    search(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleStatus(user: AdminUser) {
    const nextStatus = user.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    if (!window.confirm(`${user.nickname}님을 ${nextStatus === 'SUSPENDED' ? '정지' : '정상화'}할까요?`)) return;
    setBusyId(user.userId);
    try {
      const res = await fetch(`/api/auth/admin/users/${user.userId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) {
        setUsers((prev) => prev.map((u) => (u.userId === user.userId ? { ...u, status: nextStatus } : u)));
      } else {
        const data = await res.json();
        window.alert(data.error ?? '처리하지 못했어요.');
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <div className="battle-history-filters">
        <label style={{ flex: 1 }}>
          검색
          <input
            type="text"
            placeholder="닉네임 / 아이디 / 이메일"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && search(true)}
          />
        </label>
        <button className="primary-btn" onClick={() => search(true)} disabled={loading}>
          {loading ? '검색 중...' : '검색'}
        </button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>닉네임</th>
              <th>아이디</th>
              <th>이메일</th>
              <th>상태</th>
              <th>가입일</th>
              <th>최근 로그인</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.userId}>
                <td>{user.nickname}{user.isAdmin && <span className="type-pill">관리자</span>}</td>
                <td>{user.userName}</td>
                <td>{user.email}</td>
                <td>
                  <span className={`type-pill ${user.status === 'ACTIVE' ? 'success' : user.status === 'SUSPENDED' ? 'ended' : ''}`}>
                    {user.status}
                  </span>
                </td>
                <td>{formatDate(user.createdAt)}</td>
                <td>{formatDate(user.lastLoginAt)}</td>
                <td>
                  {!user.isAdmin && (
                    <button className="ghost-btn" disabled={busyId === user.userId} onClick={() => toggleStatus(user)}>
                      {user.status === 'SUSPENDED' ? '정상화' : '정지'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {users.length === 0 && !loading && <p className="muted" style={{ marginTop: 12 }}>결과가 없어요.</p>}
      {cursor && (
        <button className="ghost-btn full-width" style={{ marginTop: 12 }} disabled={loading} onClick={() => search(false)}>
          더 보기
        </button>
      )}
    </Card>
  );
}

function CrewsTab() {
  const [query, setQuery] = useState('');
  const [crews, setCrews] = useState<AdminCrew[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function search(reset: boolean) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set('query', query);
      if (!reset && cursor) params.set('cursor', cursor);
      const res = await fetch(`/api/crew/admin/crews?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      setCrews((prev) => (reset ? data.crews : [...prev, ...data.crews]));
      setCursor(data.nextCursor);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    search(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleStatus(crew: AdminCrew) {
    const nextStatus = crew.status === 'CLOSED' ? 'RECRUITING' : 'CLOSED';
    if (!window.confirm(`${crew.crewName} 크루를 ${nextStatus === 'CLOSED' ? '마감' : '재모집'}할까요?`)) return;
    setBusyId(crew.crewId);
    try {
      const res = await fetch(`/api/crew/admin/crews/${crew.crewId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) {
        setCrews((prev) => prev.map((c) => (c.crewId === crew.crewId ? { ...c, status: nextStatus } : c)));
      } else {
        const data = await res.json();
        window.alert(data.error ?? '처리하지 못했어요.');
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <div className="battle-history-filters">
        <label style={{ flex: 1 }}>
          검색
          <input
            type="text"
            placeholder="크루명"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && search(true)}
          />
        </label>
        <button className="primary-btn" onClick={() => search(true)} disabled={loading}>
          {loading ? '검색 중...' : '검색'}
        </button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>크루명</th>
              <th>인원</th>
              <th>상태</th>
              <th>생성일</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {crews.map((crew) => (
              <tr key={crew.crewId}>
                <td>{crew.crewName}</td>
                <td>{crew.memberCount}/{crew.maxMembers}</td>
                <td>
                  <span className={`type-pill ${crew.status === 'RECRUITING' ? 'success' : crew.status === 'CLOSED' ? 'ended' : ''}`}>
                    {crew.status}
                  </span>
                </td>
                <td>{formatDate(crew.createdAt)}</td>
                <td>
                  <button className="ghost-btn" disabled={busyId === crew.crewId} onClick={() => toggleStatus(crew)}>
                    {crew.status === 'CLOSED' ? '재모집' : '마감'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {crews.length === 0 && !loading && <p className="muted" style={{ marginTop: 12 }}>결과가 없어요.</p>}
      {cursor && (
        <button className="ghost-btn full-width" style={{ marginTop: 12 }} disabled={loading} onClick={() => search(false)}>
          더 보기
        </button>
      )}
    </Card>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState<'dashboard' | 'users' | 'crews'>('dashboard');

  return (
    <div>
      <PageTitle title="관리자" subtitle="회원과 크루 현황을 확인하고 관리해요." />

      <div className="tab-line">
        <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>
          대시보드
        </button>
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>
          회원 관리
        </button>
        <button className={tab === 'crews' ? 'active' : ''} onClick={() => setTab('crews')}>
          크루 관리
        </button>
      </div>

      {tab === 'dashboard' && <DashboardTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'crews' && <CrewsTab />}
    </div>
  );
}
