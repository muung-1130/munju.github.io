'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useAuthModal } from './AuthModalContext';

export function CourseLikeButton({
  courseId,
  initialLiked,
  initialCount
}: {
  courseId: string;
  initialLiked: boolean;
  initialCount: number;
}) {
  const { data: session } = useSession();
  const { openAuthModal } = useAuthModal();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (!session?.user) {
      openAuthModal();
      return;
    }
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/like`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setLiked(data.likedByUser);
        setCount(data.likeCount);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <button type="button" className={`course-like-btn ${liked ? 'liked' : ''}`} onClick={handleClick} disabled={pending}>
      <span className="heart">{liked ? '❤️' : '🤍'}</span>
      {liked ? '찜 완료' : '찜하기'} {count > 0 && `· ${count}`}
    </button>
  );
}
