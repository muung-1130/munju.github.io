import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ShoeOwnershipError, WEAR_IMAGE_ROLES, WearImageRole, requestShoeWearAnalysis } from '@/lib/shoeWearAnalysis';
import { getEditableUserShoe, setCustomThumbnailKey } from '@/lib/userShoes';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/webp']);

export async function POST(request: NextRequest, { params }: { params: { userShoeId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }

  const form = await request.formData();
  const purchaseDate = form.get('purchase_date');
  if (typeof purchaseDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) {
    return NextResponse.json({ error: '구매일을 YYYY-MM-DD 형식으로 입력해 주세요.' }, { status: 400 });
  }

  const images: Partial<Record<WearImageRole, { buffer: Buffer; filename: string; contentType: string }>> = {};
  for (const role of WEAR_IMAGE_ROLES) {
    const file = form.get(role);
    if (!(file instanceof File)) {
      return NextResponse.json({ error: `${role} 사진이 없어요. 5장을 모두 업로드해 주세요.` }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'JPG, PNG, WebP 파일만 업로드할 수 있어요.' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: '사진 1장의 크기는 5MB 이하여야 해요.' }, { status: 400 });
    }
    images[role] = {
      buffer: Buffer.from(await file.arrayBuffer()),
      filename: file.name || `${role}.jpg`,
      contentType: file.type
    };
  }

  try {
    const { httpStatus, body } = await requestShoeWearAnalysis({
      userId: session.user.id,
      userShoeId: params.userShoeId,
      purchaseDate,
      images: images as Record<WearImageRole, { buffer: Buffer; filename: string; contentType: string }>
    });
    if (httpStatus >= 500) {
      return NextResponse.json({ error: body?.detail ?? 'AI 분석 서비스 오류가 발생했어요.' }, { status: 502 });
    }
    if (httpStatus >= 400) {
      return NextResponse.json({ error: body?.detail ?? '요청을 처리할 수 없어요.' }, { status: httpStatus });
    }

    // 카탈로그 모델을 선택하지 않은 신발이면, 방금 분석에 쓴 측면 사진을 그대로 목록 썸네일로
    // 재사용한다 — 별도 업로드를 요구하지 않기 위함.
    if (body?.status === 'COMPLETED') {
      const thumbnailKey = body?.storage?.image_keys?.left_side;
      if (thumbnailKey) {
        const shoe = await getEditableUserShoe(session.user.id, params.userShoeId);
        if (shoe && shoe.shoeModelId === null) {
          await setCustomThumbnailKey(params.userShoeId, thumbnailKey);
        }
      }
    }

    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof ShoeOwnershipError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('shoe wear analysis failed', error);
    return NextResponse.json({ error: 'AI 분석 서비스에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.' }, { status: 502 });
  }
}
