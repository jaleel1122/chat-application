# Quick Setup Guide

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Set Up MongoDB Atlas

1. Go to https://www.mongodb.com/cloud/atlas
2. Sign up for a free account
3. Create a new cluster (free tier M0)
4. Click "Connect" → "Connect your application"
5. Copy the connection string (it looks like: `mongodb+srv://username:password@cluster.mongodb.net/`)

## Step 3: Create Environment File

Create a file named `.env.local` in the root directory:

```env
MONGODB_URI=mongodb+srv://YOUR_USERNAME:YOUR_PASSWORD@YOUR_CLUSTER.mongodb.net/chat-app?retryWrites=true&w=majority
NEXTAUTH_SECRET=your-super-secret-key-minimum-32-characters-long
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_SOCKET_URL=http://localhost:3000
```

**Important:**
- Replace `YOUR_USERNAME`, `YOUR_PASSWORD`, and `YOUR_CLUSTER` with your actual MongoDB credentials
- Generate a secure secret key for `NEXTAUTH_SECRET` (you can use: `openssl rand -base64 32` or any random 32+ character string)
- In MongoDB Atlas, make sure to:
  - Create a database user (Database Access)
  - Whitelist your IP address (Network Access) - use `0.0.0.0/0` for development

## Step 4: Run the Application

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

## Step 5: Test the Application

1. Open `http://localhost:3000` in your browser
2. Create a new account
3. Open another browser/incognito window and create another account
4. Start chatting between the two accounts!

## Troubleshooting

### Port Already in Use
If port 3000 is busy, change it:
```bash
PORT=3001 npm run dev
```

### MongoDB Connection Error
- Check your connection string in `.env.local`
- Verify your IP is whitelisted in MongoDB Atlas
- Make sure your database user has read/write permissions

### Socket.io Not Connecting
- Make sure you're using `npm run dev` (not `next dev`)
- Check that `NEXT_PUBLIC_SOCKET_URL` matches your server URL
- Check browser console for connection errors

### WebRTC Calls Not Working
- Grant camera/microphone permissions when prompted
- Use HTTPS in production (required for WebRTC)
- For production, you'll need a TURN server for users behind NAT/firewalls

## Next Steps

- Read the full [README.md](./README.md) for detailed documentation
- Customize the UI colors in `tailwind.config.js`
- Add cloud storage (AWS S3, Cloudinary) for better file handling
- Deploy to Vercel for production
