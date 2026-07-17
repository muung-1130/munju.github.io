'use client';

import { useSession } from 'next-auth/react';

export function HomeGreeting() {
  const { data: session } = useSession();
  const greetingName = session?.user?.name ? `${session.user.name}님` : '러너님';

  return (
    <h1>
      안녕하세요, {greetingName}!<br />
      데이런과 함께 달려볼까요?
    </h1>
  );
}
