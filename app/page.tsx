'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { FaComments, FaShieldAlt, FaGlobe, FaBolt } from 'react-icons/fa';

export default function Home() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-app-surface">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-app-surface border-t-app-primary"></div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-app-surface text-stone-800">
      <section className="max-w-6xl mx-auto px-6 py-16 md:py-24">
        <div className="grid gap-10 md:grid-cols-2 md:items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-app-primary/10 text-app-primary text-sm font-medium mb-5">
              <FaComments />
              Real-time messaging
            </div>
            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight mb-5">
              Chat smarter with fast, simple and secure conversations
            </h1>
            <p className="text-stone-600 text-lg leading-relaxed mb-8">
              This app helps teams and friends chat instantly, stay organized, and communicate across languages in one modern interface.
            </p>

            <div className="flex flex-wrap gap-3">
              {user ? (
                <Link
                  href="/chat"
                  className="px-6 py-3 rounded-xl bg-app-primary text-white font-medium hover:bg-app-primary-dark transition-colors"
                >
                  Go to Chat
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="px-6 py-3 rounded-xl bg-app-primary text-white font-medium hover:bg-app-primary-dark transition-colors"
                  >
                    Login / Sign Up
                  </Link>
                  <Link
                    href="/login"
                    className="px-6 py-3 rounded-xl border border-stone-300 text-stone-700 font-medium hover:bg-white transition-colors"
                  >
                    Explore Features
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 p-6 md:p-8 shadow-chat">
            <h2 className="text-2xl font-semibold mb-6">Why use this app?</h2>
            <div className="space-y-5">
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-app-primary/10 text-app-primary flex items-center justify-center flex-shrink-0">
                  <FaBolt />
                </div>
                <div>
                  <h3 className="font-medium">Instant messaging</h3>
                  <p className="text-stone-600 text-sm">Send and receive messages in real time without page refresh.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-app-primary/10 text-app-primary flex items-center justify-center flex-shrink-0">
                  <FaGlobe />
                </div>
                <div>
                  <h3 className="font-medium">Built-in translation</h3>
                  <p className="text-stone-600 text-sm">Talk with people in different languages and stay connected.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-app-primary/10 text-app-primary flex items-center justify-center flex-shrink-0">
                  <FaShieldAlt />
                </div>
                <div>
                  <h3 className="font-medium">Secure account access</h3>
                  <p className="text-stone-600 text-sm">Your chats stay tied to your account with token-based authentication.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
