'use client';

import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';
import { useSocket } from '@/contexts/SocketContext';
import { FaPlay, FaPause, FaTrash } from 'react-icons/fa';
import { setMessageUpdateCallback } from './MessageInput';

interface Message {
  _id: string;
  chat?: { _id: string } | string;
  chatId?: string;
  sender: {
    _id: string;
    name: string;
    avatar?: string;
  };
  content: string;
  type: string;
  mediaUrl?: string;
  translatedContent?: Record<string, string>;
  createdAt: string;
}

const STORAGE_KEYS = { showTranslated: 'chat-show-translated', viewLanguage: 'chat-view-language' };

function getStoredShowTranslated(): boolean {
  if (typeof window === 'undefined') return true;
  const v = localStorage.getItem(STORAGE_KEYS.showTranslated);
  return v === null ? true : v === 'true';
}

function getStoredViewLanguage(): 'mine' | 'other' {
  if (typeof window === 'undefined') return 'mine';
  const v = localStorage.getItem(STORAGE_KEYS.viewLanguage);
  return (v === 'mine' || v === 'other') ? v : 'mine';
}

export default function MessageList() {
  const { user } = useAuth();
  const { selectedChat } = useChat();
  const { socket } = useSocket();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [loadingTranslatedAudioKey, setLoadingTranslatedAudioKey] = useState<string | null>(null);
  const [translatedAudioByKey, setTranslatedAudioByKey] = useState<Record<string, string>>({});
  const [showTranslated, setShowTranslated] = useState(() => getStoredShowTranslated());
  const [viewLanguage, setViewLanguage] = useState<'mine' | 'other'>(() => getStoredViewLanguage());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.showTranslated, String(showTranslated));
  }, [showTranslated]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.viewLanguage, viewLanguage);
  }, [viewLanguage]);

  // Expose message update function for MessageInput
  useEffect(() => {
    setMessageUpdateCallback((message: Message) => {
      if (selectedChat && message.chatId === selectedChat._id) {
        setMessages((prev) => {
          if (prev.some(m => m._id === message._id)) {
            return prev;
          }
          return [...prev, message];
        });
      }
    });

    return () => {
      setMessageUpdateCallback(() => {});
    };
  }, [selectedChat]);

  useEffect(() => {
    if (selectedChat) {
      fetchMessages();
      
      // Join the chat room when chat is selected
      if (socket) {
        socket.emit('joinChat', { chatId: selectedChat._id });
      }
    } else {
      setMessages([]);
    }

    return () => {
      // Leave chat room when chat is deselected
      if (socket && selectedChat) {
        socket.emit('leaveChat', { chatId: selectedChat._id });
      }
    };
  }, [selectedChat, socket]);

  useEffect(() => {
    if (socket && selectedChat) {
      const handleNewMessage = (message: Message & { chatId?: string }) => {
        console.log('Received new message via socket:', message);
        // Check if message belongs to current chat
        const messageChatId = message.chatId || (message as any).chat?._id || (message as any).chat;
        const selectedChatId = selectedChat._id.toString();
        const messageChatIdStr = messageChatId?.toString();
        
        if (messageChatIdStr === selectedChatId) {
          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some(m => m._id === message._id)) {
              console.log('Duplicate message ignored:', message._id);
              return prev;
            }
            console.log('Adding new message to state:', message._id);
            return [...prev, message];
          });
        } else {
          console.log('Message not for this chat. Message chatId:', messageChatIdStr, 'Selected chat:', selectedChatId);
        }
      };

      socket.on('newMessage', handleNewMessage);
      
      const handleConnect = () => {
        console.log('Socket connected, joining chat:', selectedChat._id);
        socket.emit('joinChat', { chatId: selectedChat._id });
      };
      
      if (socket.connected) {
        socket.emit('joinChat', { chatId: selectedChat._id });
      } else {
        socket.once('connect', handleConnect);
      }

      return () => {
        socket.off('newMessage', handleNewMessage);
        socket.off('connect', handleConnect);
      };
    }
  }, [socket, selectedChat, user]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    return () => {
      Object.values(translatedAudioByKey).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [translatedAudioByKey]);

  const fetchMessages = async () => {
    if (!selectedChat) return;

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/chats/${selectedChat._id}/messages`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setMessages(data);
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClearCurrentChat = async () => {
    if (!selectedChat) return;
    const confirmed = window.confirm(
      'This will permanently delete all messages in this chat for all participants. The chat itself will remain. Do you want to continue?'
    );
    if (!confirmed) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/chats/${selectedChat._id}/messages`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || 'Failed to delete messages');
      }

      setMessages([]);
    } catch (error) {
      console.error('Failed to delete messages:', error);
      alert('Failed to delete messages. Please try again.');
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const toggleAudio = (audioUrl: string) => {
    if (playingAudio === audioUrl) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
      setPlayingAudio(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.play().catch((error) => {
        console.error('Error playing audio:', error);
        setPlayingAudio(null);
      });
      setPlayingAudio(audioUrl);
      audio.onended = () => {
        setPlayingAudio(null);
        audioRef.current = null;
      };
      audio.onerror = () => {
        setPlayingAudio(null);
        audioRef.current = null;
      };
    }
  };

  const getTranslatedTranscript = (msg: Message, targetLang: string): string | null => {
    const tc = msg.translatedContent;
    if (!tc || typeof tc !== 'object' || Array.isArray(tc)) return null;
    return tc[targetLang] || tc.en || null;
  };

  const playTranslatedVoice = async (msg: Message, targetLang: string) => {
    const key = `${msg._id}:${targetLang}`;
    const cachedUrl = translatedAudioByKey[key];
    if (cachedUrl) {
      toggleAudio(cachedUrl);
      return;
    }

    setLoadingTranslatedAudioKey(key);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messageId: msg._id,
          targetLang,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || 'Failed to generate translated audio');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setTranslatedAudioByKey((prev) => ({ ...prev, [key]: url }));
      toggleAudio(url);
    } catch (error) {
      console.error('Failed to play translated voice:', error);
      alert('Unable to generate translated voice right now.');
    } finally {
      setLoadingTranslatedAudioKey(null);
    }
  };

  if (!selectedChat) {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center bg-app-surface">
        <div className="text-center px-6">
          <p className="text-stone-400 text-base">Select a chat to start messaging</p>
        </div>
      </div>
    );
  }

  const otherUser = selectedChat.participants.find((p) => p._id !== user?._id) || selectedChat.participants[0];
  const myLang = (user as any)?.preferredLanguage || 'en';
  const otherLang = (otherUser as any)?.preferredLanguage || 'en';
  const displayLang = viewLanguage === 'other' ? otherLang : myLang;

  const getDisplayContent = (msg: Message) => {
    if (!showTranslated) return msg.content;
    const tc = msg.translatedContent;
    if (!tc || typeof tc !== 'object' || Array.isArray(tc)) return msg.content;
    const record = tc as Record<string, string>;
    const keys = Object.keys(record).filter((k) => record[k]);
    if (keys.length === 0) return msg.content;
    // Show the translation for the user's selected view language (e.g. English when "View: English")
    const preferred = record[displayLang];
    if (preferred) return preferred;
    // Fallback: try 'en' then original content (never show another language when user chose English)
    return record['en'] ?? msg.content;
  };
  const langNames: Record<string, string> = {
    en: 'English', ar: 'Arabic', hi: 'Hindi', es: 'Spanish', fr: 'French',
    de: 'German', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', pt: 'Portuguese',
    ru: 'Russian', ta: 'Tamil', te: 'Telugu', mr: 'Marathi', bn: 'Bengali',
  };
  const showLangSwitch = myLang !== otherLang;

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-app-surface">
      {/* Chat Header - flex-shrink-0 keeps it fixed at top */}
      <div className="flex-shrink-0 bg-app-header text-white px-4 py-3 flex items-center justify-between shadow-chat">
        <div className="w-10 h-10 rounded-full bg-app-primary flex items-center justify-center text-white font-medium overflow-hidden ring-2 ring-white/20">
          {(otherUser as any).avatar ? (
            <img src={(otherUser as any).avatar} alt="" className="w-full h-full object-cover" />
          ) : (
            otherUser.name.charAt(0).toUpperCase()
          )}
        </div>
        <div className="ml-3 flex-1 min-w-0">
          <h3 className="font-medium text-sm truncate">{otherUser.name}</h3>
          <p className="text-xs text-white/70 truncate">{(otherUser as any).status || 'Online'}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {showLangSwitch && (
            <select
              value={viewLanguage}
              onChange={(e) => setViewLanguage(e.target.value as 'mine' | 'other')}
              className="text-xs px-2.5 py-1 rounded-lg bg-white/10 text-white hover:bg-white/15 border-0 cursor-pointer focus:ring-1 focus:ring-white/30"
              title="View messages in your language or the other person's language"
            >
              <option value="mine">View: {langNames[myLang] || myLang}</option>
              <option value="other">View: {langNames[otherLang] || otherLang}</option>
            </select>
          )}
          {(() => {
            const hasAnyTranslation = messages.some((m) => m.translatedContent && Object.keys(m.translatedContent || {}).length > 0);
            return hasAnyTranslation ? (
              <button
                type="button"
                onClick={() => setShowTranslated(!showTranslated)}
                className="text-xs px-2.5 py-1 rounded-lg bg-white/10 text-white hover:bg-white/15 transition-colors"
                title={showTranslated ? 'Show original' : 'Show translated'}
              >
                {showTranslated ? '🌐 Original' : '👁️ Translated'}
              </button>
            ) : null;
          })()}
          <button
            type="button"
            onClick={handleClearCurrentChat}
            className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/15 transition-colors"
            title="Delete all messages in this chat"
          >
            <FaTrash className="w-4 h-4" />
          </button>
          {socket && (
            <div className={`w-2 h-2 rounded-full ${socket.connected ? 'bg-emerald-400' : 'bg-rose-400'}`} title={socket.connected ? 'Connected' : 'Disconnected'}></div>
          )}
        </div>
      </div>

      {/* Messages - min-h-0 allows flex child to shrink so overflow-y-auto scrolls properly */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 py-3 space-y-1" style={{ scrollBehavior: 'smooth' }}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-stone-200 border-t-app-primary"></div>
          </div>
        ) : (
          <>
            {messages.map((message) => {
              const isOwn = message.sender._id === user?._id;
              const showAvatar = !isOwn;

              return (
                <div
                  key={message._id}
                  className={`flex items-end ${isOwn ? 'justify-end' : 'justify-start'} gap-1.5 mb-2`}
                >
                  {showAvatar && (
                    <div className="w-7 h-7 rounded-full bg-app-primary flex items-center justify-center text-white text-xs flex-shrink-0 overflow-hidden">
                      {message.sender.avatar ? (
                        <img src={message.sender.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        message.sender.name.charAt(0).toUpperCase()
                      )}
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] sm:max-w-xs lg:max-w-md px-3.5 py-2 rounded-2xl shadow-chat ${
                      isOwn
                        ? 'bg-app-primary text-white'
                        : 'bg-white text-stone-800'
                    }`}
                  >
                    {message.type === 'voice' && message.mediaUrl ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => toggleAudio(message.mediaUrl!)}
                            className={`p-3 rounded-full transition-colors ${
                              isOwn
                                ? 'bg-white bg-opacity-20 hover:bg-opacity-30'
                                : 'bg-app-primary/20 hover:bg-app-primary/30'
                            }`}
                          >
                            {playingAudio === message.mediaUrl ? (
                              <FaPause className={`w-4 h-4 ${isOwn ? 'text-white' : 'text-app-primary'}`} />
                            ) : (
                              <FaPlay className={`w-4 h-4 ${isOwn ? 'text-white' : 'text-app-primary'}`} />
                            )}
                          </button>
                          <span className={`text-sm ${isOwn ? 'text-white' : 'text-gray-900'}`}>
                            🎤 Voice message
                          </span>
                          {(() => {
                            const transcriptOriginal = message.content && message.content !== 'Voice message'
                              ? message.content
                              : null;
                            const transcriptTranslated = getTranslatedTranscript(message, displayLang);
                            const canPlayTranslated = !!transcriptTranslated && transcriptTranslated !== transcriptOriginal;
                            const ttsKey = `${message._id}:${displayLang}`;
                            return canPlayTranslated ? (
                              <button
                                type="button"
                                onClick={() => playTranslatedVoice(message, displayLang)}
                                disabled={loadingTranslatedAudioKey === ttsKey}
                                className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
                                  isOwn
                                    ? 'bg-white/20 hover:bg-white/30 text-white'
                                    : 'bg-app-primary/20 hover:bg-app-primary/30 text-app-primary'
                                } disabled:opacity-60`}
                                title={`Play translated voice in ${langNames[displayLang] || displayLang}`}
                              >
                                {loadingTranslatedAudioKey === ttsKey ? 'Generating...' : '🌐 Play translated'}
                              </button>
                            ) : null;
                          })()}
                        </div>
                        {(() => {
                          const transcriptOriginal = message.content && message.content !== 'Voice message'
                            ? message.content
                            : null;
                          const transcriptTranslated = getTranslatedTranscript(message, displayLang);
                          return transcriptOriginal ? (
                            <div className="text-sm whitespace-pre-wrap break-words opacity-90 space-y-1">
                              <p>
                                <span className="font-medium">Transcript:</span> {transcriptOriginal}
                              </p>
                              {transcriptTranslated && transcriptTranslated !== transcriptOriginal && (
                                <p>
                                  <span className="font-medium">Translated:</span> {transcriptTranslated}
                                </p>
                              )}
                            </div>
                          ) : null;
                        })()}
                      </div>
                    ) : message.type === 'image' && message.mediaUrl ? (
                      <img
                        src={message.mediaUrl}
                        alt="Shared image"
                        className="max-w-full rounded-lg"
                      />
                    ) : (
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {getDisplayContent(message)}
                      </p>
                    )}
                    <span
                      className={`text-[11px] mt-1 block ${
                        isOwn ? 'text-white/80' : 'text-stone-400'
                      }`}
                    >
                      {format(new Date(message.createdAt), 'HH:mm')}
                    </span>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
    </div>
  );
}
