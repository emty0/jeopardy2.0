import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { authClient } from '#/lib/auth-client'
import { createServerFn } from '@tanstack/react-start'
import { invite } from '#/db/schema'
import { eq, and, isNull, gt } from 'drizzle-orm'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { ShieldX } from 'lucide-react'
import { Button, FormField, Input, Wordmark } from '#/components/ui'

const validateInvite = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ token: z.string() }))
  .handler(async ({ data }) => {
    const { db } = await import('#/db/index')

    const now = new Date()
    const inv = await db
      .select()
      .from(invite)
      .where(
        and(eq(invite.id, data.token), isNull(invite.usedAt), gt(invite.expiresAt, now)),
      )
      .get()
    return { valid: !!inv, email: inv?.email ?? null }
  })

const completeRegistration = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      token: z.string(),
      email: z.string().email(),
      username: z.string().min(2),
      password: z.string().min(8),
      name: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const { db } = await import('#/db/index')

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
    if (!token) {
      setValid(false)
      return
    }
    validateInvite({ data: { token } }).then(res => {
      setValid(res.valid)
      setInviteEmail(res.email)
    })
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail || !token) return
    if (form.password !== form.confirm) {
      setError('Passwörter stimmen nicht überein.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await completeRegistration({
        data: {
          token,
          email: inviteEmail,
          username: form.username,
          password: form.password,
          name: form.name,
        },
      })
      const { error: err } = await authClient.signUp.email({
        email: inviteEmail,
        password: form.password,
        name: form.name,
        username: form.username,
      } as Parameters<typeof authClient.signUp.email>[0])
      if (err) throw new Error(err.message)
      await navigate({ to: '/' })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fehler bei der Registrierung.')
    } finally {
      setLoading(false)
    }
  }

  if (valid === null) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
        <p className="text-ink-300 animate-pulse">Einladung wird geprüft…</p>
      </div>
    )
  }

  if (!valid) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-bad/15 border-2 border-bad/30 flex items-center justify-center mx-auto mb-4">
            <ShieldX className="w-8 h-8 text-bad" />
          </div>
          <h1 className="font-board uppercase tracking-wider text-3xl text-ink-50 mb-2">
            Ungültige Einladung
          </h1>
          <p className="text-ink-300">Der Einladungslink ist ungültig oder abgelaufen.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-6">
          <Wordmark size="lg" className="mb-3" />
        </div>
        <div className="rounded-3xl bg-bg-900/80 border border-bg-700 backdrop-blur-md p-6 sm:p-8 shadow-[0_30px_80px_-20px_rgb(0_0_0_/_0.6)]">
          <h1 className="font-board uppercase tracking-wider text-2xl text-ink-50 mb-1 text-center">
            Konto erstellen
          </h1>
          <p className="text-center text-sm text-ink-300 mb-6">
            Eingeladen als{' '}
            <span className="text-cyan-300 font-semibold">{inviteEmail}</span>
          </p>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <FormField label="Name">
              <Input
                type="text"
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Dein Name"
              />
            </FormField>
            <FormField label="Benutzername" hint="Eindeutig, mind. 2 Zeichen">
              <Input
                type="text"
                required
                minLength={2}
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                placeholder="einzigartiger_name"
              />
            </FormField>
            <FormField label="Passwort" hint="Mind. 8 Zeichen">
              <Input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="••••••••"
              />
            </FormField>
            <FormField label="Passwort bestätigen" error={error || undefined}>
              <Input
                type="password"
                required
                value={form.confirm}
                onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                placeholder="••••••••"
              />
            </FormField>
            <Button type="submit" variant="primary" size="lg" fullWidth disabled={loading}>
              {loading ? 'Konto wird erstellt…' : 'Registrieren'}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  )
}
