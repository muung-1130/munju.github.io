'use client';

import { useEffect, useState } from 'react';
import { validateNickname, validatePassword, validateUsername } from '@/lib/validators';

type CheckStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error';

const currentYear = new Date().getFullYear();
const birthYearOptions = Array.from({ length: 71 }, (_, i) => currentYear - 10 - i);

export function EditProfileModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [hasPassword, setHasPassword] = useState(true);

  const [username, setUsername] = useState('');
  const [originalUsername, setOriginalUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<CheckStatus>('idle');

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [originalNickname, setOriginalNickname] = useState('');
  const [nicknameStatus, setNicknameStatus] = useState<CheckStatus>('idle');

  const [gender, setGender] = useState<'M' | 'F' | ''>('');
  const [birthYear, setBirthYear] = useState('');

  const [dongQuery, setDongQuery] = useState('');
  const [dongResults, setDongResults] = useState<{ display: string }[]>([]);
  const [dongDropdownOpen, setDongDropdownOpen] = useState(false);
  const [dongSelected, setDongSelected] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/auth/update-profile')
      .then((res) => res.json())
      .then((data) => {
        setUsername(data.username ?? '');
        setOriginalUsername(data.username ?? '');
        setEmail(data.email ?? '');
        setName(data.name ?? '');
        setNickname(data.nickname ?? '');
        setOriginalNickname(data.nickname ?? '');
        setGender(data.gender ?? '');
        setBirthYear(data.birthYear ? String(data.birthYear) : '');
        setDongSelected(data.dong ?? '');
        setDongQuery(data.dong ?? '');
        setHasPassword(Boolean(data.hasPassword));
        setLoaded(true);
      });
  }, []);

  const usernameChanged = username !== originalUsername;
  const nicknameChanged = nickname !== originalNickname;
  const usernameErrors = username ? validateUsername(username) : [];
  const nicknameErrors = nickname ? validateNickname(nickname) : [];
  const newPasswordErrors = newPassword ? validatePassword(newPassword) : [];
  const passwordMismatch = newPassword.length > 0 && newPasswordConfirm !== newPassword;

  useEffect(() => {
    if (!usernameChanged || username.length === 0 || usernameErrors.length > 0) {
      setUsernameStatus('idle');
      return;
    }
    setUsernameStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(username)}`);
        const data = await res.json();
        setUsernameStatus(res.ok && data.available ? 'available' : 'taken');
      } catch {
        setUsernameStatus('error');
      }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, usernameChanged]);

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
        setNicknameStatus(res.ok && data.available ? 'available' : 'taken');
      } catch {
        setNicknameStatus('error');
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

  const isValid =
    username.length > 0 &&
    usernameErrors.length === 0 &&
    (!usernameChanged || usernameStatus === 'available') &&
    nickname.length > 0 &&
    nicknameErrors.length === 0 &&
    (!nicknameChanged || nicknameStatus === 'available') &&
    name.trim().length > 0 &&
    (gender === 'M' || gender === 'F') &&
    birthYear.length > 0 &&
    dongSelected.length > 0 &&
    newPasswordErrors.length === 0 &&
    !passwordMismatch;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isValid) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/update-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          email,
          nickname,
          name,
          gender,
          birthYear: Number(birthYear),
          dong: dongSelected,
          currentPassword: currentPassword || undefined,
          newPassword: newPassword || undefined
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.errors?.join(' ') ?? '저장에 실패했어요.');
        return;
      }
      onSaved();
    } catch {
      setError('네트워크 오류로 저장에 실패했어요.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={(event) => event.stopPropagation()}>
        <button className="auth-modal-close" onClick={onClose} aria-label="닫기">✕</button>
        {!loaded ? (
          <p className="muted">불러오는 중...</p>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <h2>회원정보 수정</h2>

            <label>
              아이디
              <input value={username} onChange={(event) => setUsername(event.target.value)} maxLength={20} />
              {usernameErrors.length > 0 && <p className="field-error">{usernameErrors.join(' ')}</p>}
              {usernameChanged && usernameErrors.length === 0 && usernameStatus === 'checking' && <p className="field-hint">중복 확인 중...</p>}
              {usernameChanged && usernameStatus === 'available' && <p className="field-ok">사용 가능해요.</p>}
              {usernameStatus === 'taken' && <p className="field-error">이미 사용 중인 아이디예요.</p>}
            </label>

            <label>
              이메일
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>

            <label>
              닉네임
              <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={20} />
              {nicknameErrors.length > 0 && <p className="field-error">{nicknameErrors.join(' ')}</p>}
              {nicknameChanged && nicknameErrors.length === 0 && nicknameStatus === 'checking' && <p className="field-hint">중복 확인 중...</p>}
              {nicknameChanged && nicknameStatus === 'available' && <p className="field-ok">사용 가능해요.</p>}
              {nicknameStatus === 'taken' && <p className="field-error">이미 사용 중인 닉네임이에요.</p>}
            </label>

            <label>
              이름
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={50} />
            </label>

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

            <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '4px 0' }} />
            <p className="muted" style={{ margin: 0 }}>
              {hasPassword ? '비밀번호를 바꾸려면 아래에 입력해주세요 (선택).' : '비밀번호를 새로 설정할 수 있어요 (선택).'}
            </p>
            {hasPassword && (
              <label>
                현재 비밀번호
                <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
              </label>
            )}
            <label>
              새 비밀번호
              <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
              {newPasswordErrors.length > 0 && <p className="field-error">{newPasswordErrors.join(' ')}</p>}
            </label>
            <label>
              새 비밀번호 확인
              <input type="password" value={newPasswordConfirm} onChange={(event) => setNewPasswordConfirm(event.target.value)} />
              {passwordMismatch && <p className="field-error">비밀번호가 일치하지 않아요.</p>}
            </label>

            {error && <p className="field-error">{error}</p>}

            <button type="submit" className="primary-btn full-width" disabled={!isValid || loading}>
              {loading ? '저장 중...' : '저장'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
