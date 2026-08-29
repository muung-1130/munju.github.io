import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { decideJoinRequest } from '@/lib/crew';
import { publishCrewJoinRequestEvent } from '@/lib/kafka';

export async function POST(request: NextRequest, { params }: { params: { requestId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  const { approve } = await request.json();
  const result = await decideJoinRequest(params.requestId, session.user.id, Boolean(approve));
  if (!result) {
    return NextResponse.json({ error: '요청을 처리할 수 없어요.' }, { status: 404 });
  }

  if (approve) {
    // 승인 자체(crew_members 반영)는 이미 끝났고, 신청자에게 "채팅방에 들어가겠냐"는 알림을
    // 띄우는 건 Kafka 이벤트로 흘려보내 별도 consumer가 비동기로 notification.notifications에 적재한다.
    try {
      await publishCrewJoinRequestEvent(
        {
          joinRequestId: params.requestId,
          crewId: result.crewId,
          crewName: result.crewName,
          applicantUserId: result.applicantUserId,
          applicantNickname: result.applicantNickname,
          ownerUserId: result.ownerUserId,
          message: null
        },
        'JoinRequestApproved'
      );
    } catch (err) {
      console.error('JoinRequestApproved 이벤트 발행 실패:', err);
    }
  }

  return NextResponse.json({ success: true });
}
