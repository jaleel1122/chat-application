import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { verifyToken } from '@/lib/auth';

export async function PATCH(request: NextRequest) {
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

    const body = await request.json();
    const updates: { name?: string; email?: string; status?: string; avatar?: string; preferredLanguage?: string } = {};

    if (typeof body.name === 'string' && body.name.trim()) {
      updates.name = body.name.trim();
    }
    if (typeof body.email === 'string' && body.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const trimmedEmail = body.email.trim().toLowerCase();
      
      if (!emailRegex.test(trimmedEmail)) {
        return NextResponse.json(
          { message: 'Invalid email format' },
          { status: 400 }
        );
      }
      
      // Check if email is already taken by another user
      const existingUser = await User.findOne({ 
        email: trimmedEmail,
        _id: { $ne: decoded.userId }
      });
      
      if (existingUser) {
        return NextResponse.json(
          { message: 'Email is already in use' },
          { status: 400 }
        );
      }
      
      updates.email = trimmedEmail;
    }
    if (typeof body.status === 'string') {
      updates.status = body.status.trim();
    }
    if (typeof body.avatar === 'string') {
      updates.avatar = body.avatar;
    }
    if (typeof body.preferredLanguage === 'string' && body.preferredLanguage.trim()) {
      updates.preferredLanguage = body.preferredLanguage.trim();
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { message: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const user = await User.findByIdAndUpdate(
      decoded.userId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('name email avatar status preferredLanguage');

    if (!user) {
      return NextResponse.json(
        { message: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      status: user.status,
      preferredLanguage: user.preferredLanguage || 'en',
    });
  } catch (error: any) {
    return NextResponse.json(
      { message: error.message || 'Failed to update profile' },
      { status: 500 }
    );
  }
}
