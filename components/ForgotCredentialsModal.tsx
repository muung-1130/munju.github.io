'use client';

import { useState } from 'react';
import { validatePassword } from '@/lib/validators';

type Tab = 'username' | 'password';
type PasswordStep = 'request' | 'confirm';

export function ForgotCredentialsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('username');

  // 아이디 찾기
  const [findEmail, setFindEmail] = useState('');
  const [findLoading, setFindLoading] = useState(false);
  const [findMessage, setFindMessage] = useState('');
  const [findIsError, setFindIsError] = useState(false);

  // 비밀번호 찾기
  const [step, setStep] = useState<PasswordStep>('request');
  const [pwUsername, setPwUsername] = useState('');
  const [pwEmail, setPwEmail] = useState('');
  const [pwCode, setPwCode] = useState('');
  const [pwNewPassword, setPwNewPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwMessage, setPwMessage] = useState('');
  const [pwDone, setPwDone] = useState(false);

  async function handleFindUsername(event: React.FormEvent) {
    event.preventDefault();
    setFindLoading(true);
    setFindMessage('');
    setFindIsError(false);
    try {
      const res = await fetch('/api/auth/find-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: findEmail })
      });
      const data = await res.json();
      if (!res.ok) {
        setFindMessage(data.error ?? '요청에 실패했어요.');
        setFindIsError(true);
        return;
      }
      setFindMessage('입력하신 이메일로 아이디 정보를 보내드렸어요. 메일함을 확인해주세요.');
    } catch {
      setFindMessage('네트워크 오류가 발생했어요.');
      setFindIsError(true);
    } finally {
      setFindLoading(false);
    }
  }

  async function handleRequestCode(event: React.FormEvent) {
    event.preventDefault();
    setPwLoading(true);
    setPwError('');
    setPwMessage('');
    try {
      const res = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: pwUsername, email: pwEmail })
      });
      const data = await res.json();
      if (!res.ok) {
        setPwError(data.error ?? '요청에 실패했어요.');
        return;
      }
      setPwMessage('입력하신 이메일로 인증코드를 보내드렸어요.');
      setStep('confirm');
    } catch {
      setPwError('네트워크 오류가 발생했어요.');
    } finally {
      setPwLoading(false);
    }
  }

  const newPasswordErrors = pwNewPassword ? validatePassword(pwNewPassword) : [];

  async function handleConfirmReset(event: React.FormEvent) {
    event.preventDefault();
    if (newPasswordErrors.length > 0) return;
    setPwLoading(true);
    setPwError('');
    try {
      const res = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: pwUsername, email: pwEmail, code: pwCode, newPassword: pwNewPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        setPwError(data.error ?? '재설정에 실패했어요.');
        return;
      }
      setPwDone(true);
    } catch {
      setPwError('네트워크 오류가 발생했어요.');
    } finally {
      setPwLoading(false);
    }
  }

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={(event) => event.stopPropagation()}>
        <button className="auth-modal-close" onClick={onClose} aria-label="닫기">✕</button>
        <div className="tab-row" style={{ marginBottom: 18 }}>
          <button type="button" className={tab === 'username' ? 'active' : ''} onClick={() => setTab('username')}>
            아이디 찾기
          </button>
          <button type="button" className={tab === 'password' ? 'active' : ''} onClick={() => setTab('password')}>
            비밀번호 찾기
          </button>
        </div>

        {tab === 'username' ? (
          <form className="auth-form" onSubmit={handleFindUsername}>
            <p className="muted">가입할 때 사용한 이메일을 입력하면 아이디를 보내드려요.</p>
            <label>
              이메일
              <input type="email" value={findEmail} onChange={(event) => setFindEmail(event.target.value)} required />
            </label>
            {findMessage && <p className={findIsError ? 'field-error' : 'field-hint'}>{findMessage}</p>}
            <button type="submit" className="primary-btn full-width" disabled={findLoading}>
              {findLoading ? '전송 중...' : '아이디 이메일로 받기'}
            </button>
          </form>
        ) : pwDone ? (
          <div className="auth-form">
            <p className="field-ok">비밀번호가 재설정됐어요. 새 비밀번호로 로그인해주세요.</p>
            <button type="button" className="primary-btn full-width" onClick={onClose}>
              확인
            </button>
          </div>
        ) : step === 'request' ? (
          <form className="auth-form" onSubmit={handleRequestCode}>
            <p className="muted">아이디와 가입 시 사용한 이메일을 입력하면 인증코드를 보내드려요.</p>
            <label>
              아이디
              <input value={pwUsername} onChange={(event) => setPwUsername(event.target.value)} required />
            </label>
            <label>
              이메일
              <input type="email" value={pwEmail} onChange={(event) => setPwEmail(event.target.value)} required />
            </label>
            {pwError && <p className="field-error">{pwError}</p>}
            <button type="submit" className="primary-btn full-width" disabled={pwLoading}>
              {pwLoading ? '전송 중...' : '인증코드 받기'}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleConfirmReset}>
            {pwMessage && <p className="field-hint">{pwMessage}</p>}
            <label>
              인증코드 (6자리)
              <input value={pwCode} onChange={(event) => setPwCode(event.target.value)} maxLength={6} required />
            </label>
            <label>
              새 비밀번호
              <input type="password" value={pwNewPassword} onChange={(event) => setPwNewPassword(event.target.value)} required />
              {newPasswordErrors.length > 0 && <p className="field-error">{newPasswordErrors.join(' ')}</p>}
            </label>
            {pwError && <p className="field-error">{pwError}</p>}
            <button type="submit" className="primary-btn full-width" disabled={pwLoading || newPasswordErrors.length > 0}>
              {pwLoading ? '변경 중...' : '비밀번호 변경'}
            </button>
            <button type="button" className="ghost-btn full-width" onClick={() => setStep('request')}>
              인증코드 다시 받기
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
