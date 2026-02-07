import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (!decoded) {
      return NextResponse.json(
        { message: 'Invalid token' },
        { status: 401 }
      );
    }

    await connectDB();

    const search = request.nextUrl.searchParams.get('search') || '';
    const users = await User.find({
      _id: { $ne: decoded.userId },
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ],
    })
      .select('name email avatar status lastSeen')
      .limit(50);

    return NextResponse.json(users);
  } catch (error: any) {
    return NextResponse.json(
      { message: error.message || 'Failed to fetch users' },
      { status: 500 }
    );
  }
}
