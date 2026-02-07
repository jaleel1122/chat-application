'use client';

import { useEffect, useState } from 'react';
import { useChat } from '@/contexts/ChatContext';
import { useAuth } from '@/contexts/AuthContext';
import { FaTimes } from 'react-icons/fa';

interface User {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
  status?: string;
}

interface UserListProps {
  onClose: () => void;
}

export default function UserList({ onClose }: UserListProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const { setSelectedChat } = useChat();
  const { user } = useAuth();

  useEffect(() => {
    fetchUsers();
  }, [search]);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/users?search=${encodeURIComponent(search)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  };

  const startChat = async (userId: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/chats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ participantId: userId }),
      });

      if (response.ok) {
        const chat = await response.json();
        setSelectedChat(chat);
        onClose();
      }
    } catch (error) {
      console.error('Failed to start chat:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col shadow-modal border border-stone-200/60 overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-200/80 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-stone-800">New Chat</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-stone-100 rounded-xl transition-colors text-stone-500"
          >
            <FaTimes className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-stone-100">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users..."
            className="w-full px-4 py-2.5 bg-stone-50/80 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-app-primary/40 focus:border-app-primary text-stone-800 placeholder-stone-400"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-stone-200 border-t-app-primary"></div>
            </div>
          ) : users.length === 0 ? (
            <p className="text-center text-stone-400 py-8 text-sm">No users found</p>
          ) : (
            <div className="space-y-1">
              {users.map((userItem) => (
                <div
                  key={userItem._id}
                  onClick={() => startChat(userItem._id)}
                  className="flex items-center p-3 cursor-pointer hover:bg-stone-50 rounded-xl transition-colors"
                >
                  <div className="w-11 h-11 rounded-full bg-app-primary flex items-center justify-center text-white font-medium text-sm overflow-hidden ring-1 ring-stone-200/50">
                    {userItem.avatar ? (
                      <img src={userItem.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      userItem.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="ml-3 flex-1 min-w-0">
                    <h3 className="font-medium text-stone-800 truncate">{userItem.name}</h3>
                    <p className="text-sm text-stone-500 truncate">{userItem.email}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
