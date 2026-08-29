import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserShoePreferences, saveUserShoePreferences } from '@/lib/shoes';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  const preferences = await getUserShoePreferences(session.user.id);
  return NextResponse.json({ preferences });
}

const FOOT_TYPES = ['좁음', '보통', '넓음'];

function toScale1to5(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

function toNonNegativeIntOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }

  const body = await request.json();
  const cushionPreference = toScale1to5(body.cushionPreference);
  const gripPreference = toScale1to5(body.gripPreference);
  const stabilityPreference = toScale1to5(body.stabilityPreference);
  const responsivenessPreference = toScale1to5(body.responsivenessPreference);
  const distancePreference = toScale1to5(body.distancePreference);
  const footType = typeof body.footType === 'string' && FOOT_TYPES.includes(body.footType) ? body.footType : null;
  const budgetMin = toNonNegativeIntOrNull(body.budgetMin);
  const budgetMax = toNonNegativeIntOrNull(body.budgetMax);

  if (
    cushionPreference === null ||
    gripPreference === null ||
    stabilityPreference === null ||
    responsivenessPreference === null ||
    distancePreference === null
  ) {
    return NextResponse.json({ error: '선호도 값이 올바르지 않아요.' }, { status: 400 });
  }
  if (budgetMin !== null && budgetMax !== null && budgetMin > budgetMax) {
    return NextResponse.json({ error: '예산 범위를 확인해주세요.' }, { status: 400 });
  }

  await saveUserShoePreferences(session.user.id, {
    cushionPreference,
    gripPreference,
    stabilityPreference,
    responsivenessPreference,
    distancePreference,
    footType,
    budgetMin,
    budgetMax
  });

  return NextResponse.json({ success: true });
}
