import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { auth } from '#/lib/auth'
import { db } from '#/db/index'
import { quiz } from '#/db/schema'
import { eq, or, desc } from 'drizzle-orm'
import { getRequest } from '@tanstack/react-start/server'

const getQuizzes = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest()
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw redirect({ to: '/auth/login' })

  const myQuizzes = await db
    .select({ id: quiz.id, title: quiz.title, isPublic: quiz.isPublic, columnCount: quiz.columnCount, rowCount: quiz.rowCount, createdAt: quiz.createdAt, creatorId: quiz.creatorId })
    .from(quiz)
    .where(or(eq(quiz.creatorId, session.user.id), eq(quiz.isPublic, true)))
    .orderBy(desc(quiz.createdAt))
    .all()

  return { quizzes: myQuizzes, userId: session.user.id }
})

const deleteQuiz = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    const request = getRequest()
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) throw new Error('Nicht angemeldet')
    const q = await db.select().from(quiz).where(eq(quiz.id, data.id)).get()
    if (!q || q.creatorId !== session.user.id) throw new Error('Keine Berechtigung')
    await db.delete(quiz).where(eq(quiz.id, data.id))
    return { ok: true }
  })

export const Route = createFileRoute('/quizzes/')({
  loader: async () => getQuizzes(),
  component: QuizzesPage,
})

function QuizzesPage() {
  const { quizzes: initialQuizzes, userId } = Route.useLoaderData()
  const router = useRouter()
  const [quizzes, setQuizzes] = useState(initialQuizzes)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function handleDelete(id: string) {
    if (!confirm('Quiz wirklich löschen?')) return
    setDeleting(id)
    await deleteQuiz({ data: { id } })
    setQuizzes(prev => prev.filter(q => q.id !== id))
    setDeleting(null)
    router.invalidate()
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Quizze</h1>
        <Link
          to="/quizzes/new"
          className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg transition-colors"
        >
          + Neues Quiz
        </Link>
      </div>

      {quizzes.length === 0 ? (
        <div className="text-center py-16 text-neutral-500">
          <p className="text-4xl mb-4">🎯</p>
          <p className="text-lg">Noch keine Quizze vorhanden.</p>
          <Link to="/quizzes/new" className="mt-4 inline-block text-yellow-400 hover:underline">
            Erstes Quiz erstellen →
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {quizzes.map(q => (
            <div key={q.id} className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-lg">{q.title}</h2>
                  <p className="text-sm text-neutral-400">
                    {q.columnCount} Kategorien × {q.rowCount} Fragen
                    {q.isPublic && <span className="ml-2 text-xs bg-yellow-900 text-yellow-300 px-1.5 py-0.5 rounded">Öffentlich</span>}
                    {q.creatorId !== userId && <span className="ml-2 text-xs bg-neutral-700 text-neutral-300 px-1.5 py-0.5 rounded">Von anderen</span>}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-auto">
                {q.creatorId === userId && (
                  <>
                    <Link
                      to="/quizzes/$quizId/edit"
                      params={{ quizId: q.id }}
                      className="px-3 py-1.5 text-sm bg-neutral-700 hover:bg-neutral-600 rounded-lg transition-colors"
                    >
                      Bearbeiten
                    </Link>
                    <button
                      onClick={() => handleDelete(q.id)}
                      disabled={deleting === q.id}
                      className="px-3 py-1.5 text-sm bg-red-900 hover:bg-red-800 disabled:opacity-50 text-red-200 rounded-lg transition-colors"
                    >
                      {deleting === q.id ? '…' : 'Löschen'}
                    </button>
                  </>
                )}
                <Link
                  to="/sessions/new"
                  search={{ quizId: q.id }}
                  className="px-3 py-1.5 text-sm bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg transition-colors"
                >
                  Spielen
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
