import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { Crown, Zap, Target, Trophy, Flame, TrendingUp, Heart } from 'lucide-react'
import { Card, PageContainer, PageHeader, Pill } from '#/components/ui'

const getUserStats = createServerFn({ method: 'GET' })
  .inputValidator((data: unknown) => data as { userId: string })
  .handler(async ({ data }) => {
    const { auth } = await import('#/lib/auth')
    const request = getRequest()
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) throw redirect({ to: '/auth/login' })

    const { getCareerStats, getUserSessionHistory } = await import('#/lib/statsQueries')
    const career = await getCareerStats(data.userId)
    if (!career) throw new Error('User nicht gefunden')
    const history = await getUserSessionHistory(data.userId)
    return { career, history }
  })

export const Route = createFileRoute('/stats/users/$userId')({
  loader: async ({ params }) => getUserStats({ data: { userId: params.userId } }),
  component: UserStatsPage,
})

function formatMs(ms: number | null | undefined): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

function formatDate(ts: Date | number | null): string {
  if (!ts) return '—'
  const date = ts instanceof Date ? ts : new Date(Number(ts) * 1000)
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function StatCard({ icon, label, value, sublabel }: { icon: React.ReactNode; label: string; value: React.ReactNode; sublabel?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <p className="text-[10px] uppercase tracking-[0.2em] text-ink-500">{label}</p>
      </div>
      <p className="font-board text-3xl text-ink-50">{value}</p>
      {sublabel && <p className="text-xs text-ink-400 mt-1">{sublabel}</p>}
    </Card>
  )
}

function UserStatsPage() {
  const { career, history } = Route.useLoaderData()

  return (
    <PageContainer size="xl">
      <PageHeader
        eyebrow="Career-Stats"
        title={career.user.displayUsername || career.user.name}
        subtitle={`${career.gamesPlayed} Spiele gespielt`}
      />

      {/* KPI-Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
        <StatCard
          icon={<Crown className="w-4 h-4 text-amber-400" />}
          label="Siege"
          value={career.gamesWon}
          sublabel={`${(career.winRate * 100).toFixed(0)}% Win-Rate`}
        />
        <StatCard
          icon={<Target className="w-4 h-4 text-good" />}
          label="Trefferquote"
          value={`${(career.accuracy * 100).toFixed(0)}%`}
          sublabel={`${career.totalCorrect} / ${career.totalCorrect + career.totalWrong}`}
        />
        <StatCard
          icon={<Zap className="w-4 h-4 text-amber-400" />}
          label="Schnellster Buzz"
          value={formatMs(career.fastestBuzzMs)}
          sublabel={career.avgReactionMs ? `Ø ${formatMs(career.avgReactionMs)}` : undefined}
        />
        <StatCard
          icon={<Trophy className="w-4 h-4 text-violet-300" />}
          label="Netto-Punkte"
          value={career.netPoints}
          sublabel={`+${career.totalPointsEarned} / −${career.totalPointsLost}`}
        />
        <StatCard
          icon={<Flame className="w-4 h-4 text-amber-400" />}
          label="Längste Streak"
          value={`${career.longestCorrectStreak}×`}
          sublabel="in Folge richtig"
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4 text-cyan-300" />}
          label="Buzzes total"
          value={career.buzzCount}
        />
        {career.favoriteCategory && (
          <StatCard
            icon={<Heart className="w-4 h-4 text-pink-400" />}
            label="Lieblings-Kategorie"
            value={career.favoriteCategory.name}
            sublabel={`${career.favoriteCategory.correct} richtig`}
          />
        )}
      </div>

      {/* Session-Historie */}
      <h2 className="text-[11px] font-bold uppercase tracking-[0.25em] text-violet-400 mb-3">Spiele-Historie</h2>
      {history.length === 0 ? (
        <Card className="p-6 text-center text-ink-400 text-sm">Noch keine Spiele.</Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.2em] text-ink-500 border-b border-bg-700">
                <th className="text-left px-4 py-2">Datum</th>
                <th className="text-left px-4 py-2">Quiz</th>
                <th className="text-left px-4 py-2">Rolle</th>
                <th className="text-left px-4 py-2">Ergebnis</th>
                <th className="text-right px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {history.map(s => (
                <tr key={s.id} className="border-b border-bg-800 last:border-0 hover:bg-bg-700/30">
                  <td className="px-4 py-3 text-ink-300">{formatDate(s.startedAt as any ?? s.finishedAt as any)}</td>
                  <td className="px-4 py-3 text-ink-100 truncate max-w-xs">{s.quizTitle}</td>
                  <td className="px-4 py-3">
                    {s.wasMaster ? (
                      <Pill tone="violet">Master</Pill>
                    ) : (
                      <Pill tone="neutral">Spieler</Pill>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {s.status !== 'finished' ? (
                      <Pill tone="amber">läuft</Pill>
                    ) : s.won ? (
                      <Pill tone="good"><Crown className="w-3 h-3 inline mr-0.5" />Sieg</Pill>
                    ) : s.wasMaster ? (
                      <span className="text-xs text-ink-500">—</span>
                    ) : (
                      <Pill tone="neutral">verloren</Pill>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {s.status === 'finished' && (
                      <Link to="/sessions/$sessionId/recap" params={{ sessionId: s.id }} className="text-xs text-violet-300 hover:text-violet-200">
                        Recap →
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </PageContainer>
  )
}
