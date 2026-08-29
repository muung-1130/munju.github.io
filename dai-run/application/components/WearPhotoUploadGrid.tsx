'use client';

import { useRef } from 'react';

export const WEAR_ROLE_LABELS: Record<string, string> = {
  left_outsole: '왼쪽 밑창 전체',
  right_outsole: '오른쪽 밑창 전체',
  heels: '양쪽 뒤꿈치 정면',
  left_side: '왼쪽 바깥쪽 측면',
  right_side: '오른쪽 바깥쪽 측면'
};
export const WEAR_ROLES = Object.keys(WEAR_ROLE_LABELS);

export function WearPhotoUploadGrid({
  files,
  onPick
}: {
  files: Partial<Record<string, File>>;
  onPick: (role: string, file: File | undefined) => void;
}) {
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  return (
    <div className="wear-upload-grid">
      {WEAR_ROLES.map((role) => (
        <div key={role} className="wear-upload-slot">
          <label>{WEAR_ROLE_LABELS[role]}</label>
          <button
            type="button"
            className={`wear-upload-box ${files[role] ? 'filled' : ''}`}
            onClick={() => inputRefs.current[role]?.click()}
          >
            {files[role] ? (
              <img src={URL.createObjectURL(files[role] as File)} alt={WEAR_ROLE_LABELS[role]} />
            ) : (
              <span>📷 사진 선택</span>
            )}
          </button>
          <input
            ref={(el) => {
              inputRefs.current[role] = el;
            }}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(event) => onPick(role, event.target.files?.[0])}
          />
        </div>
      ))}
    </div>
  );
}
