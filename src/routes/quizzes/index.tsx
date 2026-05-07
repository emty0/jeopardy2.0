import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { quiz } from '#/db/schema'
import { eq, or, desc } from 'drizzle-orm'
import { getRequest } from '@tanstack/react-start/server'
import { motion } from 'framer-motion'
import { Plus, Pencil, Play, Trash2, Globe, Users, Library } from 'lucide-react'
import { Button, Card, Pill, PageContainer, PageHeader } from '#/components/ui'

const getQuizzes = createServerFn({ method: 'GET' }).handler(async () => {
  const { auth } = await import('#/lib/auth')
  const { db } = await import('#/db/index')

  const request = getRequest()
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw redirect({ to: '/auth/login' })

  const myQuizzes = await db
    .select({
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      isPublic: quiz.isPublic,
      columnCount: quiz.columnCount,
      rowCount: quiz.rowCount,
      createdAt: quiz.createdAt,
      creatorId: quiz.creatorId,
    })
    .from(quiz)
    .where(or(eq(quiz.creatorId, session.user.id), eq(quiz.isPublic, true)))
    .orderBy(desc(quiz.createdAt))
    .all()

  return { quizzes: myQuizzes, userId: session.user.id }
})

const deleteQuiz = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    const { auth } = await import('#/lib/auth')
    const { db } = await import('#/db/index')

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
    <PageContainer size="lg">
      <PageHeader
        eyebrow="Bibliothek"
        title="Quizze"
        subtitle="Deine Boards und öffentlich verfügbare Quizze."
        trailing={
          <Link to="/quizzes/new">
            <Button variant="primary" size="md" leading={<Plus className="w-4 h-4" />}>
              Neues Quiz
            </Button>
          </Link>
        }
      />

      {quizzes.length === 0 ? (
        <Card className="py-16 text-center flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-violet-500/15 border-2 border-violet-500/30 flex items-center justify-center">
            <Library className="w-8 h-8 text-violet-400" />
          </div>
          <div>
            <p className="font-board uppercase tracking-wider text-2xl text-ink-50">
              Noch leer
            </p>
            <p className="text-ink-300 text-sm mt-1">Erstelle dein erstes Quiz, um zu starten.</p>
          </div>
          <Link to="/quizzes/new">
            <Button variant="primary" size="md" leading={<Plus className="w-4 h-4" />}>
              Erstes Quiz erstellen
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {quizzes.map((q, i) => (
            <motion.div
              key={q.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Card className="p-5 flex flex-col gap-4 h-full">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-board uppercase tracking-wide text-xl text-ink-50 leading-tight truncate">
                      {q.title}
                    </h2>
                    {q.description && (
                      <p className="text-sm text-ink-300 mt-1 line-clamp-2">{q.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Pill tone="violet">
                    {q.columnCount} × {q.rowCount}
                  </Pill>
                  {q.isPublic && (
                    <Pill tone="cyan" leading={<Globe className="w-3 h-3" />}>
                      Öffentlich
                    </Pill>
                  )}
                  {q.creatorId !== userId && (
                    <Pill tone="neutral" leading={<Users className="w-3 h-3" />}>
                      Geteilt
                    </Pill>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 mt-auto">
                  {q.creatorId === userId && (
                    <>
                      <Link to="/quizzes/$quizId/edit" params={{ quizId: q.id }}>
                        <Button variant="subtle" size="sm" leading={<Pencil className="w-3.5 h-3.5" />}>
                          Bearbeiten
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(q.id)}
                        disabled={deleting === q.id}
                        leading={<Trash2 className="w-3.5 h-3.5" />}
                        className="!text-bad hover:!bg-bad/10"
                      >
                        {deleting === q.id ? 'Löschen…' : 'Löschen'}
                      </Button>
                    </>
                  )}
                  <Link
                    to="/sessions/new"
                    search={{ quizId: q.id }}
                    className="ml-auto"
                  >
                    <Button variant="primary" size="sm" leading={<Play className="w-3.5 h-3.5" />}>
                      Spielen
                    </Button>
                  </Link>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </PageContainer>
  )
}
