import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { verifyToken } from './auth';
import connectDB from './mongodb';
import Chat from '@/models/Chat';
import Message from '@/models/Message';

interface SocketUser {
  userId: string;
  socketId: string;
}

const users: Map<string, SocketUser> = new Map();

export function initializeSocket(server: HTTPServer) {
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
    },
    path: '/api/socket',
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error'));
      }

      const decoded = verifyToken(token);
      if (!decoded) {
        return next(new Error('Invalid token'));
      }

      socket.data.userId = decoded.userId;
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.data.userId;
    users.set(userId, { userId, socketId: socket.id });

    console.log(`User connected: ${userId}`);

    // Join user's personal room
    socket.join(`user:${userId}`);

    // Get user's chats and join their rooms
    await connectDB();
    const userChats = await Chat.find({ participants: userId });
    userChats.forEach((chat) => {
      socket.join(`chat:${chat._id}`);
    });

    // Handle sending messages
    socket.on('sendMessage', async (data: { chatId: string; message: any }) => {
      try {
        await connectDB();
        const chat = await Chat.findById(data.chatId);
        if (!chat || !chat.participants.includes(userId)) {
          return;
        }

        // Broadcast to all users in the chat
        io.to(`chat:${data.chatId}`).emit('newMessage', data.message);
      } catch (error) {
        console.error('Error sending message:', error);
      }
    });

    // Handle call initiation
    socket.on('initiateCall', async (data: { chatId: string; type: 'audio' | 'video' }) => {
      try {
        await connectDB();
        const chat = await Chat.findById(data.chatId).populate('participants');
        if (!chat || !chat.participants.some((p: any) => p._id.toString() === userId)) {
          return;
        }

        const otherParticipant = chat.participants.find(
          (p: any) => p._id.toString() !== userId
        ) as any;

        if (otherParticipant) {
          const otherUser = users.get(otherParticipant._id.toString());
          if (otherUser) {
            io.to(otherUser.socketId).emit('incomingCall', {
              type: data.type,
              callerId: userId,
              callerName: 'User', // You can fetch the actual name from DB
            });
          }
        }
      } catch (error) {
        console.error('Error initiating call:', error);
      }
    });

    // Handle call acceptance
    socket.on('acceptCall', (data: { callerId: string }) => {
      const caller = users.get(data.callerId);
      if (caller) {
        io.to(caller.socketId).emit('callAccepted', {
          type: 'video', // You can pass the actual type
          callerId: userId,
        });
      }
    });

    // Handle call rejection
    socket.on('rejectCall', (data: { callerId: string }) => {
      const caller = users.get(data.callerId);
      if (caller) {
        io.to(caller.socketId).emit('callRejected');
      }
    });

    // Handle call ending
    socket.on('endCall', (data?: { receiverId?: string }) => {
      if (data?.receiverId) {
        const receiver = users.get(data.receiverId);
        if (receiver) {
          io.to(receiver.socketId).emit('callEnded');
        }
      } else {
        // Broadcast to all rooms user is in
        socket.broadcast.emit('callEnded');
      }
    });

    // Handle call offer (WebRTC)
    socket.on('callOffer', (data: { offer: RTCSessionDescriptionInit; type: 'audio' | 'video' }) => {
      // Forward offer to the other participant
      socket.broadcast.emit('callOffer', {
        offer: data.offer,
        type: data.type,
        from: userId,
      });
    });

    // Handle call answer (WebRTC)
    socket.on('callAnswer', (data: { answer: RTCSessionDescriptionInit; to: string }) => {
      const targetUser = users.get(data.to);
      if (targetUser) {
        io.to(targetUser.socketId).emit('callAnswer', {
          answer: data.answer,
          from: userId,
        });
      }
    });

    // Handle ICE candidates (WebRTC)
    socket.on('iceCandidate', (data: { candidate: RTCIceCandidateInit; to: string }) => {
      const targetUser = users.get(data.to);
      if (targetUser) {
        io.to(targetUser.socketId).emit('iceCandidate', {
          candidate: data.candidate,
          from: userId,
        });
      }
    });

    socket.on('disconnect', () => {
      users.delete(userId);
      console.log(`User disconnected: ${userId}`);
    });
  });

  return io;
}
