'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { ChatProvider } from '@/contexts/ChatContext';
import { SocketProvider } from '@/contexts/SocketContext';
import ChatList from '@/components/ChatList';
import MessageList from '@/components/MessageList';
import MessageInput from '@/components/MessageInput';
import UserList from '@/components/UserList';
import CallModal from '@/components/CallModal';
import EditProfileModal from '@/components/EditProfileModal';
import { FaSignOutAlt, FaUserPlus } from 'react-icons/fa';

function ChatContent() {
  const router = useRouter();
  const { user, logout, loading } = useAuth();
  const [showUserList, setShowUserList] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-app-surface">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-app-surface border-t-app-primary"></div>
      </div>
    );
  }

  return (
    <SocketProvider>
      <ChatProvider>
        <div className="flex h-screen bg-app-surface">
          {/* Sidebar */}
          <div className="w-1/3 flex flex-col border-r border-stone-200/80 bg-white shadow-chat min-w-[280px] max-w-[400px]">
            {/* Sidebar Header */}
            <div className="bg-app-header text-white px-4 py-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowEditProfile(true)}
                className="flex items-center flex-1 min-w-0 rounded-xl hover:bg-app-header-hover transition-colors text-left p-2 -m-2"
                title="Edit profile"
              >
                <div className="w-10 h-10 rounded-full bg-app-primary flex items-center justify-center text-white font-semibold flex-shrink-0 overflow-hidden ring-2 ring-white/20">
                  {user.avatar ? (
                    <img src={user.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    user.name.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="ml-3 min-w-0">
                  <h3 className="font-medium truncate text-sm">{user.name}</h3>
                  <p className="text-xs text-white/70 truncate">{user.status || 'Online'}</p>
                </div>
              </button>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowUserList(true)}
                  className="p-2.5 hover:bg-app-header-hover rounded-xl transition-colors"
                  title="New Chat"
                >
                  <FaUserPlus className="w-5 h-5" />
                </button>
                <button
                  onClick={handleLogout}
                  className="p-2.5 hover:bg-app-header-hover rounded-xl transition-colors"
                  title="Logout"
                >
                  <FaSignOutAlt className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Chat List */}
            <ChatList />
          </div>

          {/* Main Chat Area - min-h-0 + overflow-hidden keeps header/input fixed when messages scroll */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <MessageList />
            <MessageInput />
          </div>
        </div>

        {/* User List Modal */}
        {showUserList && (
          <UserList onClose={() => setShowUserList(false)} />
        )}

        {/* Edit Profile Modal */}
        {showEditProfile && (
          <EditProfileModal onClose={() => setShowEditProfile(false)} />
        )}

        {/* Call Modal */}
        <CallModal />
      </ChatProvider>
    </SocketProvider>
  );
}

export default function ChatPage() {
  return <ChatContent />;
}
