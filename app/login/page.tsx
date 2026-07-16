'use client';

import { useRouter } from 'next/navigation';
import { AuthForms } from '@/components/AuthForms';

export default function LoginPage() {
  const router = useRouter();

  return (
    <div className="auth-page">
      <div className="auth-page-card">
        <AuthForms
          onAuthenticated={() => {
            router.push('/');
            router.refresh();
          }}
        />
      </div>
    </div>
  );
}
