import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { authClient } from '#/lib/auth-client'
import { createServerFn } from '@tanstack/react-start'
import { db } from '#/db/index'
import { invite } from '#/db/schema'
import { eq, and, isNull, gt } from 'drizzle-orm'
import { z } from 'zod'

const validateInvite = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ token: z.string() }))
  .handler(async ({ data }) => {
    const now = new Date()
    const inv = await db
      .select()
      .from(invite)
      .where(
        and(
          eq(invite.id, data.token),
          isNull(invite.usedAt),
          gt(invite.expiresAt, now),
        ),
      )
      .get()
    return { valid: !!inv, email: inv?.email ?? null }
  })

const completeRegistration = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ token: z.string(), email: z.string().email(), username: z.string().min(2), password: z.string().min(8), name: z.string().min(1) }))
  .handler(async ({ data }) => {
    const now = new Date()
    const inv = await db
      .select()
      .from(invite)
      .where(and(eq(invite.id, data.token), isNull(invite.usedAt), gt(invite.expiresAt, now)))
      .get()
    if (!inv) throw new Error('Ungültige oder abgelaufene Einladung.')
    if (inv.email !== data.email) throw new Error('E-Mail stimmt nicht mit der Einladung überein.')
    await db.update(invite).set({ usedAt: now }).where(eq(invite.id, data.token))
    return { ok: true }
  })

export const Route = createFileRoute('/auth/register')({
  validateSearch: z.object({ token: z.string().optional() }),
  component: RegisterPage,
})

function RegisterPage() {
  const { token } = useSearch({ from: '/auth/register' })
  const navigate = useNavigate()
  const [inviteEmail, setInviteEmail] = useState<string | null>(null)
  const [valid, setValid] = useState<boolean | null>(null)
  const [form, setForm] = useState({ name: '', username: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!token) { setValid(false); return }
    validateInvite({ data: { token } }).then(res => {
      setValid(res.valid)
      setInviteEmail(res.email)
    })
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail || !token) return
    if (form.password !== form.confirm) { setError('Passwörter stimmen nicht überein.'); return }
    setError('')
    setLoading(true)
    try {
      await completeRegistration({ data: { token, email: inviteEmail, username: form.username, password: form.password, name: form.name } })
      const { error: err } = await authClient.signUp.email({ email: inviteEmail, password: form.password, name: form.name, username: form.username } as Parameters<typeof authClient.signUp.email>[0])
      if (err) throw new Error(err.message)
      await navigate({ to: '/' })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fehler bei der Registrierung.')
    } finally {
      setLoading(false)
    }
  }

  if (valid === null) {
    return <div className="flex items-center justify-center min-h-[80vh]"><p className="text-neutral-400">Einladung wird geprüft…</p></div>
  }

  if (!valid) {
    return (
      <div className="flex items-center justify-center min-h-[80vh] px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-400 mb-2">Ungültige Einladung</h1>
          <p className="text-neutral-400">Der Einladungslink ist ungültig oder abgelaufen.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-[80vh] px-4">
      <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-xl p-8">
        <h1 className="text-2xl font-bold text-center mb-2">Konto erstellen</h1>
        <p className="text-center text-sm text-neutral-400 mb-6">Eingeladen als: <span className="text-yellow-400">{inviteEmail}</span></p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-neutral-400 mb-1">Name</label>
            <input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-yellow-500" placeholder="Dein Name" />
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-1">Benutzername</label>
            <input type="text" required value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-yellow-500" placeholder="einzigartiger_name" />
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-1">Passwort</label>
            <input type="password" required minLength={8} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-yellow-500" placeholder="Min. 8 Zeichen" />
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-1">Passwort bestätigen</label>
            <input type="password" required value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-yellow-500" placeholder="••••••••" />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-bold py-2 rounded-lg transition-colors">
            {loading ? 'Konto wird erstellt…' : 'Registrieren'}
          </button>
        </form>
      </div>
    </div>
  )
}
