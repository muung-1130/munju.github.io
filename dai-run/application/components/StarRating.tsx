'use client';

import { useState, type MouseEvent } from 'react';

const STAR_COUNT = 5;

// 마우스를 별 영역 위에서 움직이면 0.5 단위로 미리보기 채움이 따라오다가, 클릭하면 그 값으로
// 고정된다. 고정된 뒤에는 다시 클릭하기 전까지 hover에 반응하지 않고, 다시 클릭하면 잠금이
// 풀려 다시 hover로 채우는 과정을 반복할 수 있다.
export function StarRating({
  value,
  onChange,
  size = 26
}: {
  value: number;
  onChange: (value: number) => void;
  size?: number;
}) {
  const [locked, setLocked] = useState(value > 0);
  const [previewValue, setPreviewValue] = useState<number | null>(null);

  const displayValue = !locked && previewValue !== null ? previewValue : value;

  function valueFromPointer(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    return Math.max(0.5, Math.round(ratio * STAR_COUNT * 2) / 2);
  }

  function handleMouseMove(event: MouseEvent<HTMLDivElement>) {
    if (locked) return;
    setPreviewValue(valueFromPointer(event));
  }

  function handleMouseLeave() {
    if (locked) return;
    setPreviewValue(null);
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (locked) {
      setLocked(false);
      setPreviewValue(null);
      return;
    }
    const picked = valueFromPointer(event);
    onChange(picked);
    setLocked(true);
    setPreviewValue(null);
  }

  return (
    <div className="star-rating-row">
      <div
        className={`star-rating ${locked ? 'locked' : ''}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuenow={displayValue}
      >
        {Array.from({ length: STAR_COUNT }, (_, i) => {
          const fillRatio = Math.min(Math.max(displayValue - i, 0), 1);
          return (
            <span key={i} className="star-rating-star" style={{ width: size, height: size, fontSize: size }}>
              <span className="star-rating-star-bg">★</span>
              <span className="star-rating-star-fill" style={{ width: `${fillRatio * 100}%` }}>
                ★
              </span>
            </span>
          );
        })}
      </div>
      <span className="star-rating-value">{displayValue.toFixed(1)} / 5.0</span>
    </div>
  );
}
