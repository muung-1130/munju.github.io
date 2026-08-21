import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { LikedCoursesSection } from '@/components/LikedCoursesSection';
import { getUserLikedCourses } from '@/lib/courseSocial';

export const dynamic = 'force-dynamic';

export default async function LikedCoursesPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const courses = userId ? await getUserLikedCourses(userId) : [];

  return (
    <div className="mypage-subpage">
      <Link href="/mypage" className="mypage-back-link">← 마이페이지</Link>
      <LikedCoursesSection courses={courses} />
    </div>
  );
}
