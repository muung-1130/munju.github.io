import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { recordCrewChatJoin, isActiveCrewMember, ensureCrewMember, getOtherActiveCrewMembership } from '@/lib/crew';
import { seedCrewChatIfEmpty, getCrewChatMessages } from '@/lib/crewChat';

export async function POST(request: Request, { params }: { params: { crewId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT c.crew_name, c.join_type, c.owner_user_id, u.nickname AS owner_nickname
       FROM crew.crews c JOIN auth_user.users u ON u.user_id = c.owner_user_id
      WHERE c.crew_id = $1`,
    [params.crewId]
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: '크루를 찾을 수 없어요.' }, { status: 404 });
  }
  const crew = rows[0];
  const alreadyMyCrew = await isActiveCrewMember(params.crewId, session.user.id);

  // 크루는 한 사람당 하나만 가입할 수 있다. 이미 다른 크루에 가입돼 있으면 먼저 탈퇴하도록 안내한다.
  if (!alreadyMyCrew) {
    const other = await getOtherActiveCrewMembership(session.user.id, params.crewId);
    if (other) {
      return NextResponse.json(
        { error: `이미 '${other.crewName}' 크루에 가입되어 있어요. 먼저 크루를 탈퇴한 뒤 다시 시도해주세요.` },
        { status: 409 }
      );
    }
  }

  // 허가방식(PRIVATE) 크루는 크루장 승인을 받아 정식 멤버(crew_members ACTIVE)가 되기 전까지
  // 채팅방에 들어올 수 없다. 크루장 본인은 예외.
  if (crew.join_type === 'PRIVATE' && crew.owner_user_id !== session.user.id && !alreadyMyCrew) {
    return NextResponse.json({ error: '크루장 승인이 필요한 크루예요. 가입 신청을 먼저 보내주세요.' }, { status: 403 });
  }

  await recordCrewChatJoin(params.crewId, session.user.id);
  await ensureCrewMember(params.crewId, session.user.id);
  await seedCrewChatIfEmpty(params.crewId, crew.crew_name, crew.owner_nickname);
  const messages = await getCrewChatMessages(params.crewId);

  return NextResponse.json({ messages });
}
