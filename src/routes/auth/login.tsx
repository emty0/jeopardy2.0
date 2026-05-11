import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { authClient } from '#/lib/auth-client'
import { motion } from 'framer-motion'
import { Mail, Lock } from 'lucide-react'
import { z } from 'zod'
import { Button, FormField, Input, Wordmark } from '#/components/ui'

export const Route = createFileRoute('/auth/login')({
  component: LoginPage,
  validateSearch: z.object({ redirect: z.string().optional() }),
})

function LoginPage() {
  const navigate = useNavigate()
  const { redirect } = Route.useSearch()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await authClient.signIn.email({ email, password })
      setLoading(false)
      if (result.error) {
        setError(`Fehler: ${result.error.message ?? result.error.status ?? 'Unbekannt'}`)
      } else if (redirect && redirect.startsWith('/')) {
        window.location.href = redirect
      } else {
        await navigate({ to: '/' })
      }
    } catch (e: unknown) {
      setLoading(false)
      setError(`Ausnahme: ${e instanceof Error ? e.message : String(e)}`)
    }
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
          <p className="text-ink-300 text-sm">Willkommen zurück.</p>
        </div>
        <div className="rounded-3xl bg-bg-900/80 border border-bg-700 backdrop-blur-md p-6 sm:p-8 shadow-[0_30px_80px_-20px_rgb(0_0_0_/_0.6)]">
          <h1 className="font-board uppercase tracking-wider text-2xl text-ink-50 mb-6 text-center">
            Anmelden
          </h1>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <FormField label="E-Mail">
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none" />
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="deine@email.de"
                  className="pl-10"
                />
              </div>
            </FormField>
            <FormField label="Passwort" error={error || undefined}>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none" />
                <Input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10"
                />
              </div>
            </FormField>
            <Button type="submit" variant="primary" size="lg" fullWidth disabled={loading}>
              {loading ? 'Anmelden…' : 'Anmelden'}
            </Button>
          </form>
          <p className="text-center text-sm text-ink-500 mt-6">
            Noch kein Konto?{' '}
            <span className="text-ink-300">Registrierung nur per Einladung.</span>
          </p>
        </div>
        <p className="text-center text-xs text-ink-500 mt-4">
          <Link to="/" className="hover:text-ink-300 transition-colors">
            ← Zurück zur Startseite
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
