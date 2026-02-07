# WhatsApp Clone - Chat Application

A full-featured WhatsApp-like chat application built with Next.js, MongoDB Atlas, Socket.io, and WebRTC.

## Features

- ✅ **Real-time Messaging** - Instant message delivery using Socket.io
- ✅ **Voice Notes** - Record and send voice messages
- ✅ **Video Calls** - Make video calls using WebRTC
- ✅ **Audio Calls** - Make audio-only calls using WebRTC
- ✅ **Image Sharing** - Send and receive images
- ✅ **User Authentication** - Secure login and registration
- ✅ **WhatsApp-like UI** - Beautiful, modern interface inspired by WhatsApp

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes (Serverless)
- **Database**: MongoDB Atlas
- **Real-time**: Socket.io
- **Calls**: WebRTC
- **Authentication**: JWT

## Prerequisites

- Node.js 18+ installed
- MongoDB Atlas account (free tier works)
- npm or yarn

## Setup Instructions

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd chat-application
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/chat-app?retryWrites=true&w=majority
NEXTAUTH_SECRET=your-secret-key-here-minimum-32-characters
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_SOCKET_URL=http://localhost:3000
```

**Important**: 
- Replace `username` and `password` with your MongoDB Atlas credentials
- Replace `cluster.mongodb.net` with your actual cluster URL
- Generate a strong secret key for `NEXTAUTH_SECRET` (you can use: `openssl rand -base64 32`)

### 4. Set Up MongoDB Atlas

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. Create a database user
4. Whitelist your IP address (or use `0.0.0.0/0` for development)
5. Get your connection string and add it to `.env.local`

### 5. Run the Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Usage

### Creating an Account

1. Navigate to `http://localhost:3000`
2. Click "Sign up" if you don't have an account
3. Enter your name, email, and password
4. Click "Sign Up"

### Starting a Chat

1. Click the "+" button in the sidebar
2. Search for a user
3. Click on a user to start a chat

### Sending Messages

- **Text**: Type your message and press Enter or click the send button
- **Voice Note**: Click and hold the microphone button, release to send
- **Image**: Click the image icon and select an image

### Making Calls

- **Audio Call**: Click the phone icon in the message input
- **Video Call**: Click the video icon in the message input
- **During Call**: 
  - Click the microphone icon to mute/unmute
  - Click the video icon to turn video on/off (video calls only)
  - Click the red phone icon to end the call

## Project Structure

```
chat-application/
├── app/
│   ├── api/              # API routes (serverless)
│   ├── chat/             # Chat page
│   ├── login/            # Login page
│   └── layout.tsx        # Root layout
├── components/           # React components
│   ├── ChatList.tsx
│   ├── MessageList.tsx
│   ├── MessageInput.tsx
│   ├── UserList.tsx
│   └── CallModal.tsx
├── contexts/             # React contexts
│   ├── AuthContext.tsx
│   ├── ChatContext.tsx
│   └── SocketContext.tsx
├── hooks/                # Custom hooks
│   └── useVoiceRecorder.ts
├── lib/                  # Utility functions
│   ├── auth.ts
│   ├── mongodb.ts
│   └── socket.ts
├── models/               # MongoDB models
│   ├── User.ts
│   ├── Chat.ts
│   └── Message.ts
└── server.js             # Custom server with Socket.io
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

### Users
- `GET /api/users?search=query` - Search users

### Chats
- `GET /api/chats` - Get all chats for current user
- `POST /api/chats` - Create a new chat
- `GET /api/chats/[chatId]/messages` - Get messages in a chat
- `POST /api/chats/[chatId]/messages` - Send a message

### Upload
- `POST /api/upload` - Upload a file

## Production Deployment

### Recommended Platforms

1. **Vercel** (Recommended for Next.js)
   - Easy deployment
   - Built-in environment variables
   - Serverless functions support

2. **MongoDB Atlas**
   - Use production cluster
   - Set up proper security rules
   - Enable IP whitelisting

### Environment Variables for Production

Make sure to set all environment variables in your hosting platform:
- `MONGODB_URI`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL` (your production URL)
- `NEXT_PUBLIC_SOCKET_URL` (your production URL)

### Important Notes

- For production, consider using a cloud storage service (AWS S3, Cloudinary) for file uploads instead of base64
- Set up proper CORS settings
- Use HTTPS in production
- Consider using a TURN server for WebRTC calls (for users behind NAT/firewalls)
- Implement rate limiting for API routes
- Add proper error handling and logging

## Troubleshooting

### Socket.io Connection Issues
- Make sure `NEXT_PUBLIC_SOCKET_URL` matches your server URL
- Check that the custom server is running (`npm run dev`)

### MongoDB Connection Issues
- Verify your connection string in `.env.local`
- Check that your IP is whitelisted in MongoDB Atlas
- Ensure your database user has proper permissions

### WebRTC Call Issues
- Make sure you've granted camera/microphone permissions
- Check browser console for errors
- For production, you'll need a TURN server for users behind NAT

## License

MIT License - feel free to use this project for learning or as a starting point for your own applications.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
