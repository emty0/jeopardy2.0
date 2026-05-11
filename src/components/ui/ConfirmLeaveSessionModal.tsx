import { Modal } from './Modal'
import { Button } from './Button'
import { AlertTriangle } from 'lucide-react'

interface Props {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmLeaveSessionModal({ open, onCancel, onConfirm }: Props) {
  return (
    <Modal open={open} onClose={onCancel} size="sm" title="Aktive Session verlassen?">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <p className="text-ink-200 text-sm leading-relaxed">
            Du bist aktuell in einer anderen Session.
            Wenn du fortfährst, wirst du dort entfernt
            (als Spielleiter wird die Session beendet) und der neuen Session beigetreten.
          </p>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="subtle" onClick={onCancel}>Abbrechen</Button>
          <Button variant="primary" onClick={onConfirm}>Verlassen & beitreten</Button>
        </div>
      </div>
    </Modal>
  )
}
