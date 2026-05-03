import { useState, useEffect, useCallback, useRef } from 'react'
import type { GameState } from '#/lib/game-state'

export function useGameSocket(sessionId: string, playerId: string | null) {
  const [state, setState] = useState<GameState | null>(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws/${sessionId}`)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      if (playerId) {
        ws.send(JSON.stringify({ type: 'JOIN', payload: { playerId } }))
      }
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string)
        if (msg.type === 'STATE_UPDATE') {
          setState(msg.payload as GameState)
        }
      } catch {
        // ignore parse errors
      }
    }

    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)

    return () => ws.close()
  }, [sessionId, playerId])

  const send = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }))
    }
  }, [])

  return { state, send, connected }
}
