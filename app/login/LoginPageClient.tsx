'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthForms } from '@/components/AuthForms';

// "/"로만 항상 보내면 /mypage처럼 로그인이 필요해서 이 페이지로 온 경우 원래 가려던 곳으로
// 못 돌아간다 — middleware.ts가 남긴 callbackUrl로 되돌아간다. 오픈 리다이렉트를 막기 위해
// "/"로 시작하고 "//"(프로토콜 상대 URL)로는 시작하지 않는 경로만 신뢰한다.
function safeCallbackUrl(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/';
}

function LoginPageContent({ demoLoginEnabled }: { demoLoginEnabled: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackUrl(searchParams.get('callbackUrl'));

  return (
    <div className="auth-page">
      <div className="auth-page-card">
        <AuthForms
          demoLoginEnabled={demoLoginEnabled}
          onAuthenticated={() => {
            router.push(callbackUrl);
            router.refresh();
          }}
        />
      </div>
    </div>
  );
}

// useSearchParams()는 정적 프리렌더링 시 Suspense 경계 없이는 빌드가 실패한다
// (https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout).
export function LoginPageClient({ demoLoginEnabled }: { demoLoginEnabled: boolean }) {
  return (
    <Suspense fallback={null}>
      <LoginPageContent demoLoginEnabled={demoLoginEnabled} />
    </Suspense>
  );
}
