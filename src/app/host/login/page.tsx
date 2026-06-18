'use client'

import { useState } from 'react'

import { createAuthBrowserClient } from '@/lib/supabase/auth-browser'

/**
 * OPTIONAL Sunday Account host login. Magic-link + Google via the SSO ISSUER
 * project. This is ONLY for the vert/host who wants a "my økts" dashboard —
 * players, joiners and displays never see or need this; they keep using session
 * codes. Anonymous hosting still works from the landing page.
 */
export default function HostLoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const supabase = createAuthBrowserClient()
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      if (error) throw error
      setSent(true)
    } catch {
      setError('Could not send the link — check the address and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function signInWithGoogle() {
    const supabase = createAuthBrowserClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-[#F0BB47]">SundayMarket</h1>
        <p className="mt-2 text-[#8A9BB0] text-sm">
          Host sign-in — see and manage the games you have created.
        </p>
      </div>

      <div className="w-full max-w-sm space-y-4">
        {sent ? (
          <div className="bg-[#1A2D42] border border-[#243D57] rounded-xl px-4 py-4 text-sm text-[#F0EEE9]">
            Check the inbox for <b>{email}</b> — we have sent you a sign-in link.
          </div>
        ) : (
          <form onSubmit={sendMagicLink} className="space-y-3">
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@church.org"
              autoComplete="email"
              className="w-full bg-[#1A2D42] border border-[#243D57] rounded-xl px-4 py-3 text-[#F0EEE9] placeholder-[#8A9BB0] focus:outline-none focus:border-[#F0BB47]"
            />
            {error && <p className="text-[#E07B39] text-sm text-center">{error}</p>}
            <button
              disabled={busy}
              className="w-full bg-[#F0BB47] text-[#0D1B2A] font-bold py-3 rounded-xl disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send sign-in link'}
            </button>
          </form>
        )}

        <button
          onClick={signInWithGoogle}
          className="w-full bg-[#1A2D42] border border-[#243D57] text-[#F0EEE9] font-medium py-3 rounded-xl hover:border-[#F0BB47] transition-colors"
        >
          Sign in with Sunday Account (Google)
        </button>

        <a
          href="/"
          className="block text-center text-[#8A9BB0] text-sm hover:text-[#F0EEE9] transition-colors"
        >
          ← Back, or host anonymously
        </a>
      </div>
    </main>
  )
}
