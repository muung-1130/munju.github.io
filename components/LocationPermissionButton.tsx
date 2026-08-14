'use client';

import { useEffect, useState } from 'react';
import { useChat } from '@/components/ChatContext';

type PermissionState = 'unknown' | 'granted' | 'denied' | 'prompt' | 'unsupported';

// GeolocationPositionError.code: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT
function describeGeoError(code: number): string {
  if (code === 1) return '위치 권한이 거부되어 있어요. 브라우저 주소창 왼쪽 자물쇠 아이콘 → 사이트 설정에서 "위치"를 허용으로 바꾼 뒤 다시 시도해주세요.';
  if (code === 2) return '기기에서 현재 위치를 확인할 수 없었어요. GPS/Wi-Fi가 켜져 있는지 확인해주세요.';
  if (code === 3) return '위치를 가져오는 데 시간이 너무 오래 걸렸어요. 잠시 후 다시 시도해주세요.';
  return '위치 정보를 가져오지 못했어요.';
}

// 코스 탐색 등 위치 기반 기능이 계속 실패한다는 피드백이 있어서, 브라우저 권한 상태를 직접
// 확인하고 "위치 권한 허용"을 명시적으로 재시도할 수 있는 버튼을 홈페이지에도 둔다. 실패하면
// 그냥 조용히 넘어가지 않고 AI 챗봇 말풍선으로 구체적인 원인을 알려준다.
export function LocationPermissionButton() {
  const { addMessage } = useChat();
  const [state, setState] = useState<PermissionState>('unknown');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) {
      setState('unsupported');
      return;
    }
    if (!navigator.permissions?.query) return; // 일부 브라우저는 Permissions API 자체가 없음 — 버튼 클릭 시 바로 시도하는 걸로 대체
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((status) => {
        setState(status.state as PermissionState);
        status.onchange = () => setState(status.state as PermissionState);
      })
      .catch(() => {});
  }, []);

  function requestLocation() {
    if (!navigator.geolocation) {
      addMessage({ from: 'ai', text: '이 브라우저는 위치 정보 기능을 지원하지 않아요.' });
      return;
    }
    setChecking(true);
    navigator.geolocation.getCurrentPosition(
      () => {
        setChecking(false);
        setState('granted');
        addMessage({ from: 'ai', text: '위치 확인 완료! 이제 내 주변 코스를 정확하게 찾아드릴 수 있어요.' });
      },
      (error) => {
        setChecking(false);
        setState(error.code === 1 ? 'denied' : 'prompt');
        addMessage({ from: 'ai', text: describeGeoError(error.code) });
      },
      { timeout: 8000 }
    );
  }

  if (state === 'unsupported') return null;

  const label =
    state === 'granted' ? '위치 확인됨 (다시 확인)' : state === 'denied' ? '위치 권한이 거부됨 — 다시 시도' : '위치 권한 허용하기';

  return (
    <button type="button" className="location-permission-btn" onClick={requestLocation} disabled={checking}>
      {checking ? '위치 확인 중...' : label}
    </button>
  );
}
