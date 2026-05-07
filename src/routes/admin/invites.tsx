import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { invite } from '#/db/schema'
import { desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'
import { Mail, Send, Copy, Check } from 'lucide-react'
import {
  Button,
  Card,
  FormField,
  Input,
  Pill,
  PageContainer,
  PageHeader,
} from '#/components/ui'

const getInvites = createServerFn({ method: 'GET' }).handler(async () => {
  const { db } = await import('#/db/index')

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
    const { auth } = await import('#/lib/auth')
    const { db } = await import('#/db/index')

    const request = getRequest()
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) throw new Error('Nicht angemeldet')
    const token = nanoid(8)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await db.insert(invite).values({
      id: token,
      email: data.email,
      invitedById: session.user.id,
      expiresAt,
    })
    const link = `${process.env.BETTER_AUTH_URL || 'http://localhost:3000'}/auth/register?token=${token}`
    const { sendInviteEmail } = await import('#/lib/email')
    await sendInviteEmail(data.email, link)
    return { token, link }
  })

export const Route = createFileRoute('/admin/invites')({
  loader: async () => {
    const { auth } = await import('#/lib/auth')
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
  const [copied, setCopied] = useState(false)
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

  function copyLink() {
    if (!result) return
    navigator.clipboard.writeText(result.link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <PageContainer size="md">
      <PageHeader
        eyebrow="Admin"
        title="Einladungen"
        subtitle="Versende und verwalte Registrierungs-Einladungen."
      />

      <Card className="p-6 mb-6">
        <h2 className="font-board uppercase tracking-wider text-lg text-ink-50 mb-4">
          Neue Einladung
        </h2>
        <form onSubmit={handleSend} className="flex flex-col gap-4">
          <FormField label="E-Mail-Adresse" error={error || undefined}>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none" />
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="email@beispiel.de"
                  className="pl-10"
                />
              </div>
              <Button
                type="submit"
                variant="primary"
                disabled={loading}
                leading={<Send className="w-4 h-4" />}
              >
                {loading ? 'Sende…' : 'Senden'}
              </Button>
            </div>
          </FormField>

          {result && (
            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-400 font-bold mb-2">
                Einladungslink
              </p>
              <p className="text-cyan-300 text-sm break-all font-mono">{result.link}</p>
              <button
                type="button"
                onClick={copyLink}
                className="mt-3 inline-flex items-center gap-1.5 text-xs text-ink-200 hover:text-cyan-300 transition-colors"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Kopiert' : 'In Zwischenablage kopieren'}
              </button>
            </div>
          )}
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-bg-700">
          <p className="font-board uppercase tracking-wider text-sm text-ink-50">
            Verlauf
          </p>
        </div>
        {invites.length === 0 ? (
          <p className="p-6 text-center text-ink-500 text-sm">Noch keine Einladungen</p>
        ) : (
          <ul className="divide-y divide-bg-700">
            {invites.map(inv => {
              const used = !!inv.usedAt
              const expired = !used && new Date(inv.expiresAt) < new Date()
              return (
                <li
                  key={inv.id}
                  className="flex items-center gap-3 px-5 py-3"
                >
                  <Mail className="w-4 h-4 text-ink-500 shrink-0" />
                  <span className="text-sm text-ink-50 flex-1 truncate">{inv.email}</span>
                  {used ? (
                    <Pill tone="good">Genutzt</Pill>
                  ) : expired ? (
                    <Pill tone="bad">Abgelaufen</Pill>
                  ) : (
                    <Pill tone="amber">Offen</Pill>
                  )}
                  <span className="text-xs text-ink-500 tabular-nums shrink-0">
                    {new Date(inv.expiresAt).toLocaleDateString('de-DE')}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </PageContainer>
  )
}
