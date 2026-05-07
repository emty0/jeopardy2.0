import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState, useRef } from 'react'
import { z } from 'zod'
import { getRequest } from '@tanstack/react-start/server'
import { nanoid } from 'nanoid'
import { Hash } from 'lucide-react'
import { Button, Wordmark } from '#/components/ui'

const joinByCode = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ code: z.string().length(6) }))
  .handler(async ({ data }) => {
    const { auth } = await import('#/lib/auth')
    const { db } = await import('#/db/index')
    const { gameSession, gamePlayer } = await import('#/db/schema')
    const { eq } = await import('drizzle-orm')
    const request = getRequest()
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) throw new Error('Nicht angemeldet')

    const gs = await db
      .select()
      .from(gameSession)
      .where(eq(gameSession.joinCode, data.code.toUpperCase()))
      .get()

    if (!gs) throw new Error('Ungültiger Code – Session nicht gefunden.')
    if (gs.status === 'finished') throw new Error('Diese Spielrunde ist bereits beendet.')

    const { and } = await import('drizzle-orm')
    const existing = await db
      .select()
      .from(gamePlayer)
      .where(and(eq(gamePlayer.sessionId, gs.id), eq(gamePlayer.userId, session.user.id)))
      .get()

    if (!existing) {
      const { pickPlayerColor } = await import('#/lib/playerColors')
      const others = await db
        .select({ color: gamePlayer.color })
        .from(gamePlayer)
        .where(eq(gamePlayer.sessionId, gs.id))
        .all()
      const color = pickPlayerColor(others.map(o => o.color), session.user.id)
      await db.insert(gamePlayer).values({
        id: nanoid(10),
        sessionId: gs.id,
        userId: session.user.id,
        displayName: session.user.name ?? session.user.email ?? 'Spieler',
        score: 0,
        isConnected: true,
        color,
      })
    }

    return {
      sessionId: gs.id,
      isMaster: gs.masterId === session.user.id,
    }
  })

export const Route = createFileRoute('/join')({
  component: JoinPage,
})

const SLOTS = 6

function JoinPage() {
  const navigate = useNavigate()
  const [digits, setDigits] = useState<string[]>(Array(SLOTS).fill(''))
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputs = useRef<Array<HTMLInputElement | null>>([])

  const code = digits.join('')
  const complete = code.length === SLOTS && digits.every(d => d !== '')

  function handleChange(idx: number, val: string) {
    const char = val.replace(/[^a-zA-Z0-9]/g, '').slice(-1).toUpperCase()
    const next = [...digits]
    next[idx] = char
    setDigits(next)
    setError('')
    if (char && idx < SLOTS - 1) {
      inputs.current[idx + 1]?.focus()
    }
  }

  function handleKeyDown(idx: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (digits[idx]) {
        const next = [...digits]
        next[idx] = ''
        setDigits(next)
      } else if (idx > 0) {
        inputs.current[idx - 1]?.focus()
      }
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      inputs.current[idx - 1]?.focus()
    } else if (e.key === 'ArrowRight' && idx < SLOTS - 1) {
      inputs.current[idx + 1]?.focus()
    } else if (e.key === 'Enter' && complete) {
      void submit()
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const text = e.clipboardData
      .getData('text')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, SLOTS)
    const next = Array(SLOTS).fill('')
    for (let i = 0; i < text.length; i++) next[i] = text[i]
    setDigits(next)
    setError('')
    const focusIdx = Math.min(text.length, SLOTS - 1)
    inputs.current[focusIdx]?.focus()
  }

  async function submit() {
    if (!complete) return
    setError('')
    setLoading(true)
    try {
      const { sessionId, isMaster } = await joinByCode({ data: { code } })
      if (isMaster) {
        await navigate({ to: '/sessions/$sessionId/master', params: { sessionId } })
      } else {
        await navigate({ to: '/sessions/$sessionId/play', params: { sessionId } })
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fehler beim Beitreten.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Wordmark size="lg" className="mb-4" />
          <div className="w-14 h-14 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center mx-auto mb-4">
            <Hash className="w-7 h-7 text-cyan-400" />
          </div>
          <h1 className="font-board uppercase tracking-wider text-3xl text-ink-50 mb-1">
            Spiel beitreten
          </h1>
          <p className="text-ink-400 text-sm">Gib den 6-stelligen Code ein</p>
        </div>

        <div className="rounded-3xl bg-bg-900/80 border border-bg-700 backdrop-blur-md p-6 sm:p-8 shadow-[0_30px_80px_-20px_rgb(0_0_0_/_0.6)]">
          <div className="flex gap-2 justify-center mb-6">
            {Array.from({ length: SLOTS }).map((_, i) => (
              <input
                key={i}
                ref={el => { inputs.current[i] = el }}
                type="text"
                inputMode="text"
                maxLength={1}
                value={digits[i]}
                onChange={e => handleChange(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                onPaste={handlePaste}
                onFocus={e => e.target.select()}
                className={[
                  'w-11 h-14 text-center text-xl font-board tracking-widest rounded-xl border-2 bg-bg-800 text-ink-50 outline-none transition-all',
                  digits[i]
                    ? 'border-cyan-400 shadow-[0_0_12px_-2px_rgba(34,211,238,0.4)]'
                    : 'border-bg-600 focus:border-cyan-500',
                  error ? 'border-red-500 shake' : '',
                ].join(' ')}
              />
            ))}
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center mb-4">{error}</p>
          )}

          <Button
            type="button"
            variant="primary"
            size="lg"
            fullWidth
            disabled={!complete || loading}
            onClick={submit}
          >
            {loading ? 'Wird beigetreten…' : 'Beitreten'}
          </Button>
        </div>
      </div>
    </div>
  )
}
