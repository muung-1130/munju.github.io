'use client';

import { useState } from 'react';
import { SEOUL_DISTRICTS } from '@/lib/region';

function parsePaceToSec(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  const match = trimmed.match(/^(\d+)['：:](\d{1,2})$/);
  if (match) return Number(match[1]) * 60 + Number(match[2]);
  const asNumber = Number(trimmed);
  return Number.isFinite(asNumber) ? Math.round(asNumber * 60) : null;
}

export function CreateCrewModal({
  onClose,
  onCreated
}: {
  onClose: () => void;
  onCreated: (crew: { crewId: string; crewName: string }) => void;
}) {
  const [crewName, setCrewName] = useState('');
  const [description, setDescription] = useState('');
  const [regionCode, setRegionCode] = useState('');
  const [meetingLocation, setMeetingLocation] = useState('');
  const [meetingLocationAny, setMeetingLocationAny] = useState(false);
  const [distanceMinKm, setDistanceMinKm] = useState('');
  const [distanceMaxKm, setDistanceMaxKm] = useState('');
  const [distanceAny, setDistanceAny] = useState(false);
  const [paceMinText, setPaceMinText] = useState('');
  const [paceMaxText, setPaceMaxText] = useState('');
  const [paceAny, setPaceAny] = useState(false);
  const [minimumWeeklyFrequency, setMinimumWeeklyFrequency] = useState('');
  const [joinType, setJoinType] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
  const [maxMembers, setMaxMembers] = useState('30');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (crewName.trim().length === 0) {
      setError('크루 이름을 입력해주세요.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/crew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crewName: crewName.trim(),
          description,
          regionCode: regionCode || null,
          meetingLocation: meetingLocationAny ? null : meetingLocation,
          targetDistanceMinM: !distanceAny && distanceMinKm ? Math.round(Number(distanceMinKm) * 1000) : null,
          targetDistanceMaxM: !distanceAny && distanceMaxKm ? Math.round(Number(distanceMaxKm) * 1000) : null,
          paceMinSecPerKm: paceAny ? null : parsePaceToSec(paceMinText),
          paceMaxSecPerKm: paceAny ? null : parsePaceToSec(paceMaxText),
          minimumWeeklyFrequency: minimumWeeklyFrequency ? Number(minimumWeeklyFrequency) : null,
          joinType,
          maxMembers: Number(maxMembers)
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? '크루 생성에 실패했어요.');
        return;
      }
      onCreated({ crewId: data.crewId, crewName: crewName.trim() });
    } catch {
      setError('네트워크 오류가 발생했어요.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="crew-chat-overlay" onClick={onClose}>
      <div className="crew-detail-modal" onClick={(event) => event.stopPropagation()}>
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="crew-chat-modal-head">
            <strong>러닝크루 만들기</strong>
            <button type="button" onClick={onClose} aria-label="닫기">✕</button>
          </div>

          <label>
            크루 이름
            <input value={crewName} onChange={(event) => setCrewName(event.target.value)} maxLength={50} />
          </label>
          <label>
            소개
            <textarea
              className="review-textarea"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="크루를 소개해주세요."
            />
          </label>
          <label>
            활동 지역
            <select value={regionCode} onChange={(event) => setRegionCode(event.target.value)}>
              <option value="">지역 무관</option>
              {SEOUL_DISTRICTS.map((d) => (
                <option key={d.name} value={d.name}>{d.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="field-label-row">
              모임 장소
              <span className="field-any-checkbox">
                <input
                  type="checkbox"
                  checked={meetingLocationAny}
                  onChange={(event) => {
                    setMeetingLocationAny(event.target.checked);
                    if (event.target.checked) setMeetingLocation('');
                  }}
                />
                무관
              </span>
            </span>
            <input
              value={meetingLocation}
              onChange={(event) => setMeetingLocation(event.target.value)}
              placeholder="예: 종로3가역 5번출구"
              disabled={meetingLocationAny}
            />
          </label>
          <div className="review-rating-grid">
            <label style={{ gridColumn: '1 / -1' }}>
              <span className="field-label-row">
                목표 거리
                <span className="field-any-checkbox">
                  <input
                    type="checkbox"
                    checked={distanceAny}
                    onChange={(event) => {
                      setDistanceAny(event.target.checked);
                      if (event.target.checked) {
                        setDistanceMinKm('');
                        setDistanceMaxKm('');
                      }
                    }}
                  />
                  무관
                </span>
              </span>
            </label>
            <label>
              최소(km)
              <input
                type="number"
                min="0"
                step="0.5"
                value={distanceMinKm}
                onChange={(event) => setDistanceMinKm(event.target.value)}
                disabled={distanceAny}
              />
            </label>
            <label>
              최대(km)
              <input
                type="number"
                min="0"
                step="0.5"
                value={distanceMaxKm}
                onChange={(event) => setDistanceMaxKm(event.target.value)}
                disabled={distanceAny}
              />
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              <span className="field-label-row">
                페이스
                <span className="field-any-checkbox">
                  <input
                    type="checkbox"
                    checked={paceAny}
                    onChange={(event) => {
                      setPaceAny(event.target.checked);
                      if (event.target.checked) {
                        setPaceMinText('');
                        setPaceMaxText('');
                      }
                    }}
                  />
                  무관
                </span>
              </span>
            </label>
            <label>
              최소 (분'초, 예: 5'30)
              <input value={paceMinText} onChange={(event) => setPaceMinText(event.target.value)} placeholder="4'30" disabled={paceAny} />
            </label>
            <label>
              최대 (분'초)
              <input value={paceMaxText} onChange={(event) => setPaceMaxText(event.target.value)} placeholder="6'00" disabled={paceAny} />
            </label>
          </div>
          <label>
            최소 주간 모임 횟수
            <input type="number" min="0" value={minimumWeeklyFrequency} onChange={(event) => setMinimumWeeklyFrequency(event.target.value)} />
          </label>
          <label>
            가입 방식
            <div className="gender-buttons">
              <button type="button" className={joinType === 'PUBLIC' ? 'active' : ''} onClick={() => setJoinType('PUBLIC')}>
                신청방식(바로 입장)
              </button>
              <button type="button" className={joinType === 'PRIVATE' ? 'active' : ''} onClick={() => setJoinType('PRIVATE')}>
                허가방식(승인 필요)
              </button>
            </div>
          </label>
          <label>
            최대 인원
            <input type="number" min="1" value={maxMembers} onChange={(event) => setMaxMembers(event.target.value)} />
          </label>

          {error && <p className="field-error">{error}</p>}
          <button type="submit" className="primary-btn full-width" disabled={loading}>
            {loading ? '만드는 중...' : '크루 만들기'}
          </button>
        </form>
      </div>
    </div>
  );
}
