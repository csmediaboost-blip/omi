import { NextRequest, NextResponse } from 'next/server';
import { getUserTransactions } from '@/lib/db-service';

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '50');

    const transactions = await getUserTransactions(params.userId, limit);
    return NextResponse.json(transactions);
  } catch (error: any) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch transactions' },
      { status: 500 }
    );
  }
}
