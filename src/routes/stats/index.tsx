import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { Crown, Zap, Trophy, Target, Sparkles } from 'lucide-react'
import { Card, PageContainer, PageHeader, Button } from '#/components/ui'

const getStats = createServerFn({ method: 'GET' }).handler(async () => {
  const { auth } = await import('#/lib/auth')
  const request = getRequest()
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw redirect({ to: '/auth/login' })
  const { getHallOfFame } = await import('#/lib/statsQueries')
  const hof = await getHallOfFame()
  return { hof, currentUserId: session.user.id }
})

export const Route = createFileRoute('/stats/')({
  loader: async () => getStats(),
  component: StatsPage,
})

function formatMs(ms: number | null | undefined): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

interface RankRow {
  userId: string | null
  displayName: string | null
  username?: string | null
}

function Leaderboard<T extends RankRow>({
  title, icon, rows, valueLabel, getValue,
}: {
  title: string
  icon: React.ReactNode
  rows: T[]
  valueLabel: string
  getValue: (r: T) => string
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <p className="text-[10px] uppercase tracking-[0.2em] text-ink-300">{title}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-ink-500 italic">Noch keine Daten</p>
      ) : (
        <ol className="space-y-1">
          {rows.map((r, i) => (
            <li key={r.userId ?? i} className="flex items-center gap-3 text-sm">
              <span className="text-ink-500 w-5 text-xs">{i + 1}.</span>
              {r.userId ? (
                <Link to="/stats/users/$userId" params={{ userId: r.userId }} className="text-ink-100 hover:text-violet-300 truncate flex-1">
                  {r.displayName ?? r.username ?? '?'}
                </Link>
              ) : (
                <span className="text-ink-100 truncate flex-1">{r.displayName ?? '?'}</span>
              )}
              <span className="text-xs text-ink-300 tabular-nums">{getValue(r)}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-ink-500">{valueLabel}</p>
    </Card>
  )
}

function StatsPage() {
  const { hof, currentUserId } = Route.useLoaderData()

  return (
    <PageContainer size="xl">
      <PageHeader
        eyebrow="Hall of Fame"
        title="Statistiken"
        subtitle="Globale Bestenlisten über alle Spiele hinweg"
        trailing={
          <Link to="/stats/users/$userId" params={{ userId: currentUserId }}>
            <Button variant="primary" size="sm">Mein Profil →</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Leaderboard
          title="Most Wins"
          icon={<Crown className="w-4 h-4 text-amber-400" />}
          rows={hof.topByWins}
          valueLabel="Anzahl gewonnener Spiele"
          getValue={(r) => `${r.wins} ×`}
        />
        <Leaderboard
          title="Schnellster Buzz"
          icon={<Zap className="w-4 h-4 text-amber-400" />}
          rows={hof.topByFastestBuzz}
          valueLabel="Persönliche Best-Reaktionszeit"
          getValue={(r) => formatMs(r.reactionMs)}
        />
        <Leaderboard
          title="Punkte-Ranking"
          icon={<Trophy className="w-4 h-4 text-violet-300" />}
          rows={hof.topByNetPoints}
          valueLabel="Netto-Punkte (alle Spiele)"
          getValue={(r) => `${r.netPoints ?? 0}`}
        />
        <Leaderboard
          title="Meiste richtige Antworten"
          icon={<Target className="w-4 h-4 text-good" />}
          rows={hof.topByCorrect}
          valueLabel="Anzahl richtiger Antworten"
          getValue={(r) => `${r.correct}`}
        />
        <Leaderboard
          title="Top Quizmaster"
          icon={<Sparkles className="w-4 h-4 text-cyan-300" />}
          rows={hof.topMasters}
          valueLabel="Geleitete Spiele"
          getValue={(r) => `${r.sessions}`}
        />
      </div>
    </PageContainer>
  )
}
