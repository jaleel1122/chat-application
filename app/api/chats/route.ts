import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import Chat from '@/models/Chat';
import Message from '@/models/Message';
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

    const chats = await Chat.find({
      participants: decoded.userId,
    })
      .populate('participants', 'name email avatar status preferredLanguage')
      .sort({ updatedAt: -1 });

    return NextResponse.json(chats);
  } catch (error: any) {
    return NextResponse.json(
      { message: error.message || 'Failed to fetch chats' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
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

    if (!decoded || !decoded.userId) {
      return NextResponse.json(
        { message: 'Invalid token' },
        { status: 401 }
      );
    }

    if (!mongoose.Types.ObjectId.isValid(decoded.userId)) {
      return NextResponse.json(
        { message: 'Invalid user' },
        { status: 401 }
      );
    }

    await connectDB();

    const userObjectId = new mongoose.Types.ObjectId(decoded.userId);

    // Find all chats the user participates in
    const chats = await Chat.find({
      participants: userObjectId,
    }).select('_id');

    if (!chats.length) {
      return NextResponse.json(
        { message: 'No chats to clear' },
        { status: 200 }
      );
    }

    const chatIds = chats.map((c) => c._id);

    // Delete all messages belonging to those chats, but keep the chats themselves
    await Message.deleteMany({ chat: { $in: chatIds } });

    // Clear lastMessage on all affected chats so previews are accurate
    await Chat.updateMany(
      { _id: { $in: chatIds } },
      { $unset: { lastMessage: "" } }
    );

    return NextResponse.json(
      { message: 'Message history cleared successfully' },
      { status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete chats';
    console.error('DELETE /api/chats error:', error);
    return NextResponse.json(
      { message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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

    if (!decoded || !decoded.userId) {
      return NextResponse.json(
        { message: 'Invalid token' },
        { status: 401 }
      );
    }

    let body: { participantId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { participantId } = body;

    if (!participantId || typeof participantId !== 'string') {
      return NextResponse.json(
        { message: 'Participant ID is required' },
        { status: 400 }
      );
    }

    // Prevent chat with self
    if (participantId === decoded.userId) {
      return NextResponse.json(
        { message: 'Cannot start a chat with yourself' },
        { status: 400 }
      );
    }

    // Validate ObjectIds
    if (!mongoose.Types.ObjectId.isValid(decoded.userId)) {
      return NextResponse.json(
        { message: 'Invalid user' },
        { status: 401 }
      );
    }
    if (!mongoose.Types.ObjectId.isValid(participantId)) {
      return NextResponse.json(
        { message: 'Invalid participant' },
        { status: 400 }
      );
    }

    await connectDB();

    // Ensure participant exists
    const participant = await User.findById(participantId);
    if (!participant) {
      return NextResponse.json(
        { message: 'User not found' },
        { status: 404 }
      );
    }

    const currentUserId = new mongoose.Types.ObjectId(decoded.userId);
    const otherUserId = new mongoose.Types.ObjectId(participantId);

    // Check if chat already exists (don't populate lastMessage to avoid Message model on this connection)
    let chat = await Chat.findOne({
      participants: { $all: [currentUserId, otherUserId] },
    }).populate('participants', 'name email avatar status preferredLanguage');

    if (!chat) {
      chat = await Chat.create({
        participants: [currentUserId, otherUserId],
      });
      chat = await Chat.findById(chat._id).populate(
        'participants',
        'name email avatar status preferredLanguage'
      );
    }

    return NextResponse.json(chat);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create chat';
    console.error('POST /api/chats error:', error);
    return NextResponse.json(
      { message },
      { status: 500 }
    );
  }
}
