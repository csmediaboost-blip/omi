import { NextRequest, NextResponse } from 'next/server';
import { getUserProfile, updateUserProfile, getUserTransactions } from '@/lib/db-service';

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const profile = await getUserProfile(params.userId);
    return NextResponse.json(profile);
  } catch (error: any) {
    console.error('Error fetching profile:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch profile' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const updates = await req.json();
    await updateUserProfile(params.userId, updates);
    
    const updatedProfile = await getUserProfile(params.userId);
    return NextResponse.json(updatedProfile);
  } catch (error: any) {
    console.error('Error updating profile:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update profile' },
      { status: 500 }
    );
  }
}
