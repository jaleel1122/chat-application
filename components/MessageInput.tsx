'use client';

import { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';
import { useSocket } from '@/contexts/SocketContext';
import { FaPaperPlane, FaMicrophone, FaImage, FaVideo, FaPhone } from 'react-icons/fa';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';

// Export function to trigger call modal
let triggerCallModal: ((type: 'audio' | 'video', isIncoming: boolean, callerId?: string, callerName?: string) => void) | null = null;

export function setTriggerCallModal(callback: ((type: 'audio' | 'video', isIncoming: boolean, callerId?: string, callerName?: string) => void) | null) {
  triggerCallModal = callback;
}

// Create a callback ref to update messages in MessageList
let messageUpdateCallback: ((message: any) => void) | null = null;

export function setMessageUpdateCallback(callback: ((message: any) => void) | null) {
  messageUpdateCallback = callback;
}

export default function MessageInput() {
  const { user } = useAuth();
  const { selectedChat } = useChat();
  const { socket } = useSocket();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isRecording, startRecording, stopRecording, audioBlob } = useVoiceRecorder();

  const sendMessage = async (content: string, type: string = 'text', mediaUrl?: string) => {
    if (!selectedChat || (!content && !mediaUrl) || sending) return;

    setSending(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/chats/${selectedChat._id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          content: content || (type === 'voice' ? 'Voice message' : ''),
          type,
          mediaUrl,
        }),
      });

      if (response.ok) {
        const newMessage = await response.json();
        const messageWithChatId = {
          ...newMessage,
          chatId: selectedChat._id.toString(),
        };
        
        // Immediately update local state for sender (optimistic update)
        if (messageUpdateCallback) {
          messageUpdateCallback(messageWithChatId);
        }
        
        // Emit to socket for broadcasting to other users
        if (socket) {
          if (socket.connected) {
            socket.emit('sendMessage', {
              chatId: selectedChat._id.toString(),
              message: messageWithChatId,
            });
          } else {
            console.warn('Socket not connected, attempting to reconnect...');
            socket.connect();
            socket.once('connect', () => {
              socket.emit('sendMessage', {
                chatId: selectedChat._id.toString(),
                message: messageWithChatId,
              });
            });
          }
        }
        
        setMessage('');
      } else {
        const error = await response.json();
        alert(error.message || 'Failed to send message');
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      sendMessage(message.trim());
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        const type = file.type.startsWith('image/') ? 'image' : 'file';
        sendMessage(file.name, type, data.url);
      } else {
        // Fallback to data URL if upload fails
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          const type = file.type.startsWith('image/') ? 'image' : 'file';
          sendMessage(file.name, type, dataUrl);
        };
        reader.readAsDataURL(file);
      }
    } catch (error) {
      console.error('Upload failed:', error);
      // Fallback to data URL
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const type = file.type.startsWith('image/') ? 'image' : 'file';
        sendMessage(file.name, type, dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleVoiceNote = async () => {
    if (isRecording) {
      const blob = await stopRecording();
      if (blob && blob.size > 0) {
        setSending(true);
        // Convert blob to data URL
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          if (dataUrl) {
            sendMessage('Voice message', 'voice', dataUrl).finally(() => {
              setSending(false);
            });
          } else {
            alert('Failed to process voice recording');
            setSending(false);
          }
        };
        reader.onerror = () => {
          alert('Failed to process voice recording');
          setSending(false);
        };
        reader.readAsDataURL(blob);
      } else {
        alert('Recording is too short or failed');
        setSending(false);
      }
    } else {
      try {
        await startRecording();
      } catch (error) {
        console.error('Failed to start recording:', error);
        alert('Failed to access microphone. Please check permissions.');
      }
    }
  };

  const initiateCall = async (type: 'audio' | 'video') => {
    if (!socket || !selectedChat) {
      alert('Please wait for connection...');
      return;
    }

    try {
      // Request permissions first
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video',
      });
      
      // Stop stream immediately - CallModal will get it again
      stream.getTracks().forEach(track => track.stop());

      // Show call modal immediately for caller
      const otherUser = selectedChat.participants.find((p) => p._id !== user?._id) || selectedChat.participants[0];
      if (triggerCallModal) {
        triggerCallModal(type, false, user?._id, user?.name);
      }

      // Emit call initiation
      socket.emit('initiateCall', {
        chatId: selectedChat._id,
        type,
      });
    } catch (error) {
      console.error('Failed to initiate call:', error);
      alert('Failed to access camera/microphone. Please check permissions.');
    }
  };

  if (!selectedChat) {
    return null;
  }

  return (
    <div className="flex-shrink-0 bg-white px-4 py-3 border-t border-stone-200/80">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            className="p-2.5 text-stone-500 hover:text-app-primary hover:bg-stone-100 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Send image"
          >
            <FaImage className="w-5 h-5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => initiateCall('audio')}
            disabled={sending}
            className="p-2.5 text-stone-500 hover:text-app-primary hover:bg-stone-100 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Audio call"
          >
            <FaPhone className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => initiateCall('video')}
            disabled={sending}
            className="p-2.5 text-stone-500 hover:text-app-primary hover:bg-stone-100 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Video call"
          >
            <FaVideo className="w-5 h-5" />
          </button>
        </div>

        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e as any);
            }
          }}
          placeholder="Type a message"
          className="flex-1 px-4 py-2.5 bg-stone-50/80 border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-app-primary/40 focus:border-app-primary text-stone-800 placeholder-stone-400 transition-colors disabled:opacity-70"
          disabled={sending}
        />

        <button
          type="button"
          onClick={handleVoiceNote}
          disabled={sending}
          className={`p-2.5 rounded-xl transition-colors ${
            isRecording
              ? 'bg-rose-500 text-white'
              : 'text-stone-500 hover:text-app-primary hover:bg-stone-100'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          title={isRecording ? 'Stop recording' : 'Record voice note'}
        >
          <FaMicrophone className="w-5 h-5" />
        </button>

        <button
          type="submit"
          disabled={!message.trim() || sending}
          className="p-2.5 bg-app-primary text-white rounded-xl hover:bg-app-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FaPaperPlane className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
}
