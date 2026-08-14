'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const slides = [
  { key: 'courses', label: '코스 탐색', desc: 'AI가 추천하는 나만의 러닝 코스를 찾아보세요', color: '#3C6E71', href: '/courses' },
  { key: 'crew', label: '러닝크루', desc: '함께 달리는 러닝 크루에 참여해보세요', color: '#2c5457', href: '/crew' },
  { key: 'challenges', label: '챌린지', desc: '목표를 달성하고 나만의 배지를 모아보세요', color: '#1c4b6b', href: '/challenges' },
  { key: 'marathon', label: '마라톤', desc: '전국 마라톤 대회 일정과 코스를 확인하세요', color: '#2f6690', href: '/marathon' },
  { key: 'shoes', label: '러닝화', desc: '나에게 꼭 맞는 러닝화를 추천받아보세요', color: '#245073', href: '/shoes' }
];

export function FeatureBanner() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="feature-banner" aria-label="서비스 기능 배너">
      {slides.map((slide, i) => (
        <Link
          key={slide.key}
          href={slide.href}
          className={`feature-slide ${i === index ? 'active' : ''}`}
          style={{ background: slide.color }}
        >
          <div className="feature-slide-overlay">
            <span className="feature-slide-eyebrow">DAI RUN</span>
            <strong>{slide.label}</strong>
            <p>{slide.desc}</p>
          </div>
        </Link>
      ))}
      <div className="feature-banner-dots">
        {slides.map((slide, i) => (
          <i key={slide.key} className={i === index ? 'active' : ''} />
        ))}
      </div>
    </section>
  );
}
