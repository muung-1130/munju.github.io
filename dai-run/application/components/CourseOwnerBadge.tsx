import type { CourseOwnerProfile } from '@/lib/courseSocial';

// owner_user_id가 없는(관리자가 만든) 코스는 "관리자"라고만 표시하고 hover 프로필을 띄우지 않는다.
// 있으면 닉네임 + 누적 러닝 거리를 hover 시 보여준다. 순수 CSS :hover라 서버 컴포넌트로도 충분하다.
export function CourseOwnerBadge({ owner }: { owner: CourseOwnerProfile | null }) {
  if (!owner) {
    return (
      <span className="course-owner-badge">
        <span className="owner-name admin">관리자</span>
      </span>
    );
  }

  return (
    <span className="course-owner-badge clickable">
      <span className="owner-name">{owner.nickname}</span>
      <div className="course-owner-profile-popup">
        <strong>{owner.nickname}</strong>
        <span>누적 러닝 거리 {(owner.totalDistanceM / 1000).toFixed(1)}km</span>
      </div>
    </span>
  );
}
