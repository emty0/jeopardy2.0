import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { quiz, user as userTable, gameSession } from '#/db/schema'
import { eq, or, desc, and, inArray, count } from 'drizzle-orm'
import { getRequest } from '@tanstack/react-start/server'
import { motion } from 'framer-motion'
import {
  Plus, Pencil, Play, Trash2, Globe, Users, Library, Info,
  Trophy, Zap, Clock, TrendingUp, Target, Brain, Skull,
  BarChart3, Calendar, User, Grid3x3, RotateCcw, Award, Medal,
} from 'lucide-react'
import { Button, Card, Pill, PageContainer, PageHeader, Modal } from '#/components/ui'

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
      creatorName: userTable.name,
    })
    .from(quiz)
    .innerJoin(userTable, eq(quiz.creatorId, userTable.id))
    .where(or(eq(quiz.creatorId, session.user.id), eq(quiz.isPublic, true)))
    .orderBy(desc(quiz.createdAt))
    .all()

  const quizIds = myQuizzes.map(q => q.id)
  const playCounts = quizIds.length
    ? await db
        .select({ quizId: gameSession.quizId, count: count() })
        .from(gameSession)
        .where(and(inArray(gameSession.quizId, quizIds), eq(gameSession.status, 'finished')))
        .groupBy(gameSession.quizId)
        .all()
    : []
  const playCountMap = new Map(playCounts.map(p => [p.quizId, Number(p.count)]))

  return {
    quizzes: myQuizzes.map(q => ({
      ...q,
      playCount: playCountMap.get(q.id) ?? 0,
    })),
    userId: session.user.id,
  }
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

const getQuizDetail = createServerFn({ method: 'GET' })
  .inputValidator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Ungültige Eingabe')
    const d = data as Record<string, unknown>
    if (typeof d.quizId !== 'string') throw new Error('quizId fehlt')
    return { quizId: d.quizId }
  })
  .handler(async ({ data }) => {
    const { auth } = await import('#/lib/auth')
    const { getRequest } = await import('@tanstack/react-start/server')
    const request = getRequest()
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) throw redirect({ to: '/auth/login' })
    const { getQuizStats } = await import('#/lib/statsQueries')
    const stats = await getQuizStats(data.quizId, session.user.id)
    return stats
  })

export const Route = createFileRoute('/quizzes/')({
  loader: async () => getQuizzes(),
  component: QuizzesPage,
})

function fmtDate(d: Date | number | null | undefined) {
  if (!d) return '—'
  const date = d instanceof Date ? d : new Date(d * 1000)
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtDuration(sec: number | null) {
  if (sec === null) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

function fmtNum(n: number | null) {
  if (n === null) return '—'
  return n.toLocaleString('de-DE')
}

function StatCard({
  label,
  value,
  icon,
  tone = 'neutral',
}: {
  label: string
  value: React.ReactNode
  icon?: React.ReactNode
  tone?: 'neutral' | 'violet' | 'cyan' | 'good' | 'bad' | 'amber'
}) {
  const border = {
    neutral: 'border-bg-700',
    violet: 'border-violet-500/30',
    cyan: 'border-cyan-500/30',
    good: 'border-good/30',
    bad: 'border-bad/30',
    amber: 'border-amber-500/30',
  }
  const bg = {
    neutral: 'bg-bg-800',
    violet: 'bg-violet-500/10',
    cyan: 'bg-cyan-500/10',
    good: 'bg-good/10',
    bad: 'bg-bad/10',
    amber: 'bg-amber-500/10',
  }
  const text = {
    neutral: 'text-ink-200',
    violet: 'text-violet-400',
    cyan: 'text-cyan-400',
    good: 'text-good',
    bad: 'text-bad',
    amber: 'text-amber-400',
  }
  return (
    <div className={`rounded-xl border ${border[tone]} ${bg[tone]} p-3 flex flex-col gap-1`}>
      <div className="flex items-center gap-1.5 text-xs text-ink-400">
        {icon && <span className={text[tone]}>{icon}</span>}
        <span>{label}</span>
      </div>
      <div className="font-board text-lg text-ink-50 leading-tight">{value}</div>
    </div>
  )
}

function QuizzesPage() {
  const { quizzes: initialQuizzes, userId } = Route.useLoaderData()
  const router = useRouter()
  const [quizzes, setQuizzes] = useState(initialQuizzes)
  const [deleting, setDeleting] = useState<string | null>(null)

  const [detailQuizId, setDetailQuizId] = useState<string | null>(null)
  const [detailData, setDetailData] = useState<Awaited<ReturnType<typeof getQuizDetail>> | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  async function handleDelete(id: string) {
    if (!confirm('Quiz wirklich löschen?')) return
    setDeleting(id)
    await deleteQuiz({ data: { id } })
    setQuizzes(prev => prev.filter(q => q.id !== id))
    setDeleting(null)
    router.invalidate()
  }

  async function openDetail(quizId: string) {
    setDetailQuizId(quizId)
    setDetailLoading(true)
    setDetailData(null)
    try {
      const data = await getQuizDetail({ data: { quizId } })
      setDetailData(data)
    } catch {
      setDetailData(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const d = detailData

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
              <Card className="p-5 flex flex-col gap-3 h-full relative">
                <button
                  onClick={() => openDetail(q.id)}
                  className="absolute top-3 right-3 w-7 h-7 rounded-full bg-bg-700/60 hover:bg-violet-500/20 border border-bg-600 hover:border-violet-500/40 flex items-center justify-center text-ink-300 hover:text-violet-400 transition-colors"
                  title="Details anzeigen"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>

                <div className="min-w-0 pr-8">
                  <h2 className="font-board uppercase tracking-wide text-xl text-ink-50 leading-tight truncate">
                    {q.title}
                  </h2>
                  {q.description && (
                    <p className="text-sm text-ink-300 mt-1 line-clamp-2">{q.description}</p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-ink-400 mt-2">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {q.creatorName}
                    </span>
                    <span className="text-ink-600">·</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {fmtDate(q.createdAt)}
                    </span>
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
                  {q.playCount > 0 && (
                    <Pill tone="amber" leading={<Trophy className="w-3 h-3" />}>
                      {q.playCount}× gespielt
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

      <Modal
        open={detailQuizId !== null}
        onClose={() => { setDetailQuizId(null); setDetailData(null) }}
        title={d?.quiz.title ?? 'Quiz-Details'}
        size="xl"
      >
        {detailLoading && (
          <div className="p-8 text-center text-ink-300">Lade Statistiken…</div>
        )}
        {!detailLoading && !d && (
          <div className="p-8 text-center text-ink-300">Keine Daten verfügbar.</div>
        )}
        {!detailLoading && d && (
          <div className="p-5 flex flex-col gap-6">
            {/* Beschreibung */}
            {d.quiz.description && (
              <p className="text-sm text-ink-300">{d.quiz.description}</p>
            )}

            {/* Quiz-Details */}
            <section>
              <h3 className="font-board uppercase tracking-wider text-sm text-ink-200 mb-3 flex items-center gap-2">
                <Grid3x3 className="w-4 h-4 text-violet-400" />
                Quiz-Details
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Ersteller" value={d.quiz.creatorName} icon={<User className="w-3.5 h-3.5" />} tone="violet" />
                <StatCard label="Erstellt am" value={fmtDate(d.quiz.createdAt)} icon={<Calendar className="w-3.5 h-3.5" />} tone="violet" />
                <StatCard label="Gitter" value={d.quiz.grid} icon={<Grid3x3 className="w-3.5 h-3.5" />} tone="neutral" />
                <StatCard label="Fragen" value={fmtNum(d.quiz.totalQuestions)} icon={<Brain className="w-3.5 h-3.5" />} tone="neutral" />
                <StatCard label="Kategorien" value={fmtNum(d.quiz.totalCategories)} icon={<BarChart3 className="w-3.5 h-3.5" />} tone="neutral" />
                <StatCard label="Rapid-Fire" value={fmtNum(d.quiz.rapidFireCount)} icon={<Zap className="w-3.5 h-3.5" />} tone="amber" />
                <StatCard label="Medien" value={fmtNum(d.quiz.mediaCount)} icon={<Target className="w-3.5 h-3.5" />} tone="cyan" />
                <StatCard label="Straf-Faktor" value={`×${d.quiz.penalty}`} icon={<Skull className="w-3.5 h-3.5" />} tone="bad" />
              </div>
            </section>

            {/* Deine Statistiken */}
            {d.userStats && (
              <section className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
                <h3 className="font-board uppercase tracking-wider text-sm text-violet-300 mb-3 flex items-center gap-2">
                  <Award className="w-4 h-4 text-violet-400" />
                  Deine Statistiken
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="Gespielt" value={fmtNum(d.userStats.sessionsPlayed)} icon={<Trophy className="w-3.5 h-3.5" />} tone="violet" />
                  <StatCard label="Siege" value={fmtNum(d.userStats.wins)} icon={<Medal className="w-3.5 h-3.5" />} tone="good" />
                  <StatCard label="Dein Highscore" value={fmtNum(d.userStats.highScore)} icon={<TrendingUp className="w-3.5 h-3.5" />} tone="good" />
                  <StatCard label="Dein Lowscore" value={fmtNum(d.userStats.lowScore)} icon={<TrendingUp className="w-3.5 h-3.5" />} tone="bad" />
                  <StatCard label="Ø Punkte" value={fmtNum(d.userStats.avgScore)} icon={<BarChart3 className="w-3.5 h-3.5" />} tone="neutral" />
                  <StatCard label="Richtig" value={fmtNum(d.userStats.totalCorrect)} icon={<Brain className="w-3.5 h-3.5" />} tone="good" />
                  <StatCard label="Falsch" value={fmtNum(d.userStats.totalWrong)} icon={<Skull className="w-3.5 h-3.5" />} tone="bad" />
                  <StatCard label="Genauigkeit" value={`${d.userStats.accuracy}%`} icon={<Target className="w-3.5 h-3.5" />} tone="cyan" />
                  <StatCard label="Ø Reaktion" value={d.userStats.avgReactionMs ? `${d.userStats.avgReactionMs}ms` : '—'} icon={<Zap className="w-3.5 h-3.5" />} tone="amber" />
                  <StatCard label="Schnellster Buzz" value={d.userStats.fastestBuzzMs ? `${d.userStats.fastestBuzzMs}ms` : '—'} icon={<Zap className="w-3.5 h-3.5" />} tone="amber" />
                  <StatCard label="Beste Streak" value={fmtNum(d.userStats.bestStreak)} icon={<RotateCcw className="w-3.5 h-3.5" />} tone="good" />
                </div>
              </section>
            )}

            {/* Spielübersicht */}
            <section>
              <h3 className="font-board uppercase tracking-wider text-sm text-ink-200 mb-3 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-cyan-400" />
                Spielübersicht
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Abgeschlossen" value={fmtNum(d.global.totalFinishedSessions)} icon={<Trophy className="w-3.5 h-3.5" />} tone="cyan" />
                <StatCard label="Einzigartige Spieler" value={fmtNum(d.global.totalUniquePlayers)} icon={<Users className="w-3.5 h-3.5" />} tone="neutral" />
                <StatCard label="Ø Spieler / Runde" value={fmtNum(d.global.avgPlayersPerSession)} icon={<Users className="w-3.5 h-3.5" />} tone="neutral" />
                <StatCard label="Ø Dauer" value={fmtDuration(d.global.avgDurationSec)} icon={<Clock className="w-3.5 h-3.5" />} tone="neutral" />
                <StatCard label="Kürzeste Runde" value={fmtDuration(d.global.shortestDurationSec)} icon={<Clock className="w-3.5 h-3.5" />} tone="good" />
                <StatCard label="Längste Runde" value={fmtDuration(d.global.longestDurationSec)} icon={<Clock className="w-3.5 h-3.5" />} tone="amber" />
              </div>
            </section>

            {/* Punkte */}
            <section>
              <h3 className="font-board uppercase tracking-wider text-sm text-ink-200 mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-good" />
                Punkte
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Highscore" value={fmtNum(d.global.highScore)} icon={<TrendingUp className="w-3.5 h-3.5" />} tone="good" />
                <StatCard label="Lowscore" value={fmtNum(d.global.lowScore)} icon={<TrendingUp className="w-3.5 h-3.5" />} tone="bad" />
                <StatCard label="Ø Punktestand" value={fmtNum(d.global.avgScore)} icon={<BarChart3 className="w-3.5 h-3.5" />} tone="neutral" />
                <StatCard label="Ø Sieger-Punkte" value={fmtNum(d.global.avgWinnerScore)} icon={<Medal className="w-3.5 h-3.5" />} tone="good" />
                <StatCard label="Vergeben (ges.)" value={fmtNum(d.global.totalPointsAwarded)} icon={<Target className="w-3.5 h-3.5" />} tone="good" />
                <StatCard label="Abgezogen (ges.)" value={fmtNum(d.global.totalPointsDeducted)} icon={<Skull className="w-3.5 h-3.5" />} tone="bad" />
              </div>
            </section>

            {/* Fragen-Performance */}
            <section>
              <h3 className="font-board uppercase tracking-wider text-sm text-ink-200 mb-3 flex items-center gap-2">
                <Brain className="w-4 h-4 text-amber-400" />
                Fragen-Performance
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Ø Richtig / Spiel" value={fmtNum(d.global.avgCorrectPerSession)} icon={<Brain className="w-3.5 h-3.5" />} tone="good" />
                <StatCard label="Ø Falsch / Spiel" value={fmtNum(d.global.avgWrongPerSession)} icon={<Skull className="w-3.5 h-3.5" />} tone="bad" />
                <StatCard label="Ø Übersprungen / Spiel" value={fmtNum(d.global.avgSkippedPerSession)} icon={<RotateCcw className="w-3.5 h-3.5" />} tone="amber" />
                <StatCard label="Ø Unbeantwortet / Spiel" value={fmtNum(d.global.avgUnansweredPerSession)} icon={<Target className="w-3.5 h-3.5" />} tone="neutral" />
                <StatCard label="Löschrate" value={`${d.global.overallSolveRate}%`} icon={<Target className="w-3.5 h-3.5" />} tone="cyan" />
                <StatCard label="Ø Buzzes / Frage" value={fmtNum(d.global.avgBuzzesPerQuestion)} icon={<Zap className="w-3.5 h-3.5" />} tone="amber" />
                <StatCard label="Ø Reaktionszeit" value={d.global.avgReactionMs ? `${d.global.avgReactionMs}ms` : '—'} icon={<Clock className="w-3.5 h-3.5" />} tone="neutral" />
                <StatCard label="Schnellster Buzz" value={d.global.fastestBuzzMs ? `${d.global.fastestBuzzMs}ms` : '—'} icon={<Zap className="w-3.5 h-3.5" />} tone="good" />
              </div>
            </section>

            {/* Kategorien */}
            {d.global.perCategory.length > 0 && (
              <section>
                <h3 className="font-board uppercase tracking-wider text-sm text-ink-200 mb-3 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-violet-400" />
                  Kategorien
                </h3>
                <div className="flex flex-col gap-2">
                  {d.global.perCategory.map(cat => (
                    <div key={cat.name} className="flex items-center gap-3 rounded-lg bg-bg-800 border border-bg-700 px-3 py-2">
                      <span className="text-sm text-ink-200 min-w-0 flex-1 truncate">{cat.name}</span>
                      <span className="text-xs text-ink-500">{cat.totalQuestions} Fr.</span>
                      <div className="w-24 h-1.5 rounded-full bg-bg-700 overflow-hidden flex-shrink-0">
                        <div
                          className="h-full bg-good rounded-full"
                          style={{ width: `${Math.min(cat.solveRate, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-good w-10 text-right">{cat.solveRate}%</span>
                      <div className="w-24 h-1.5 rounded-full bg-bg-700 overflow-hidden flex-shrink-0">
                        <div
                          className="h-full bg-amber-400 rounded-full"
                          style={{ width: `${Math.min(cat.skipRate, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-amber-400 w-10 text-right">{cat.skipRate}%</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Rekorde */}
            <section>
              <h3 className="font-board uppercase tracking-wider text-sm text-ink-200 mb-3 flex items-center gap-2">
                <Medal className="w-4 h-4 text-good" />
                Rekorde
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {d.global.bestPlayerEver && (
                  <div className="rounded-xl border border-good/20 bg-good/5 p-3 flex flex-col gap-1">
                    <span className="text-xs text-good flex items-center gap-1"><Trophy className="w-3 h-3" /> Bester Spieler</span>
                    <span className="font-board text-lg text-ink-50">{d.global.bestPlayerEver.name}</span>
                    <span className="text-xs text-ink-400">{fmtNum(d.global.bestPlayerEver.score)} Punkte</span>
                  </div>
                )}
                {d.global.mostPlayedPlayer && (
                  <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 flex flex-col gap-1">
                    <span className="text-xs text-cyan-400 flex items-center gap-1"><Users className="w-3 h-3" /> Aktivster Spieler</span>
                    <span className="font-board text-lg text-ink-50">{d.global.mostPlayedPlayer.name}</span>
                    <span className="text-xs text-ink-400">{fmtNum(d.global.mostPlayedPlayer.count)} Partien</span>
                  </div>
                )}
                {d.global.hardestQuestion && (
                  <div className="rounded-xl border border-bad/20 bg-bad/5 p-3 flex flex-col gap-1">
                    <span className="text-xs text-bad flex items-center gap-1"><Skull className="w-3 h-3" /> Schwerste Frage</span>
                    <span className="font-board text-sm text-ink-50 line-clamp-2">{d.global.hardestQuestion.text}</span>
                    <span className="text-xs text-ink-400">{fmtNum(d.global.hardestQuestion.wrongCount)} falsche Versuche</span>
                  </div>
                )}
                {d.global.mostSkippedQuestion && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 flex flex-col gap-1">
                    <span className="text-xs text-amber-400 flex items-center gap-1"><RotateCcw className="w-3 h-3" /> Meist übersprungen</span>
                    <span className="font-board text-sm text-ink-50 line-clamp-2">{d.global.mostSkippedQuestion.text}</span>
                    <span className="text-xs text-ink-400">{fmtNum(d.global.mostSkippedQuestion.skipCount)}× übersprungen</span>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </Modal>
    </PageContainer>
  )
}
