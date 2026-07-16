'use client';

import { useEffect, useMemo, useState } from 'react';
import { signIn } from 'next-auth/react';
import { validateEmail, validateNickname, validatePassword, validateUsername } from '@/lib/validators';

type Mode = 'login' | 'signup';
type CheckStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error';

const currentYear = new Date().getFullYear();
const birthYearOptions = Array.from({ length: 71 }, (_, i) => currentYear - 10 - i);

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
      <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
      <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
      <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
    </svg>
  );
}

export function AuthForms({ initialMode = 'login', onAuthenticated }: { initialMode?: Mode; onAuthenticated?: () => void }) {
  const [mode, setMode] = useState<Mode>(initialMode);

  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<CheckStatus>('idle');
  const [usernameStatusMessage, setUsernameStatusMessage] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'M' | 'F' | ''>('');
  const [birthYear, setBirthYear] = useState('');
  const [nickname, setNickname] = useState('');
  const [nicknameStatus, setNicknameStatus] = useState<CheckStatus>('idle');
  const [nicknameStatusMessage, setNicknameStatusMessage] = useState('');
  const [dongQuery, setDongQuery] = useState('');
  const [dongResults, setDongResults] = useState<{ display: string }[]>([]);
  const [dongDropdownOpen, setDongDropdownOpen] = useState(false);
  const [dongSelected, setDongSelected] = useState('');
  const [signupError, setSignupError] = useState('');
  const [signupLoading, setSignupLoading] = useState(false);
  const [showCongrats, setShowCongrats] = useState(false);
  const [congratsShownOnce, setCongratsShownOnce] = useState(false);

  const usernameErrors = username ? validateUsername(username) : [];
  const passwordErrors = password ? validatePassword(password) : [];
  const passwordMismatch = passwordConfirm.length > 0 && passwordConfirm !== password;
  const emailValid = validateEmail(email);
  const nicknameErrors = validateNickname(nickname);

  useEffect(() => {
    if (mode !== 'signup' || username.length === 0 || usernameErrors.length > 0) {
      setUsernameStatus('idle');
      return;
    }
    setUsernameStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(username)}`);
        const data = await res.json();
        if (!res.ok) {
          setUsernameStatus('error');
          setUsernameStatusMessage(data.errors?.join(' ') ?? '확인할 수 없어요.');
          return;
        }
        setUsernameStatus(data.available ? 'available' : 'taken');
      } catch {
        setUsernameStatus('error');
        setUsernameStatusMessage('확인할 수 없어요. 네트워크를 확인해주세요.');
      }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, mode]);

  useEffect(() => {
    if (nickname.length === 0 || nicknameErrors.length > 0) {
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
  }, [nickname]);

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

  useEffect(() => {
    if (!showCongrats) return;
    const timer = setTimeout(() => setShowCongrats(false), 4000);
    return () => clearTimeout(timer);
  }, [showCongrats]);

  // 회원가입 단계: 앞 단계가 유효해질 때마다 다음 단계가 나타난다.
  const steps = useMemo(
    () => [
      { key: 'username', valid: username.length > 0 && usernameErrors.length === 0 && usernameStatus === 'available' },
      { key: 'password', valid: password.length > 0 && passwordErrors.length === 0 },
      { key: 'passwordConfirm', valid: passwordConfirm.length > 0 && !passwordMismatch },
      { key: 'email', valid: emailValid },
      { key: 'name', valid: name.trim().length > 0 },
      { key: 'gender', valid: gender === 'M' || gender === 'F' },
      { key: 'birthYear', valid: birthYear.length > 0 },
      { key: 'nickname', valid: nicknameErrors.length === 0 && (nickname.length === 0 || nicknameStatus === 'available') },
      { key: 'dong', valid: dongSelected.length > 0 }
    ],
    [username, usernameErrors, usernameStatus, password, passwordErrors, passwordConfirm, passwordMismatch, emailValid, name, gender, birthYear, nickname, nicknameErrors, nicknameStatus, dongSelected]
  );

  const visibleStepCount = useMemo(() => {
    let count = 1;
    for (let i = 0; i < steps.length; i += 1) {
      if (steps[i].valid) count = i + 2;
      else break;
    }
    return Math.min(count, steps.length);
  }, [steps]);

  function isVisible(key: string) {
    const index = steps.findIndex((step) => step.key === key);
    return index < visibleStepCount;
  }

  const isFormComplete = steps.every((step) => step.valid);

  useEffect(() => {
    if (isFormComplete && !congratsShownOnce) {
      setShowCongrats(true);
      setCongratsShownOnce(true);
    }
  }, [isFormComplete, congratsShownOnce]);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    const result = await signIn('credentials', { username: loginUsername, password: loginPassword, redirect: false });
    setLoginLoading(false);
    if (result?.error) {
      setLoginError('아이디 또는 비밀번호가 올바르지 않아요.');
    } else {
      onAuthenticated?.();
    }
  }

  async function handleSignup(event: React.FormEvent) {
    event.preventDefault();
    if (!isFormComplete) return;
    setSignupLoading(true);
    setSignupError('');
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, email, name, gender, birthYear: Number(birthYear), nickname, dong: dongSelected })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setSignupError(data.errors?.join(' ') ?? '회원가입에 실패했어요.');
        return;
      }
      await signIn('credentials', { username, password, redirect: false });
      onAuthenticated?.();
    } catch {
      setSignupError('네트워크 오류로 가입에 실패했어요. (DB 연결을 확인해주세요)');
    } finally {
      setSignupLoading(false);
    }
  }

  return (
    <>
      {mode === 'login' ? (
        <form className="auth-form" onSubmit={handleLogin}>
          <h2>로그인</h2>
          <label>
            아이디
            <input value={loginUsername} onChange={(event) => setLoginUsername(event.target.value)} autoComplete="username" />
          </label>
          <label>
            비밀번호
            <input type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} autoComplete="current-password" />
          </label>
          {loginError && <p className="field-error">{loginError}</p>}
          <button type="submit" className="primary-btn full-width" disabled={loginLoading}>
            {loginLoading ? '로그인 중...' : '로그인'}
          </button>
          <button type="button" className="auth-link" onClick={() => setMode('signup')}>회원가입</button>
          <button type="button" className="auth-google-btn" onClick={() => signIn('google')}>
            <GoogleIcon /> Google로 계속하기
          </button>
        </form>
      ) : (
        <form className="auth-form auth-form-signup" onSubmit={handleSignup}>
          <div className="auth-form-head">
            <button type="button" className="auth-back" onClick={() => setMode('login')}>← 로그인</button>
            <h2>회원가입</h2>
          </div>

          {isVisible('username') && (
            <label className="wizard-step">
              아이디
              <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoFocus />
              {usernameErrors.length > 0 && <p className="field-error">{usernameErrors.join(' ')}</p>}
              {usernameErrors.length === 0 && usernameStatus === 'checking' && <p className="field-hint">중복 확인 중...</p>}
              {usernameErrors.length === 0 && usernameStatus === 'available' && <p className="field-ok">사용 가능한 아이디예요.</p>}
              {usernameStatus === 'taken' && <p className="field-error">이미 사용 중인 아이디예요.</p>}
              {usernameStatus === 'error' && <p className="field-error">{usernameStatusMessage}</p>}
            </label>
          )}

          {isVisible('password') && (
            <label className="wizard-step">
              비밀번호
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
              {password && passwordErrors.length > 0 && <p className="field-error">{passwordErrors.join(' ')}</p>}
            </label>
          )}

          {isVisible('passwordConfirm') && (
            <label className="wizard-step">
              비밀번호 확인
              <input type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} autoComplete="new-password" />
              {passwordMismatch && <p className="field-error">비밀번호가 일치하지 않아요.</p>}
            </label>
          )}

          {isVisible('email') && (
            <label className="wizard-step">
              이메일
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
              {email && !emailValid && <p className="field-error">올바른 이메일 형식이 아니에요.</p>}
            </label>
          )}

          {isVisible('name') && (
            <label className="wizard-step">
              이름
              <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
            </label>
          )}

          {isVisible('gender') && (
            <label className="wizard-step">
              성별
              <div className="gender-buttons">
                <button type="button" className={gender === 'M' ? 'active' : ''} onClick={() => setGender('M')}>남성</button>
                <button type="button" className={gender === 'F' ? 'active' : ''} onClick={() => setGender('F')}>여성</button>
              </div>
            </label>
          )}

          {isVisible('birthYear') && (
            <label className="wizard-step">
              출생년도
              <select value={birthYear} onChange={(event) => setBirthYear(event.target.value)}>
                <option value="">선택해주세요</option>
                {birthYearOptions.map((year) => (
                  <option key={year} value={year}>{year}년</option>
                ))}
              </select>
            </label>
          )}

          {isVisible('nickname') && (
            <label className="wizard-step">
              닉네임 <span className="muted">(비우면 아이디로 자동 설정돼요)</span>
              <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={20} />
              {nicknameErrors.length > 0 && <p className="field-error">{nicknameErrors.join(' ')}</p>}
              {nickname && nicknameErrors.length === 0 && nicknameStatus === 'checking' && <p className="field-hint">중복 확인 중...</p>}
              {nickname && nicknameErrors.length === 0 && nicknameStatus === 'available' && <p className="field-ok">사용 가능해요.</p>}
              {nicknameStatus === 'taken' && <p className="field-error">이미 사용 중인 닉네임이에요.</p>}
              {nickname && nicknameStatus === 'error' && <p className="field-error">{nicknameStatusMessage}</p>}
            </label>
          )}

          {isVisible('dong') && (
            <>
              <label className="wizard-step dong-field">
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

              {signupError && <p className="field-error">{signupError}</p>}

              <button type="submit" className="primary-btn full-width wizard-step" disabled={!isFormComplete || signupLoading}>
                {signupLoading ? '가입 중...' : '회원가입'}
              </button>
            </>
          )}
        </form>
      )}

      {showCongrats && (
        <div className="auth-congrats-overlay" onClick={() => setShowCongrats(false)}>
          <div className="auth-congrats-bubble">
            <span className="ai-avatar-small"><img src="/assets/dog-assistant.png" alt="" /></span>
            <p>{(nickname.trim() || username)}님, 저와 함께 달릴 준비 되셨나요?</p>
          </div>
        </div>
      )}
    </>
  );
}
