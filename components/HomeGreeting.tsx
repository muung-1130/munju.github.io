'use client';

import { useSession } from 'next-auth/react';

export function HomeGreeting() {
  const { data: session } = useSession();
  const greetingName = session?.user?.name ? `${session.user.name}님` : '러너님';

  // "데이런과"와 "함께" 사이는 줄바꿈이 되지 않는 공백( )으로 묶어서, 화면이 좁아 이
  // 줄이 감싸질 때 "데이런과 함께"와 "달려볼까요?" 사이에서만 끊기게 한다.
  return (
    <h1>
      안녕하세요, {greetingName}!<br />
      {`데이런과 함께 달려볼까요?`}
    </h1>
  );
}
