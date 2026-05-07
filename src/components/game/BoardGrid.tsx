import { motion } from 'framer-motion'
import type { BoardCategory, BoardQuestion } from '#/lib/game-state'
import { formatPoints } from '#/lib/format'

interface BoardGridProps {
  board: BoardCategory[]
}

export function BoardGrid({ board }: BoardGridProps) {
  const cols = board.length
  const rows = board[0]?.questions.length ?? 0

  return (
    <div
      className="h-full grid gap-2.5"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `auto repeat(${rows}, 1fr)`,
      }}
    >
      {board.map(cat => (
        <div
          key={cat.id}
          className="bg-gradient-to-b from-violet-700/80 to-violet-600/40 rounded-[var(--radius-tile)] flex items-center justify-center px-3 py-3 border border-violet-400/20"
        >
          <span className="font-board uppercase text-cyan-300 text-center leading-tight tracking-[0.06em] text-[clamp(0.875rem,1.4vw,1.5rem)]">
            {cat.name}
          </span>
        </div>
      ))}
      {board[0]?.questions.map((_, rowIdx) =>
        board.map(cat => {
          const q = cat.questions[rowIdx]
          if (!q) return <div key={`${cat.id}-${rowIdx}`} />
          return <BoardTile key={q.id} q={q} />
        }),
      )}
    </div>
  )
}

function BoardTile({ q }: { q: BoardQuestion }) {
  // Empty placeholder — sehr gedämpft, kein Text
  if (q.empty) {
    return (
      <div className="rounded-[var(--radius-tile)] border border-bg-800/50 bg-bg-900/30" />
    )
  }

  // Erledigte Frage
  if (q.answered) {
    const solverCount = q.solverColors.length
    const skipped = solverCount === 0

    if (skipped) {
      // Übersprungen / niemand gelöst — neutral grau, Punkte durchgestrichen
      return (
        <div className="rounded-[var(--radius-tile)] border border-bg-700/40 bg-bg-900/40 flex items-center justify-center relative overflow-hidden">
          <span className="font-board text-bg-600 leading-none text-[clamp(2rem,4vw,5rem)] line-through decoration-bg-600/70 decoration-[3px]">
            {formatPoints(q.pointValue)}
          </span>
        </div>
      )
    }

    // Gelöst → Spielerfarbe(n) als Ring(e) von außen nach innen
    return <SolvedTile pointValue={q.pointValue} solverColors={q.solverColors} />
  }

  // Verfügbare Frage — leichte Shine-Animation
  return (
    <motion.div
      layoutId={`tile-${q.id}`}
      transition={{ type: 'spring', stiffness: 280, damping: 28 }}
      className="tile-available rounded-[var(--radius-tile)] border border-violet-500/30 bg-gradient-to-br from-bg-700 via-bg-800 to-bg-900 flex items-center justify-center shadow-[var(--shadow-tile)] relative overflow-hidden"
    >
      <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/40 to-transparent" />
      <span className="font-board text-cyan-400 leading-none text-[clamp(2.5rem,5vw,6rem)] drop-shadow-[0_4px_24px_rgb(34_211_238_/_0.35)]">
        {formatPoints(q.pointValue)}
      </span>
    </motion.div>
  )
}

function SolvedTile({
  pointValue,
  solverColors,
}: {
  pointValue: number
  solverColors: string[]
}) {
  const N = solverColors.length
  // Radial-Gradient: 0% = Mitte, 100% = Rand.
  // solverColors[0] ist erste richtige Antwort → außen.
  // Ring i (von außen=0) liegt zwischen ((N-i-1)/N)*100 und ((N-i)/N)*100.
  // Da CSS-Gradients innen→außen laufen, geben wir Ringe in umgekehrter Reihenfolge an.
  const stops: string[] = []
  for (let ringFromOutside = N - 1; ringFromOutside >= 0; ringFromOutside--) {
    const color = solverColors[ringFromOutside]
    const inner = ((N - ringFromOutside - 1) / N) * 100
    const outer = ((N - ringFromOutside) / N) * 100
    stops.push(`${color} ${inner}%`, `${color} ${outer}%`)
  }
  const gradient = `radial-gradient(circle at center, ${stops.join(', ')})`

  return (
    <div className="rounded-[var(--radius-tile)] relative overflow-hidden flex items-center justify-center border border-bg-700/40 bg-bg-900/40">
      {/* Farb-Hintergrund (gedämpft via Opacity-Layer) */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-70"
        style={{ background: gradient }}
      />
      {/* Dunkler Vignette-Overlay für Kontrast & "verbraucht"-Look */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgb(7_8_15_/_0.55)_100%)]"
      />
      {/* Punkte */}
      <span className="relative font-board leading-none text-[clamp(2rem,4vw,5rem)] text-white/90 drop-shadow-[0_2px_8px_rgb(0_0_0_/_0.65)]">
        {formatPoints(pointValue)}
      </span>
    </div>
  )
}
