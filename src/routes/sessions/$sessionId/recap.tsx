import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { Crown, Zap, Target, Frown, Flame, TrendingDown, Snail, Trophy, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Button, Card, PageContainer, PageHeader, Pill } from '#/components/ui'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'

const getRecap = createServerFn({ method: 'GET' })
  .inputValidator((data: unknown) => data as { sessionId: string })
  .handler(async ({ data }) => {
    const { auth } = await import('#/lib/auth')
    const request = getRequest()
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) throw redirect({ to: '/auth/login' })

    const { getSessionRecap } = await import('#/lib/statsQueries')
    const recap = await getSessionRecap(data.sessionId)
    if (!recap) throw new Error('Session nicht gefunden')
    return recap
  })

export const Route = createFileRoute('/sessions/$sessionId/recap')({
  loader: async ({ params }) => getRecap({ data: { sessionId: params.sessionId } }),
  component: RecapPage,
})

function formatMs(ms: number | null | undefined): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

function formatDuration(sec: number | null): string {
  if (sec == null) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')} min`
}

function HighlightCard({
  icon, label, primary, secondary, color,
}: {
  icon: React.ReactNode
  label: string
  primary: React.ReactNode
  secondary?: React.ReactNode
  color?: string
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: color ?? 'rgba(139,92,246,0.2)' }}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-ink-500">{label}</p>
          <p className="text-base font-semibold text-ink-50 truncate">{primary}</p>
          {secondary && <p className="text-xs text-ink-400 truncate">{secondary}</p>}
        </div>
      </div>
    </Card>
  )
}

function RecapPage() {
  const data = Route.useLoaderData()
  const [expandedQ, setExpandedQ] = useState<string | null>(null)

  const winnerPlayer = data.players.find(p => p.playerId === data.session.winnerPlayerId)

  // Recharts-Daten: pro Frage-Index Score-Punkte
  const chartData = data.timeline.map(t => ({
    idx: t.idx,
    ...t.scores,
  }))

  return (
    <PageContainer size="xl">
      <PageHeader
        eyebrow="Spiel-Recap"
        title={data.session.quizTitle}
        subtitle={`${formatDuration(data.session.durationSec)} · ${data.session.answeredCount}/${data.session.totalQuestions ?? '?'} Fragen`}
        trailing={
          <Link to="/stats">
            <Button variant="subtle" size="sm">Hall of Fame →</Button>
          </Link>
        }
      />

      {/* Sieger-Banner */}
      {winnerPlayer && (
        <Card className="p-6 mb-6 border-2" style={{ borderColor: winnerPlayer.color }}>
          <div className="flex items-center gap-4">
            <Crown className="w-10 h-10 text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] text-amber-400">Gewinner</p>
              <p className="font-board text-3xl text-ink-50 truncate">{winnerPlayer.displayName}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.2em] text-ink-500">Endpunkte</p>
              <p className="font-board text-4xl" style={{ color: winnerPlayer.color }}>{winnerPlayer.finalScore}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Score-Verlauf-Chart */}
      {chartData.length > 0 && (
        <Card className="p-4 mb-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-ink-500 mb-3">Score-Verlauf</p>
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a35" />
                <XAxis dataKey="idx" stroke="#8a8a99" tick={{ fontSize: 11 }} label={{ value: 'Frage Nr.', position: 'insideBottom', offset: -5, fill: '#8a8a99', fontSize: 11 }} />
                <YAxis stroke="#8a8a99" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1a1a23', border: '1px solid #2a2a35', borderRadius: 8 }} labelStyle={{ color: '#c8c8d4' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {data.players.map(p => (
                  <Line
                    key={p.playerId}
                    type="monotone"
                    dataKey={p.playerId}
                    name={p.displayName}
                    stroke={p.color}
                    strokeWidth={3}
                    dot={{ r: 3 }}
                    activeDot={{ r: 6 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Highlights-Grid */}
      <h2 className="text-[11px] font-bold uppercase tracking-[0.25em] text-violet-400 mb-3">Highlights</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        {data.highlights.fastestBuzz && (
          <HighlightCard
            icon={<Zap className="w-5 h-5 text-amber-400" />}
            label="Schnellster Buzz"
            primary={`${data.highlights.fastestBuzz.playerName} · ${formatMs(data.highlights.fastestBuzz.reactionMs)}`}
            secondary={data.highlights.fastestBuzz.questionText}
            color={`${data.highlights.fastestBuzz.color}33`}
          />
        )}
        {data.highlights.slowestBuzz && (
          <HighlightCard
            icon={<Snail className="w-5 h-5 text-ink-300" />}
            label="Langsamster Buzz"
            primary={`${data.highlights.slowestBuzz.playerName} · ${formatMs(data.highlights.slowestBuzz.reactionMs)}`}
            secondary={data.highlights.slowestBuzz.questionText}
            color={`${data.highlights.slowestBuzz.color}33`}
          />
        )}
        {data.highlights.bestAccuracy && (
          <HighlightCard
            icon={<Target className="w-5 h-5 text-good" />}
            label="Beste Trefferquote"
            primary={`${data.highlights.bestAccuracy.displayName} · ${(data.highlights.bestAccuracy.accuracy * 100).toFixed(0)}%`}
            secondary={`${data.highlights.bestAccuracy.correct} richtig / ${data.highlights.bestAccuracy.wrong} falsch`}
            color={`${data.highlights.bestAccuracy.color}33`}
          />
        )}
        {data.highlights.mostCorrect && data.highlights.mostCorrect.correct > 0 && (
          <HighlightCard
            icon={<Trophy className="w-5 h-5 text-good" />}
            label="Meiste richtige Antworten"
            primary={`${data.highlights.mostCorrect.displayName} · ${data.highlights.mostCorrect.correct}`}
            color={`${data.highlights.mostCorrect.color}33`}
          />
        )}
        {data.highlights.mostWrong && data.highlights.mostWrong.wrong > 0 && (
          <HighlightCard
            icon={<Frown className="w-5 h-5 text-bad" />}
            label="Häufigste Fehler"
            primary={`${data.highlights.mostWrong.displayName} · ${data.highlights.mostWrong.wrong}`}
            color={`${data.highlights.mostWrong.color}33`}
          />
        )}
        {data.highlights.bestStreak && (
          <HighlightCard
            icon={<Flame className="w-5 h-5 text-amber-400" />}
            label="Längste Streak"
            primary={`${data.highlights.bestStreak.playerName} · ${data.highlights.bestStreak.streak}× in Folge`}
            color={`${data.highlights.bestStreak.color}33`}
          />
        )}
        {data.highlights.biggestLoss && (
          <HighlightCard
            icon={<TrendingDown className="w-5 h-5 text-bad" />}
            label="Größter Punktverlust"
            primary={`${data.highlights.biggestLoss.playerName} · −${data.highlights.biggestLoss.pointsLost}`}
            secondary={data.highlights.biggestLoss.questionText}
            color={`${data.highlights.biggestLoss.color}33`}
          />
        )}
      </div>

      {/* Spieler-Tabelle */}
      <h2 className="text-[11px] font-bold uppercase tracking-[0.25em] text-violet-400 mb-3">Spieler</h2>
      <Card className="overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.2em] text-ink-500 border-b border-bg-700">
              <th className="text-left px-4 py-2">Spieler</th>
              <th className="text-right px-4 py-2">Score</th>
              <th className="text-right px-4 py-2">✓</th>
              <th className="text-right px-4 py-2">✗</th>
              <th className="text-right px-4 py-2">Quote</th>
              <th className="text-right px-4 py-2">Ø Reaktion</th>
            </tr>
          </thead>
          <tbody>
            {[...data.players].sort((a, b) => b.finalScore - a.finalScore).map((p, i) => (
              <tr key={p.playerId} className="border-b border-bg-800 last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-ink-500 text-xs w-4">{i + 1}.</span>
                    <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                    <span className="text-ink-100">{p.displayName}</span>
                    {p.playerId === data.session.winnerPlayerId && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-board text-lg" style={{ color: p.color }}>{p.finalScore}</td>
                <td className="px-4 py-3 text-right text-good">{p.correct}</td>
                <td className="px-4 py-3 text-right text-bad">{p.wrong}</td>
                <td className="px-4 py-3 text-right text-ink-200">{((p.accuracy ?? 0) * 100).toFixed(0)}%</td>
                <td className="px-4 py-3 text-right text-ink-300">{formatMs(p.avgReactionMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Per-Kategorie */}
      {data.perCategory.length > 0 && (
        <>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.25em] text-violet-400 mb-3">Kategorien</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
            {data.perCategory.map(c => (
              <Card key={c.name} className="p-3">
                <p className="text-sm text-ink-100 font-medium truncate">{c.name}</p>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <Pill tone="good">{c.solved} gelöst</Pill>
                  {c.skipped > 0 && <Pill tone="bad">{c.skipped} skip</Pill>}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Pro-Frage-Details (collapsible) */}
      <h2 className="text-[11px] font-bold uppercase tracking-[0.25em] text-violet-400 mb-3">Alle Fragen</h2>
      <Card className="overflow-hidden">
        {data.perQuestion.map(q => {
          const isOpen = expandedQ === q.questionId
          return (
            <div key={q.questionId} className="border-b border-bg-800 last:border-0">
              <button
                onClick={() => setExpandedQ(isOpen ? null : q.questionId)}
                className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-bg-700/40 transition"
              >
                {isOpen ? <ChevronDown className="w-4 h-4 shrink-0 text-ink-400" /> : <ChevronRight className="w-4 h-4 shrink-0 text-ink-400" />}
                <span className="text-xs text-ink-500 w-12 shrink-0">{q.pointValue}</span>
                <span className="text-xs text-ink-400 truncate w-28 shrink-0 hidden sm:inline">{q.categoryName}</span>
                <span className="flex-1 text-sm text-ink-100 truncate">{q.questionText || <em className="text-ink-500">(kein Text)</em>}</span>
                {q.resolution === 'skipped' ? (
                  <Pill tone="bad">übersprungen</Pill>
                ) : q.resolution === 'rapid_fire' ? (
                  <Pill tone="amber">rapid fire</Pill>
                ) : q.firstSolverColor ? (
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: q.firstSolverColor }} />
                ) : null}
              </button>
              {isOpen && (
                <div className="px-4 pb-4 pt-1 bg-bg-900/40">
                  <p className="text-xs text-ink-400 mb-2">
                    <span className="text-ink-500">Antwort:</span> <span className="text-ink-200">{q.answerText}</span>
                  </p>
                  {q.attempts.length === 0 ? (
                    <p className="text-xs text-ink-500 italic">Keine Buzz-Versuche</p>
                  ) : (
                    <div className="space-y-1">
                      {q.attempts.map((a, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="text-ink-500 w-4">{a.attemptOrder}.</span>
                          <span className="w-2 h-2 rounded-full" style={{ background: a.playerColor }} />
                          <span className="text-ink-200 w-32 truncate">{a.playerName}</span>
                          <span className={a.isCorrect ? 'text-good' : 'text-bad'}>
                            {a.isCorrect ? '✓ richtig' : '✗ falsch'}
                          </span>
                          <span className="text-ink-400">{a.pointsAwarded > 0 ? `+${a.pointsAwarded}` : a.pointsAwarded}</span>
                          <span className="ml-auto text-ink-500">{formatMs(a.reactionMs)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </Card>
    </PageContainer>
  )
}
