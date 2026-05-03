import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { auth } from '#/lib/auth'
import { db } from '#/db/index'
import { quiz, gameSession, gamePlayer } from '#/db/schema'
import { eq, or } from 'drizzle-orm'
import { getRequest } from '@tanstack/react-start/server'
import { nanoid } from 'nanoid'
import { z } from 'zod'

const getQuizzesForSession = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest()
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw redirect({ to: '/auth/login' })
  return db.select({ id: quiz.id, title: quiz.title, columnCount: quiz.columnCount, rowCount: quiz.rowCount, isPublic: quiz.isPublic, creatorId: quiz.creatorId })
    .from(quiz)
    .where(or(eq(quiz.creatorId, session.user.id), eq(quiz.isPublic, true)))
    .all()
})

const createSession = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ quizId: z.string() }))
  .handler(async ({ data }) => {
    const request = getRequest()
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) throw redirect({ to: '/auth/login' })

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
    await db.insert(gamePlayer).values({
      id: nanoid(10),
      sessionId,
      userId: session.user.id,
      displayName: session.user.name ?? session.user.email ?? 'Master',
      score: 0,
      isConnected: true,
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

  async function handleStart(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedQuiz) return
    setLoading(true)
    try {
      const { sessionId } = await createSession({ data: { quizId: selectedQuiz } })
      await navigate({ to: '/sessions/$sessionId', params: { sessionId } })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fehler')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Neue Spielrunde starten</h1>
      <form onSubmit={handleStart} className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-sm text-neutral-400 mb-2">Quiz auswählen</label>
          {quizzes.length === 0 ? (
            <p className="text-neutral-500 text-sm">Noch keine Quizze vorhanden. <a href="/quizzes/new" className="text-yellow-400 hover:underline">Quiz erstellen →</a></p>
          ) : (
            <div className="space-y-2">
              {quizzes.map(q => (
                <label key={q.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  selectedQuiz === q.id ? 'border-yellow-500 bg-yellow-900/20' : 'border-neutral-700 hover:border-neutral-500'
                }`}>
                  <input type="radio" name="quiz" value={q.id} checked={selectedQuiz === q.id} onChange={() => setSelectedQuiz(q.id)} className="accent-yellow-400" />
                  <div>
                    <p className="font-medium">{q.title}</p>
                    <p className="text-xs text-neutral-400">{q.columnCount} Kat. × {q.rowCount} Fragen{q.isPublic ? ' · Öffentlich' : ''}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button type="submit" disabled={loading || !selectedQuiz}
          className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-bold rounded-xl transition-colors">
          {loading ? 'Wird erstellt…' : 'Session starten'}
        </button>
      </form>
    </div>
  )
}
