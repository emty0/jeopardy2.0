import { defineWebSocketHandler } from 'nitro/h3'
import { loadGameState, applyEvent } from '#/lib/game-state'

// Maps peer.id → { sessionId, playerId }
const peerMeta = new Map<string, { sessionId: string; playerId: string | null }>()

export default defineWebSocketHandler({
  async open(peer) {
    const url = new URL(peer.request?.url ?? '', 'http://localhost')
    const sessionId = url.pathname.split('/').at(-1) ?? ''
    peerMeta.set(peer.id, { sessionId, playerId: null })
    peer.subscribe(`session:${sessionId}`)
    const state = await loadGameState(sessionId)
    if (state) {
      peer.send(JSON.stringify({ type: 'STATE_UPDATE', payload: state }))
    }
  },

  async message(peer, message) {
    const meta = peerMeta.get(peer.id)
    if (!meta) return

    let event: { type: string; payload: Record<string, unknown> }
    try {
      event = JSON.parse(message.text())
    } catch {
      return
    }

    if (event.type === 'JOIN') {
      meta.playerId = (event.payload.playerId as string) ?? null
      peerMeta.set(peer.id, meta)
      await applyEvent(meta.sessionId, { type: 'PLAYER_CONNECTED', payload: { playerId: meta.playerId } })
    }

    const newState = await applyEvent(meta.sessionId, event)
    if (newState) {
      const msg = JSON.stringify({ type: 'STATE_UPDATE', payload: newState })
      peer.publish(`session:${meta.sessionId}`, msg)
      peer.send(msg)
    }
  },

  async close(peer) {
    const meta = peerMeta.get(peer.id)
    if (meta?.playerId) {
      const newState = await applyEvent(meta.sessionId, {
        type: 'PLAYER_DISCONNECTED',
        payload: { playerId: meta.playerId },
      })
      if (newState) {
        peer.publish(`session:${meta.sessionId}`, JSON.stringify({ type: 'STATE_UPDATE', payload: newState }))
      }
    }
    peer.unsubscribe(`session:${meta?.sessionId ?? ''}`)
    peerMeta.delete(peer.id)
  },
})
