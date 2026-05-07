import { Check, X, SkipForward, Shield, ArrowRight, Play, Zap, RotateCcw, StopCircle } from 'lucide-react'
import { Button } from '#/components/ui'
import { formatDelta } from '#/lib/format'

interface JudgeBarProps {
  variant: 'lobby' | 'preview' | 'open' | 'judging' | 'reveal' | 'idle'
  canStart?: boolean
  noPenalty?: boolean
  rewardOnCorrect?: number
  penaltyOnWrong?: number
  isRapidFire?: boolean
  onStart?: () => void
  onStartQuestion?: () => void
  onSkip?: () => void
  onTogglePenalty?: () => void
  onJudgeCorrect?: () => void
  onJudgeCorrectContinue?: () => void
  onJudgeWrong?: () => void
  onNext?: () => void
}

export function JudgeBar(props: JudgeBarProps) {
  return (
    <div className="shrink-0 bg-bg-900/95 backdrop-blur-md border-t border-bg-700 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] z-30">
      {props.variant === 'lobby' && (
        <Button
          variant="primary"
          size="xl"
          fullWidth
          onClick={props.onStart}
          disabled={!props.canStart}
          leading={<Play className="w-5 h-5" />}
        >
          Spiel starten
        </Button>
      )}

      {props.variant === 'preview' && (
        <Button
          variant="primary"
          size="xl"
          fullWidth
          onClick={props.onStartQuestion}
          leading={<Play className="w-5 h-5" />}
        >
          Frage starten
        </Button>
      )}

      {props.variant === 'open' && (
        <div className="flex gap-2">
          {props.isRapidFire ? (
            <>
              <div className="flex-1 flex items-center gap-2 px-3 h-11 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-amber-300 text-sm font-bold">Mehrmals antworten möglich</span>
              </div>
              <Button variant="subtle" size="lg" onClick={props.onSkip} leading={<SkipForward className="w-4 h-4" />}>
                Skippen
              </Button>
            </>
          ) : (
            <>
              <Button
                variant={props.noPenalty ? 'accent' : 'subtle'}
                size="lg"
                onClick={props.onTogglePenalty}
                leading={<Shield className="w-4 h-4" />}
                className="flex-1"
              >
                {props.noPenalty ? 'Kein Malus aktiv' : 'Kein Malus'}
              </Button>
              <Button
                variant="subtle"
                size="lg"
                onClick={props.onSkip}
                leading={<SkipForward className="w-4 h-4" />}
                className="flex-1"
              >
                Skippen
              </Button>
            </>
          )}
        </div>
      )}

      {props.variant === 'judging' && (
        <div className="flex flex-col gap-2">
          {props.isRapidFire ? (
            <div className="flex items-center gap-2 px-3 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 mb-1">
              <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-amber-300 text-xs font-bold">Mehrmals antworten möglich</span>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                variant={props.noPenalty ? 'accent' : 'subtle'}
                size="sm"
                onClick={props.onTogglePenalty}
                leading={<Shield className="w-3.5 h-3.5" />}
                className="flex-1"
              >
                {props.noPenalty ? 'Kein Malus aktiv' : 'Kein Malus'}
              </Button>
              <Button
                variant="subtle"
                size="sm"
                onClick={props.onSkip}
                leading={<SkipForward className="w-3.5 h-3.5" />}
                className="flex-1"
              >
                Skippen
              </Button>
            </div>
          )}
          {props.isRapidFire ? (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="success"
                  size="xl"
                  onClick={props.onJudgeCorrectContinue}
                  leading={<RotateCcw className="w-5 h-5" />}
                >
                  <span className="flex flex-col items-start leading-tight">
                    <span>Richtig</span>
                    <span className="text-xs font-normal opacity-90">Zurück zur Frage</span>
                  </span>
                </Button>
                <Button
                  variant="success"
                  size="xl"
                  onClick={props.onJudgeCorrect}
                  leading={<StopCircle className="w-5 h-5" />}
                >
                  <span className="flex flex-col items-start leading-tight">
                    <span>Richtig</span>
                    <span className="text-xs font-normal opacity-90">Frage beenden</span>
                  </span>
                </Button>
              </div>
              <Button
                variant="subtle"
                size="lg"
                fullWidth
                onClick={props.onJudgeWrong}
                leading={<X className="w-4 h-4" />}
              >
                Falsch — weiter buzzern
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="success"
                size="xl"
                onClick={props.onJudgeCorrect}
                leading={<Check className="w-5 h-5" />}
              >
                <span className="flex flex-col items-start leading-tight">
                  <span>Richtig</span>
                  <span className="text-xs font-normal opacity-90">{formatDelta(props.rewardOnCorrect ?? 0)}</span>
                </span>
              </Button>
              <Button
                variant="danger"
                size="xl"
                onClick={props.onJudgeWrong}
                leading={<X className="w-5 h-5" />}
              >
                <span className="flex flex-col items-start leading-tight">
                  <span>Falsch</span>
                  <span className="text-xs font-normal opacity-90">{formatDelta(props.penaltyOnWrong ?? 0)}</span>
                </span>
              </Button>
            </div>
          )}
        </div>
      )}

      {props.variant === 'reveal' && (
        <Button
          variant="primary"
          size="xl"
          fullWidth
          onClick={props.onNext}
          trailing={<ArrowRight className="w-5 h-5" />}
        >
          Weiter
        </Button>
      )}

      {props.variant === 'idle' && <div className="h-2" />}
    </div>
  )
}
