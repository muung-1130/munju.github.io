import { NextResponse } from 'next/server';
import { getShoeFilterOptions } from '@/lib/shoes';

export const dynamic = 'force-dynamic';

export async function GET() {
  const options = await getShoeFilterOptions();
  return NextResponse.json(options);
}
