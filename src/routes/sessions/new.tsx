import { createFileRoute, useNavigate, redirect, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { quiz, gameSession, gamePlayer } from '#/db/schema'
import { eq, or } from 'drizzle-orm'
import { getRequest } from '@tanstack/react-start/server'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { Plus, Globe, Play } from 'lucide-react'
import {
  Button,
  Card,
  Pill,
  PageContainer,
  PageHeader,
} from '#/components/ui'
import { ConfirmLeaveSessionModal } from '#/components/ui/ConfirmLeaveSessionModal'
import { parseConflictError } from '#/lib/sessionGuard'

const getQuizzesForSession = createServerFn({ method: 'GET' }).handler(async () => {
  const { auth } = await import('#/lib/auth')
  const { db } = await import('#/db/index')

  const request = getRequest()
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw redirect({ to: '/auth/login' })
  return db
    .select({
      id: quiz.id,
      title: quiz.title,
      columnCount: quiz.columnCount,
      rowCount: quiz.rowCount,
      isPublic: quiz.isPublic,
      creatorId: quiz.creatorId,
    })
    .from(quiz)
    .where(or(eq(quiz.creatorId, session.user.id), eq(quiz.isPublic, true)))
    .all()
})

const createSession = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ quizId: z.string(), confirmLeavePrevious: z.boolean().optional() }))
  .handler(async ({ data }) => {
    const { auth } = await import('#/lib/auth')
    const { db } = await import('#/db/index')

    const request = getRequest()
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) throw redirect({ to: '/auth/login' })

    const { findActiveSessionForUser, conflictError } = await import('#/lib/sessionGuard')
    const conflict = await findActiveSessionForUser(session.user.id)
    if (conflict && !data.confirmLeavePrevious) throw conflictError(conflict)
    if (conflict && data.confirmLeavePrevious) {
      const { cleanupSessionForUser, broadcastState } = await import('#/lib/game-state')
      await cleanupSessionForUser(session.user.id, conflict.sessionId)
      await broadcastState(conflict.sessionId)
    }

    const joinCode = nanoid(6).toUpperCase()
    const sessionId = nanoid(10)
    await db.insert(gameSession).values({
      id: sessionId,
      quizId: data.quizId,
      masterId: session.user.id,
      joinCode,
      status: 'lobby',
      currentState: 'LOBBY',
    })
    const { pickPlayerColor } = await import('#/lib/playerColors')
    await db.insert(gamePlayer).values({
      id: nanoid(10),
      sessionId,
      userId: session.user.id,
      displayName: session.user.name ?? session.user.email ?? 'Master',
      score: 0,
      isConnected: true,
      color: pickPlayerColor([], session.user.id),
    })
    return { sessionId, joinCode }
  })

export const Route = createFileRoute('/sessions/new')({
  validateSearch: z.object({ quizId: z.string().optional() }),
  loader: async () => getQuizzesForSession(),
  component: NewSessionPage,
})

function NewSessionPage() {
  const quizzes = Route.useLoaderData()
  const { quizId: preselect } = Route.useSearch()
  const navigate = useNavigate()
  const [selectedQuiz, setSelectedQuiz] = useState(preselect ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState<{ sessionId: string; isMaster: boolean } | null>(null)

  async function start(confirmLeavePrevious: boolean) {
    if (!selectedQuiz) return
    setLoading(true)
    try {
      const { sessionId } = await createSession({ data: { quizId: selectedQuiz, confirmLeavePrevious } })
      await navigate({ to: '/sessions/$sessionId', params: { sessionId } })
    } catch (e: unknown) {
      const c = parseConflictError(e)
      if (c) {
        setConflict(c)
        setLoading(false)
        return
      }
      setError(e instanceof Error ? e.message : 'Fehler')
      setLoading(false)
    }
  }

  async function handleStart(e: React.FormEvent) {
    e.preventDefault()
    await start(false)
  }

  return (
    <PageContainer size="md">
      <PageHeader
        eyebrow="Spielrunde"
        title="Spiel starten"
        subtitle="Wähle ein Quiz für die neue Runde."
      />

      <form onSubmit={handleStart} className="flex flex-col gap-5">
        {quizzes.length === 0 ? (
          <Card className="p-8 text-center flex flex-col items-center gap-3">
            <p className="text-ink-300">Du hast noch keine Quizze.</p>
            <Link to="/quizzes/new">
              <Button variant="primary" leading={<Plus className="w-4 h-4" />}>
                Quiz erstellen
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {quizzes.map(q => {
              const checked = selectedQuiz === q.id
              return (
                <label
                  key={q.id}
                  className={[
                    'flex items-center gap-4 px-5 py-4 rounded-2xl border cursor-pointer transition-all',
                    checked
                      ? 'border-cyan-500/50 bg-cyan-500/10 shadow-[var(--shadow-tile)]'
                      : 'border-bg-700 bg-bg-800/60 hover:border-bg-600',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="quiz"
                    value={q.id}
                    checked={checked}
                    onChange={() => setSelectedQuiz(q.id)}
                    className="sr-only"
                  />
                  <span
                    className={[
                      'w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center',
                      checked ? 'border-cyan-400' : 'border-bg-600',
                    ].join(' ')}
                  >
                    {checked && <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-board uppercase tracking-wide text-lg text-ink-50 truncate">
                      {q.title}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      <Pill tone="violet">
                        {q.columnCount} × {q.rowCount}
                      </Pill>
                      {q.isPublic && (
                        <Pill tone="cyan" leading={<Globe className="w-3 h-3" />}>
                          Öffentlich
                        </Pill>
                      )}
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
        )}

        {error && <p className="text-bad text-sm">{error}</p>}

        {quizzes.length > 0 && (
          <Button
            type="submit"
            variant="primary"
            size="xl"
            fullWidth
            disabled={loading || !selectedQuiz}
            leading={<Play className="w-5 h-5" />}
          >
            {loading ? 'Wird erstellt…' : 'Session starten'}
          </Button>
        )}
      </form>

      <ConfirmLeaveSessionModal
        open={!!conflict}
        onCancel={() => setConflict(null)}
        onConfirm={() => { setConflict(null); void start(true) }}
      />
    </PageContainer>
  )
}
