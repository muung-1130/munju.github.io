'use client';

import { useEffect, useState } from 'react';
import { validateNickname } from '@/lib/validators';

type CheckStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error';

const currentYear = new Date().getFullYear();
const birthYearOptions = Array.from({ length: 71 }, (_, i) => currentYear - 10 - i);

export function CompleteProfileModal({ currentNickname, onDone }: { currentNickname: string; onDone: () => void }) {
  const [gender, setGender] = useState<'M' | 'F' | ''>('');
  const [birthYear, setBirthYear] = useState('');
  const [nickname, setNickname] = useState(currentNickname);
  const [nicknameStatus, setNicknameStatus] = useState<CheckStatus>('idle');
  const [nicknameStatusMessage, setNicknameStatusMessage] = useState('');
  const [dongQuery, setDongQuery] = useState('');
  const [dongResults, setDongResults] = useState<{ display: string }[]>([]);
  const [dongDropdownOpen, setDongDropdownOpen] = useState(false);
  const [dongSelected, setDongSelected] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const nicknameErrors = validateNickname(nickname);
  const nicknameChanged = nickname !== currentNickname;

  useEffect(() => {
    if (!nicknameChanged || nickname.length === 0 || nicknameErrors.length > 0) {
      setNicknameStatus('idle');
      return;
    }
    setNicknameStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-nickname?nickname=${encodeURIComponent(nickname)}`);
        const data = await res.json();
        if (!res.ok) {
          setNicknameStatus('error');
          setNicknameStatusMessage(data.errors?.join(' ') ?? '확인할 수 없어요.');
          return;
        }
        setNicknameStatus(data.available ? 'available' : 'taken');
      } catch {
        setNicknameStatus('error');
        setNicknameStatusMessage('확인할 수 없어요. 네트워크를 확인해주세요.');
      }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nickname, nicknameChanged]);

  useEffect(() => {
    if (dongQuery.trim().length < 2) {
      setDongResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/dong/search?keyword=${encodeURIComponent(dongQuery)}`);
        const data = await res.json();
        setDongResults(data.results ?? []);
      } catch {
        setDongResults([]);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [dongQuery]);

  const isComplete =
    (gender === 'M' || gender === 'F') &&
    birthYear.length > 0 &&
    nickname.length > 0 &&
    nicknameErrors.length === 0 &&
    (!nicknameChanged || nicknameStatus === 'available') &&
    dongSelected.length > 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isComplete) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/complete-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gender, birthYear: Number(birthYear), dong: dongSelected, nickname })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.errors?.join(' ') ?? '저장에 실패했어요.');
        return;
      }
      onDone();
    } catch {
      setError('네트워크 오류로 저장에 실패했어요. (DB 연결을 확인해주세요)');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-overlay">
      <div className="auth-modal">
        <form className="auth-form" onSubmit={handleSubmit}>
          <h2>추가 정보 입력</h2>
          <p className="muted">Google 계정에서 받아오지 못한 정보만 몇 가지 더 알려주세요.</p>

          <label>
            성별
            <div className="gender-buttons">
              <button type="button" className={gender === 'M' ? 'active' : ''} onClick={() => setGender('M')}>남성</button>
              <button type="button" className={gender === 'F' ? 'active' : ''} onClick={() => setGender('F')}>여성</button>
            </div>
          </label>

          <label>
            출생년도
            <select value={birthYear} onChange={(event) => setBirthYear(event.target.value)}>
              <option value="">선택해주세요</option>
              {birthYearOptions.map((year) => (
                <option key={year} value={year}>{year}년</option>
              ))}
            </select>
          </label>

          <label>
            닉네임
            <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={20} />
            {nicknameErrors.length > 0 && <p className="field-error">{nicknameErrors.join(' ')}</p>}
            {nicknameChanged && nicknameErrors.length === 0 && nicknameStatus === 'checking' && <p className="field-hint">중복 확인 중...</p>}
            {nicknameChanged && nicknameErrors.length === 0 && nicknameStatus === 'available' && <p className="field-ok">사용 가능해요.</p>}
            {nicknameStatus === 'taken' && <p className="field-error">이미 사용 중인 닉네임이에요.</p>}
            {nicknameChanged && nicknameStatus === 'error' && <p className="field-error">{nicknameStatusMessage}</p>}
          </label>

          <label className="dong-field">
            동(지역) 검색
            <input
              value={dongQuery}
              onChange={(event) => {
                setDongQuery(event.target.value);
                setDongSelected('');
                setDongDropdownOpen(true);
              }}
              onFocus={() => setDongDropdownOpen(true)}
              onBlur={() => setTimeout(() => setDongDropdownOpen(false), 150)}
              placeholder="동 이름으로 검색 (예: 역삼동)"
            />
            {dongDropdownOpen && dongResults.length > 0 && (
              <ul className="dong-dropdown">
                {dongResults.map((result) => (
                  <li key={result.display}>
                    <button
                      type="button"
                      onClick={() => {
                        setDongSelected(result.display);
                        setDongQuery(result.display);
                        setDongDropdownOpen(false);
                      }}
                    >
                      {result.display}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {dongSelected && <p className="field-ok">선택됨: {dongSelected}</p>}
          </label>

          {error && <p className="field-error">{error}</p>}

          <button type="submit" className="primary-btn full-width" disabled={!isComplete || loading}>
            {loading ? '저장 중...' : '완료'}
          </button>
        </form>
      </div>
    </div>
  );
}
