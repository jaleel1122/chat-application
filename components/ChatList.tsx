'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';
import { useSocket } from '@/contexts/SocketContext';

interface Chat {
  _id: string;
  participants: Array<{
    _id: string;
    name: string;
    email: string;
    avatar?: string;
    status?: string;
  }>;
  lastMessage?:
    | {
        content: string;
        type: string;
        createdAt: string;
      }
    | string;
  updatedAt: string;
}

export default function ChatList() {
  const { user } = useAuth();
  const { selectedChat, setSelectedChat } = useChat();
  const { socket } = useSocket();
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchChats();
  }, []);

  useEffect(() => {
    if (socket) {
      const handleNewMessage = (message: any) => {
        // Update chat list when new message arrives
        console.log('New message received, updating chat list');
        fetchChats();
      };

      socket.on('newMessage', handleNewMessage);

      return () => {
        socket.off('newMessage', handleNewMessage);
      };
    }
  }, [socket]);

  const fetchChats = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/chats', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setChats(data);
      }
    } catch (error) {
      console.error('Failed to fetch chats:', error);
    } finally {
      setLoading(false);
    }
  };

  const getOtherParticipant = (chat: Chat) => {
    return chat.participants.find((p) => p._id !== user?._id) || chat.participants[0];
  };

  const getLastMessagePreview = (chat: Chat) => {
    const last = chat.lastMessage;
    if (!last || typeof last === 'string') return 'No messages yet';
    const type = last.type;
    if (type === 'voice') return '🎤 Voice message';
    if (type === 'image') return '📷 Image';
    if (type === 'video') return '🎥 Video';
    return last.content;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-stone-200 border-t-app-primary"></div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-white">
      {chats.length === 0 ? (
        <div className="flex items-center justify-center h-full px-6">
          <p className="text-center text-stone-400 text-sm">No chats yet. Start a new conversation!</p>
        </div>
      ) : (
        <div>
          {chats.map((chat) => {
            const otherUser = getOtherParticipant(chat);
            const isSelected = selectedChat?._id === chat._id;

            return (
              <div
                key={chat._id}
                onClick={() => setSelectedChat(chat)}
                className={`flex items-center px-4 py-3 cursor-pointer transition-colors border-b border-stone-100 ${
                  isSelected ? 'bg-app-selected' : 'hover:bg-stone-50'
                }`}
              >
                <div className="flex-shrink-0">
                  <div className="w-11 h-11 rounded-full bg-app-primary flex items-center justify-center text-white font-medium text-sm ring-1 ring-stone-200/50 overflow-hidden">
                    {otherUser.avatar ? (
                      <img src={otherUser.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      otherUser.name.charAt(0).toUpperCase()
                    )}
                  </div>
                </div>
                <div className="ml-3 flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[15px] font-medium text-stone-800 truncate">
                      {otherUser.name}
                    </h3>
                    {chat.lastMessage &&
                      typeof chat.lastMessage === 'object' &&
                      chat.lastMessage.createdAt && (
                        <span className="text-xs text-stone-400 flex-shrink-0">
                          {format(
                            new Date(chat.lastMessage.createdAt),
                            'HH:mm'
                          )}
                        </span>
                      )}
                  </div>
                  <p className="text-sm text-stone-500 truncate mt-0.5">
                    {getLastMessagePreview(chat)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
