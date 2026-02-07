'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { FaTimes, FaCamera } from 'react-icons/fa';

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'Hindi' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'ar', name: 'Arabic' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'mr', name: 'Marathi' },
  { code: 'bn', name: 'Bengali' },
];

interface EditProfileModalProps {
  onClose: () => void;
}

export default function EditProfileModal({ onClose }: EditProfileModalProps) {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [status, setStatus] = useState(user?.status ?? '');
  const [avatar, setAvatar] = useState(user?.avatar ?? '');
  const [preferredLanguage, setPreferredLanguage] = useState(user?.preferredLanguage ?? 'en');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync form state when user changes (e.g. after save or when modal opens)
  useEffect(() => {
    if (user) {
      setName(user.name ?? '');
      setStatus(user.status ?? '');
      setAvatar(user.avatar ?? '');
      setPreferredLanguage(user.preferredLanguage ?? 'en');
    }
  }, [user]);

  if (!user) return null;

  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (JPEG, PNG, etc.)');
      return;
    }
    setError('');
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Upload failed');
      }
      const { url } = await response.json();
      setAvatar(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload image');
    }
    e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await updateProfile({
        name: name.trim() || undefined,
        status: status.trim() || undefined,
        avatar: avatar || undefined,
        preferredLanguage: preferredLanguage || 'en',
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-modal w-full max-w-md overflow-hidden border border-stone-200/60"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-app-header text-white px-5 py-3.5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edit profile</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-app-header-hover rounded-xl transition-colors"
            aria-label="Close"
          >
            <FaTimes className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="text-sm text-rose-700 bg-rose-50 px-3 py-2.5 rounded-xl border border-rose-200/80">
              {error}
            </div>
          )}

          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={handleAvatarClick}
              className="relative group rounded-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-app-primary focus:ring-offset-2"
            >
              <div className="w-24 h-24 rounded-full bg-app-primary flex items-center justify-center text-white text-3xl font-semibold overflow-hidden ring-2 ring-stone-200/50">
                {avatar ? (
                  <img src={avatar} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  user.name.charAt(0).toUpperCase()
                )}
              </div>
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <FaCamera className="w-8 h-8 text-white" />
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <span className="text-sm text-stone-500">Click to change photo</span>
          </div>

          <div>
            <label htmlFor="edit-name" className="block text-sm font-medium text-stone-600 mb-1.5">
              Name
            </label>
            <input
              id="edit-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 bg-stone-50/80 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-app-primary/40 focus:border-app-primary text-stone-800"
              placeholder="Your name"
              maxLength={100}
            />
          </div>

          <div>
            <label htmlFor="edit-status" className="block text-sm font-medium text-stone-600 mb-1.5">
              Status
            </label>
            <input
              id="edit-status"
              type="text"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-4 py-2.5 bg-stone-50/80 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-app-primary/40 focus:border-app-primary text-stone-800"
              placeholder="What's on your mind?"
              maxLength={139}
            />
          </div>

          <div>
            <label htmlFor="edit-lang" className="block text-sm font-medium text-stone-600 mb-1.5">
              Preferred Language (for translations)
            </label>
            <select
              id="edit-lang"
              value={preferredLanguage}
              onChange={(e) => setPreferredLanguage(e.target.value)}
              className="w-full px-4 py-2.5 bg-stone-50/80 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-app-primary/40 focus:border-app-primary text-stone-800"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 border border-stone-200 rounded-xl text-stone-700 hover:bg-stone-50 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 px-4 bg-app-primary text-white rounded-xl hover:bg-app-primary-dark transition-colors disabled:opacity-60 font-medium"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
