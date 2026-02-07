const { Server: SocketIOServer } = require('socket.io');
const { verifyToken } = require('./auth');
const connectDB = require('./mongodb-server');
const Chat = require('../models/Chat');

const users = new Map();

function initializeSocket(server) {
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
      const chatId = chat._id.toString();
      socket.join(`chat:${chatId}`);
      console.log(`User ${userId} joined chat room: chat:${chatId}`);
    });

    // Handle joining a specific chat room
    socket.on('joinChat', (data) => {
      if (data.chatId) {
        socket.join(`chat:${data.chatId}`);
        console.log(`User ${userId} joined chat room: chat:${data.chatId}`);
      }
    });

    // Handle leaving a chat room
    socket.on('leaveChat', (data) => {
      if (data.chatId) {
        socket.leave(`chat:${data.chatId}`);
        console.log(`User ${userId} left chat room: chat:${data.chatId}`);
      }
    });

    // Handle sending messages
    socket.on('sendMessage', async (data) => {
      try {
        await connectDB();
        const chat = await Chat.findById(data.chatId);
        if (!chat || !chat.participants.some(p => p.toString() === userId)) {
          console.log('Chat not found or user not participant');
          return;
        }

        // Add chatId to message for filtering (ensure it's a string)
        const chatId = data.chatId.toString();
        const messageWithChatId = {
          ...data.message,
          chatId: chatId,
        };

        console.log(`Broadcasting message to chat:${chatId}`, messageWithChatId);
        
        // Get all sockets in the chat room
        const chatRoom = io.sockets.adapter.rooms.get(`chat:${chatId}`);
        console.log(`Sockets in chat:${chatId}:`, chatRoom ? Array.from(chatRoom).length : 0, 'sockets');
        
        // Broadcast to all users in the chat room (including sender for consistency)
        io.to(`chat:${chatId}`).emit('newMessage', messageWithChatId);
        
        console.log(`Message broadcasted to chat room: chat:${chatId}`);
      } catch (error) {
        console.error('Error sending message:', error);
      }
    });

    // Handle call initiation
    socket.on('initiateCall', async (data) => {
      try {
        await connectDB();
        const chat = await Chat.findById(data.chatId).populate('participants');
        if (!chat || !chat.participants.some((p) => p._id.toString() === userId)) {
          return;
        }

        const otherParticipant = chat.participants.find(
          (p) => p._id.toString() !== userId
        );

        if (otherParticipant) {
          const otherUser = users.get(otherParticipant._id.toString());
          if (otherUser) {
            // Get caller's name from database
            const User = require('../models/User').default;
            await connectDB();
            const caller = await User.findById(userId);
            const callerName = caller ? caller.name : 'User';
            
            io.to(otherUser.socketId).emit('incomingCall', {
              type: data.type,
              callerId: userId,
              callerName: callerName,
            });
            console.log(`Call initiated from ${userId} to ${otherParticipant._id.toString()}`);
          } else {
            console.log(`User ${otherParticipant._id.toString()} not online`);
          }
        }
      } catch (error) {
        console.error('Error initiating call:', error);
      }
    });

    // Handle call acceptance
    socket.on('acceptCall', (data) => {
      const caller = users.get(data.callerId);
      if (caller) {
        io.to(caller.socketId).emit('callAccepted', {
          type: data.type || 'video',
          callerId: userId,
        });
      }
    });

    // Handle call rejection
    socket.on('rejectCall', (data) => {
      const caller = users.get(data.callerId);
      if (caller) {
        io.to(caller.socketId).emit('callRejected');
      }
    });

    // Handle call ending
    socket.on('endCall', (data) => {
      if (data?.receiverId) {
        const receiver = users.get(data.receiverId);
        if (receiver) {
          io.to(receiver.socketId).emit('callEnded');
        }
      } else {
        socket.broadcast.emit('callEnded');
      }
    });

    // Handle call offer (WebRTC)
    socket.on('callOffer', async (data) => {
      try {
        await connectDB();
        const chat = await Chat.findById(data.chatId).populate('participants');
        if (!chat) return;

        const otherParticipant = chat.participants.find(
          (p) => p._id.toString() !== userId
        );

        if (otherParticipant) {
          const otherUser = users.get(otherParticipant._id.toString());
          if (otherUser) {
            io.to(otherUser.socketId).emit('callOffer', {
              offer: data.offer,
              type: data.type,
              from: userId,
            });
          }
        }
      } catch (error) {
        console.error('Error handling call offer:', error);
      }
    });

    // Handle call answer (WebRTC)
    socket.on('callAnswer', (data) => {
      const targetUser = users.get(data.to);
      if (targetUser) {
        console.log(`Sending call answer from ${userId} to ${data.to}`);
        io.to(targetUser.socketId).emit('callAnswer', {
          answer: data.answer,
          from: userId,
        });
      } else {
        console.log(`Target user ${data.to} not found for call answer`);
      }
    });

    // Handle ICE candidates (WebRTC)
    socket.on('iceCandidate', (data) => {
      const targetUser = users.get(data.to);
      if (targetUser) {
        console.log(`Sending ICE candidate from ${userId} to ${data.to}`);
        io.to(targetUser.socketId).emit('iceCandidate', {
          candidate: data.candidate,
          from: userId,
        });
      } else {
        console.log(`Target user ${data.to} not found for ICE candidate`);
      }
    });

    socket.on('disconnect', () => {
      users.delete(userId);
      console.log(`User disconnected: ${userId}`);
    });
  });

  return io;
}

module.exports = { initializeSocket };
