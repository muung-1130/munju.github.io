import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCrewJoinType, createJoinRequest, getOtherActiveCrewMembership } from '@/lib/crew';
import { publishCrewJoinRequestEvent } from '@/lib/kafka';

export async function POST(request: NextRequest, { params }: { params: { crewId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }

  const crew = await getCrewJoinType(params.crewId);
  if (!crew) {
    return NextResponse.json({ error: '크루를 찾을 수 없어요.' }, { status: 404 });
  }
  if (crew.joinType !== 'PRIVATE') {
    return NextResponse.json({ error: '이 크루는 신청 없이 바로 입장할 수 있어요.' }, { status: 400 });
  }

  // 크루는 한 사람당 하나만 가입할 수 있다. 이미 다른 크루에 가입돼 있으면 먼저 탈퇴하도록 안내한다.
  const other = await getOtherActiveCrewMembership(session.user.id, params.crewId);
  if (other) {
    return NextResponse.json(
      { error: `이미 '${other.crewName}' 크루에 가입되어 있어요. 먼저 크루를 탈퇴한 뒤 다시 시도해주세요.` },
      { status: 409 }
    );
  }

  const { message } = await request.json();
  const trimmedMessage = typeof message === 'string' ? message.trim().slice(0, 500) : '';
  const joinRequestId = await createJoinRequest(params.crewId, session.user.id, trimmedMessage);
  if (!joinRequestId) {
    return NextResponse.json({ error: '이미 대기중인 가입 신청이 있어요.' }, { status: 409 });
  }

  // 크루장에게 알림을 띄우는 건 이 요청의 응답 속도에 영향을 주지 않도록 Kafka로 비동기 처리한다.
  // 발행이 실패해도(브로커 장애 등) 가입 신청 자체(crew_join_requests insert)는 이미 끝났으니
  // 사용자 응답은 그대로 성공으로 돌려준다.
  try {
    await publishCrewJoinRequestEvent(
      {
        joinRequestId,
        crewId: params.crewId,
        crewName: crew.crewName,
        applicantUserId: session.user.id,
        applicantNickname: session.user.name,
        ownerUserId: crew.ownerUserId,
        message: trimmedMessage || null
      },
      'JoinRequestSubmitted'
    );
  } catch (err) {
    console.error('JoinRequestSubmitted 이벤트 발행 실패:', err);
  }

  return NextResponse.json({ success: true });
}
