import { createFileRoute, redirect } from '@tanstack/react-router'
import { getRequest } from '@tanstack/react-start/server'
import { useMemo, useRef, useState } from 'react'
import {
  Flame, Snowflake, Moon, Bell, Droplet, Dog, TrendingUp,
  Zap, Gem, Ghost, Trophy, HeartCrack, RotateCcw, PlayCircle, Trash2,
  Volume2, VolumeX,
} from 'lucide-react'
import {
  Button, Card, FormField, Input,
  PageContainer, PageHeader,
} from '#/components/ui'
import { Avatar, EventNotificationOverlay, Scoreboard } from '#/components/game'
import { pushNotification } from '#/lib/specialEvents'
import { PLAYER_COLOR_PALETTE } from '#/lib/playerColors'
import type {
  GameState, PlayerState, SpecialEventType,
} from '#/lib/game-state'

// ─── Mock-State ────────────────────────────────────────────────────────────

const MOCK_MASTER_ID = 'mock-master'

function makeInitialPlayers(): PlayerState[] {
  const names = ['Alpha', 'Bravo', 'Charlie', 'Delta']
  const scores = [800, 600, 400, 200]
  return names.map((displayName, i) => ({
    id: `p${i + 1}`,
    displayName,
    score: scores[i],
    isConnected: true,
    userId: `u${i + 1}`,
    color: PLAYER_COLOR_PALETTE[i],
    correctStreak: 0,
    wrongStreak: 0,
    idleQuestionsCount: 0,
  }))
}

function makeInitialState(players: PlayerState[]): GameState {
  return {
    sessionId: 'debug',
    phase: 'QUESTION_OPEN',
    masterId: MOCK_MASTER_ID,
    players,
    activePlayerId: null,
    activeQuestion: null,
    buzzedPlayerId: null,
    answeredQuestionIds: [],
    buzzedPlayerIds: [],
    board: [],
    winnerId: null,
    pointValues: [200, 400, 600, 800, 1000],
    wrongAnswerPenalty: 1,
    noNegativePoints: false,
    skipVotes: [],
    rapidFireSolvedIds: [],
    revealedMediaIndex: -1,
    pendingJoiners: [],
    eventNotifications: [],
  }
}

// ─── Event-Katalog ─────────────────────────────────────────────────────────

interface EventDef {
  type: SpecialEventType
  label: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  needsSecondary: boolean
  group: 'streak' | 'buzz' | 'score' | 'meta'
}

const EVENTS: EventDef[] = [
  { type: 'ON_FIRE',         label: 'On Fire',         icon: Flame,      color: 'text-amber-400',  needsSecondary: false, group: 'streak' },
  { type: 'COLD_STREAK',     label: 'Cold Streak',     icon: Snowflake,  color: 'text-cyan-300',   needsSecondary: false, group: 'streak' },
  { type: 'STREAK_BROKEN',   label: 'Streak Broken',   icon: HeartCrack, color: 'text-bad',        needsSecondary: false, group: 'streak' },
  { type: 'CLOSE_BUZZ',      label: 'Close Buzz',      icon: Bell,       color: 'text-bad',        needsSecondary: true,  group: 'buzz' },
  { type: 'SPEED_DEMON',     label: 'Speed Demon',     icon: Zap,        color: 'text-cyan-300',   needsSecondary: false, group: 'buzz' },
  { type: 'ROBBED',          label: 'Robbed',          icon: Ghost,      color: 'text-violet-300', needsSecondary: true,  group: 'buzz' },
  { type: 'FIRST_BLOOD',     label: 'First Blood',     icon: Droplet,    color: 'text-red-400',    needsSecondary: false, group: 'score' },
  { type: 'BIG_SCORE',       label: 'Big Score',       icon: Gem,        color: 'text-amber-300',  needsSecondary: false, group: 'score' },
  { type: 'COMEBACK',        label: 'Comeback',        icon: TrendingUp, color: 'text-violet-300', needsSecondary: false, group: 'score' },
  { type: 'UNDERDOG',        label: 'Underdog',        icon: Dog,        color: 'text-cyan-300',   needsSecondary: false, group: 'score' },
  { type: 'AFK',             label: 'AFK',             icon: Moon,       color: 'text-amber-300',  needsSecondary: false, group: 'meta' },
  { type: 'PERFECT_CATEGORY', label: 'Perfect Category', icon: Trophy,   color: 'text-amber-300',  needsSecondary: false, group: 'meta' },
]

interface PayloadDefaults {
  streak: number
  reactionMs: number
  deltaMs: number
  pointValue: number
  finalStreak: number
  categoryName: string
  idleCount: number
}

function buildPayload(
  type: SpecialEventType,
  primary: PlayerState,
  secondary: PlayerState | null,
  d: PayloadDefaults,
): Record<string, unknown> {
  const baseP = { playerId: primary.id, playerName: primary.displayName, playerColor: primary.color }
  switch (type) {
    case 'ON_FIRE':       return { ...baseP, streak: d.streak }
    case 'COLD_STREAK':   return { ...baseP, streak: d.streak }
    case 'STREAK_BROKEN': return { ...baseP, finalStreak: d.finalStreak }
    case 'FIRST_BLOOD':   return baseP
    case 'BIG_SCORE':     return { ...baseP, pointValue: d.pointValue }
    case 'COMEBACK':      return baseP
    case 'UNDERDOG':      return baseP
    case 'SPEED_DEMON':   return { ...baseP, reactionMs: d.reactionMs }
    case 'AFK':           return { ...baseP, idleCount: d.idleCount }
    case 'PERFECT_CATEGORY': return { categoryId: 'cat-debug', categoryName: d.categoryName }
    case 'CLOSE_BUZZ': {
      const winner = secondary ?? primary
      const loser = primary
      return {
        winnerPlayerId: winner.id, winnerName: winner.displayName, winnerColor: winner.color,
        loserPlayerId: loser.id, loserName: loser.displayName, loserColor: loser.color,
        deltaMs: d.deltaMs,
      }
    }
    case 'ROBBED': {
      const robbed = secondary ?? primary
      const thief = primary
      return {
        thiefPlayerId: thief.id, thiefName: thief.displayName, thiefColor: thief.color,
        robbedPlayerId: robbed.id, robbedName: robbed.displayName,
        pointValue: d.pointValue,
      }
    }
  }
}

// ─── Route ─────────────────────────────────────────────────────────────────

export const Route = createFileRoute('/admin/debug')({
  loader: async () => {
    const { auth } = await import('#/lib/auth')
    const request = getRequest()
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) throw redirect({ to: '/auth/login' })
    const isAdmin = (session.user as { isAdmin?: boolean }).isAdmin === true
    if (!isAdmin) throw redirect({ to: '/' })
    return null
  },
  component: AdminDebugPage,
})

// ─── Page ──────────────────────────────────────────────────────────────────

type Tab = 'events'
type Surface = 'tv' | 'master' | 'player' | 'all'

function AdminDebugPage() {
  const [tab] = useState<Tab>('events')

  return (
    <PageContainer size="full">
      <PageHeader
        title="Admin · Debug"
        subtitle="Schwer-manuell-testbare Features in Isolation prüfen."
      />

      <div className="flex gap-2 mb-6">
        <TabButton active={tab === 'events'}>Special Events</TabButton>
      </div>

      {tab === 'events' && <SpecialEventsTab />}
    </PageContainer>
  )
}

function TabButton({
  active, children,
}: { active: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={`px-4 h-10 rounded-xl text-sm font-semibold transition-colors ${
        active
          ? 'bg-violet-500 text-white shadow-[var(--shadow-glow-violet)]'
          : 'bg-bg-800 text-ink-300 hover:bg-bg-700'
      }`}
    >
      {children}
    </button>
  )
}

// ─── Tab: Special Events ───────────────────────────────────────────────────

function SpecialEventsTab() {
  const [players, setPlayers] = useState<PlayerState[]>(() => makeInitialPlayers())
  const [notifications, setNotifications] = useState<GameState['eventNotifications']>([])
  const [selfId, setSelfId] = useState<string>('p1')
  const [primaryId, setPrimaryId] = useState<string>('p1')
  const [secondaryId, setSecondaryId] = useState<string>('p2')
  const [surface, setSurface] = useState<Surface>('all')
  const [soundOn, setSoundOn] = useState(false)

  const [defaults, setDefaults] = useState<PayloadDefaults>({
    streak: 5,
    reactionMs: 187,
    deltaMs: 23,
    pointValue: 1000,
    finalStreak: 4,
    categoryName: 'Filme',
    idleCount: 4,
  })

  const allTimerRef = useRef<number | null>(null)

  const state: GameState = useMemo(
    () => ({ ...makeInitialState(players), eventNotifications: notifications }),
    [players, notifications],
  )

  function fire(type: SpecialEventType) {
    const primary = players.find(p => p.id === primaryId) ?? players[0]
    const secondary = players.find(p => p.id === secondaryId) ?? null
    const payload = buildPayload(type, primary, secondary, defaults)
    setNotifications(prev => {
      const fakeState: GameState = { ...state, eventNotifications: prev }
      return pushNotification(fakeState, type, payload).eventNotifications
    })
  }

  function fireAll() {
    if (allTimerRef.current !== null) {
      window.clearInterval(allTimerRef.current)
      allTimerRef.current = null
      return
    }
    let i = 0
    fire(EVENTS[i].type)
    i++
    allTimerRef.current = window.setInterval(() => {
      if (i >= EVENTS.length) {
        if (allTimerRef.current !== null) window.clearInterval(allTimerRef.current)
        allTimerRef.current = null
        return
      }
      fire(EVENTS[i].type)
      i++
    }, 1200)
  }

  function clearNotifications() {
    setNotifications([])
  }

  function resetAll() {
    setPlayers(makeInitialPlayers())
    setNotifications([])
    setSelfId('p1')
    setPrimaryId('p1')
    setSecondaryId('p2')
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Spalte 1: Player-Controls */}
      <section className="lg:col-span-3 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-board uppercase text-xl text-ink-100">Spieler</h2>
          <button
            type="button"
            onClick={resetAll}
            className="inline-flex items-center gap-1 text-xs text-ink-400 hover:text-ink-100 px-2 h-8 rounded-lg hover:bg-bg-800"
            title="Alles zurücksetzen"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
        </div>
        {players.map(p => (
          <PlayerControlCard
            key={p.id}
            player={p}
            isSelf={p.id === selfId}
            onSelfPick={() => setSelfId(p.id)}
            onPatch={patch => setPlayers(prev => prev.map(x => x.id === p.id ? { ...x, ...patch } : x))}
          />
        ))}
      </section>

      {/* Spalte 2: Event-Trigger-Panel */}
      <section className="lg:col-span-4 flex flex-col gap-3">
        <h2 className="font-board uppercase text-xl text-ink-100">Events triggern</h2>

        <Card className="p-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Primary">
              <PlayerSelect value={primaryId} onChange={setPrimaryId} players={players} />
            </FormField>
            <FormField label="Secondary">
              <PlayerSelect value={secondaryId} onChange={setSecondaryId} players={players} />
            </FormField>
          </div>
          <p className="text-[11px] text-ink-500">
            Primary = der Spieler im Mittelpunkt. Secondary nur für CLOSE_BUZZ (Winner) und ROBBED (Bestohlener).
          </p>
        </Card>

        <Card className="p-3 grid grid-cols-2 gap-3">
          <NumField label="Streak" value={defaults.streak} onChange={v => setDefaults(d => ({ ...d, streak: v }))} />
          <NumField label="Final Streak" value={defaults.finalStreak} onChange={v => setDefaults(d => ({ ...d, finalStreak: v }))} />
          <NumField label="Reaction (ms)" value={defaults.reactionMs} onChange={v => setDefaults(d => ({ ...d, reactionMs: v }))} />
          <NumField label="Delta (ms)" value={defaults.deltaMs} onChange={v => setDefaults(d => ({ ...d, deltaMs: v }))} />
          <NumField label="Point Value" value={defaults.pointValue} onChange={v => setDefaults(d => ({ ...d, pointValue: v }))} />
          <NumField label="Idle Count" value={defaults.idleCount} onChange={v => setDefaults(d => ({ ...d, idleCount: v }))} />
          <FormField label="Kategorie" className="col-span-2">
            <Input
              value={defaults.categoryName}
              onChange={e => setDefaults(d => ({ ...d, categoryName: e.target.value }))}
            />
          </FormField>
        </Card>

        <div className="grid grid-cols-2 gap-2">
          {EVENTS.map(ev => {
            const Icon = ev.icon
            return (
              <button
                key={ev.type}
                type="button"
                onClick={() => fire(ev.type)}
                className="group flex items-center gap-2 px-3 h-11 rounded-xl bg-bg-800 hover:bg-bg-700 border border-bg-700 text-left transition-colors"
                title={ev.type}
              >
                <Icon className={`w-4 h-4 shrink-0 ${ev.color}`} />
                <span className="text-sm font-semibold text-ink-100 truncate">{ev.label}</span>
                {ev.needsSecondary && (
                  <span className="ml-auto text-[10px] text-ink-500 uppercase tracking-wider shrink-0">2P</span>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex gap-2">
          <Button variant="primary" size="md" fullWidth onClick={fireAll} leading={<PlayCircle className="w-4 h-4" />}>
            Alle durchspielen
          </Button>
          <Button variant="subtle" size="md" onClick={clearNotifications} leading={<Trash2 className="w-4 h-4" />}>
            Clear
          </Button>
        </div>
      </section>

      {/* Spalte 3: Surface-Preview */}
      <section className="lg:col-span-5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-board uppercase text-xl text-ink-100">Surface-Preview</h2>
          <button
            type="button"
            onClick={() => setSoundOn(s => !s)}
            className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold border transition-colors ${
              soundOn
                ? 'bg-amber-500/20 border-amber-400/60 text-amber-300'
                : 'bg-bg-800 border-bg-700 text-ink-400 hover:text-ink-200'
            }`}
            title={soundOn ? 'TV-Sound aus' : 'TV-Sound an'}
          >
            {soundOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            Sound
          </button>
        </div>

        <div className="flex gap-1 flex-wrap">
          {(['all', 'tv', 'master', 'player'] as const).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setSurface(s)}
              className={`px-3 h-8 rounded-lg text-xs font-semibold transition-colors ${
                surface === s
                  ? 'bg-cyan-500 text-bg-950'
                  : 'bg-bg-800 text-ink-300 hover:bg-bg-700'
              }`}
            >
              {s === 'all' ? 'Alle' : s.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          {(surface === 'all' || surface === 'tv') && (
            <SurfaceBox label="TV" state={state} surface="tv" enableSound={soundOn} />
          )}
          {(surface === 'all' || surface === 'master') && (
            <SurfaceBox label="Master" state={state} surface="master" />
          )}
          {(surface === 'all' || surface === 'player') && (
            <SurfaceBox label={`Player (${players.find(p => p.id === selfId)?.displayName ?? '?'})`}
              state={state} surface="player" selfPlayerId={selfId} />
          )}
        </div>
      </section>
    </div>
  )
}

// ─── Surface Preview Box ───────────────────────────────────────────────────

function SurfaceBox({
  label, state, surface, selfPlayerId, enableSound,
}: {
  label: string
  state: GameState
  surface: 'tv' | 'master' | 'player'
  selfPlayerId?: string
  enableSound?: boolean
}) {
  const minH = surface === 'tv' ? 'min-h-[420px]' : 'min-h-[260px]'
  const tone =
    surface === 'tv' ? 'bg-bg-950 border-bg-700'
      : surface === 'master' ? 'bg-bg-900 border-violet-700/40'
      : 'bg-bg-900 border-cyan-500/30'

  return (
    <div className={`rounded-2xl border ${tone} overflow-hidden`}>
      <div className="px-3 py-2 flex items-center justify-between border-b border-bg-800 bg-bg-900/60">
        <span className="font-board uppercase text-sm tracking-wider text-ink-200">{label}</span>
        <Scoreboard
          players={state.players}
          masterId={state.masterId}
          activePlayerId={null}
          mode="row"
        />
      </div>
      <div className={`relative ${minH} overflow-hidden`}>
        <EventNotificationOverlay
          state={state}
          surface={surface}
          selfPlayerId={selfPlayerId ?? null}
          containerMode
          enableSound={surface === 'tv' ? enableSound : false}
        />
      </div>
    </div>
  )
}

// ─── Player-Card ───────────────────────────────────────────────────────────

function PlayerControlCard({
  player, isSelf, onSelfPick, onPatch,
}: {
  player: PlayerState
  isSelf: boolean
  onSelfPick: () => void
  onPatch: (patch: Partial<PlayerState>) => void
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-3 mb-3">
        <Avatar name={player.displayName} player={player} />
        <Input
          value={player.displayName}
          onChange={e => onPatch({ displayName: e.target.value })}
          className="flex-1"
        />
        <button
          type="button"
          onClick={onSelfPick}
          className={`px-2 h-7 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-colors ${
            isSelf
              ? 'bg-cyan-500 border-cyan-400 text-bg-950'
              : 'bg-bg-800 border-bg-700 text-ink-400 hover:text-ink-100'
          }`}
          title="Als 'Self' für Player-Surface verwenden"
        >
          Self
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <NumField label="Score" value={player.score}
          onChange={v => onPatch({ score: v })} />
        <ColorBlock color={player.color} />
      </div>

      <SliderField label="Correct Streak" value={player.correctStreak} max={10}
        onChange={v => onPatch({ correctStreak: v })} />
      <SliderField label="Wrong Streak" value={player.wrongStreak} max={10}
        onChange={v => onPatch({ wrongStreak: v })} />
      <SliderField label="Idle Count" value={player.idleQuestionsCount} max={10}
        onChange={v => onPatch({ idleQuestionsCount: v })} />
    </Card>
  )
}

function ColorBlock({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="block w-6 h-6 rounded-md border border-bg-700" style={{ background: color }} />
      <span className="font-mono text-[11px] text-ink-400">{color}</span>
    </div>
  )
}

// ─── Form-Bits ─────────────────────────────────────────────────────────────

function NumField({
  label, value, onChange,
}: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <FormField label={label}>
      <Input
        type="number"
        value={value}
        onChange={e => onChange(Number(e.target.value) || 0)}
      />
    </FormField>
  )
}

function SliderField({
  label, value, max, onChange,
}: { label: string; value: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="mb-1.5">
      <div className="flex items-center justify-between text-[11px] text-ink-400 mb-0.5">
        <span>{label}</span>
        <span className="font-mono text-ink-200">{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-violet-500"
      />
    </div>
  )
}

function PlayerSelect({
  value, onChange, players,
}: { value: string; onChange: (v: string) => void; players: PlayerState[] }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full h-10 px-3 rounded-xl bg-bg-800 border border-bg-700 text-ink-50 text-sm focus:outline-none focus:border-violet-500"
    >
      {players.map(p => (
        <option key={p.id} value={p.id}>{p.displayName}</option>
      ))}
    </select>
  )
}
