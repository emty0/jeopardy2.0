import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { db } from '#/db/index'
import { invite } from '#/db/schema'
import { desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { auth } from '#/lib/auth'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'

const getInvites = createServerFn({ method: 'GET' }).handler(async () => {
  const invites = await db
    .select({
      id: invite.id,
      email: invite.email,
      usedAt: invite.usedAt,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    })
    .from(invite)
    .orderBy(desc(invite.createdAt))
    .all()
  return invites
})

const sendInvite = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ email: z.string().email() }))
  .handler(async ({ data }) => {
    const request = getRequest()
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) throw new Error('Nicht angemeldet')
    const token = nanoid(8)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await db.insert(invite).values({
      id: token,
      email: data.email,
      invitedById: session!.user.id,
      expiresAt,
    })
    const link = `${process.env.BETTER_AUTH_URL || 'http://localhost:3000'}/auth/register?token=${token}`
    return { token, link }
  })

export const Route = createFileRoute('/admin/invites')({
  loader: async () => {
    const request = getRequest()
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) throw redirect({ to: '/auth/login' })
    const invites = await getInvites()
    return { invites }
  },
  component: InvitesPage,
})

function InvitesPage() {
  const { invites: initialInvites } = Route.useLoaderData()
  const [invites, setInvites] = useState(initialInvites)
  const [email, setEmail] = useState('')
  const [result, setResult] = useState<{ token: string; link: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await sendInvite({ data: { email } })
      setResult(res)
      setEmail('')
      const updated = await getInvites()
      setInvites(updated)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fehler')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Einladungen verwalten</h1>

      <form onSubmit={handleSend} className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-6">
        <h2 className="font-semibold mb-4">Neue Einladung</h2>
        <div className="flex gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="email@beispiel.de"
            className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-yellow-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-bold rounded-lg transition-colors"
          >
            {loading ? '…' : 'Einladen'}
          </button>
        </div>
        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
        {result && (
          <div className="mt-3 p-3 bg-neutral-800 rounded-lg">
            <p className="text-sm text-neutral-400 mb-1">Einladungslink:</p>
            <p className="text-yellow-400 text-sm break-all font-mono">{result.link}</p>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(result.link)}
              className="mt-2 text-xs text-neutral-400 hover:text-white transition-colors"
            >
              In Zwischenablage kopieren
            </button>
          </div>
        )}
      </form>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-800 text-neutral-400">
            <tr>
              <th className="px-4 py-2 text-left">E-Mail</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Ablauf</th>
            </tr>
          </thead>
          <tbody>
            {invites.map(inv => (
              <tr key={inv.id} className="border-t border-neutral-800">
                <td className="px-4 py-2">{inv.email}</td>
                <td className="px-4 py-2">
                  {inv.usedAt ? (
                    <span className="text-green-400">Genutzt</span>
                  ) : new Date(inv.expiresAt) < new Date() ? (
                    <span className="text-red-400">Abgelaufen</span>
                  ) : (
                    <span className="text-yellow-400">Offen</span>
                  )}
                </td>
                <td className="px-4 py-2 text-neutral-400">
                  {new Date(inv.expiresAt).toLocaleDateString('de-DE')}
                </td>
              </tr>
            ))}
            {invites.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-4 text-center text-neutral-500">Noch keine Einladungen</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
