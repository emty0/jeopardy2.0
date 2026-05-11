import { defineWebSocketHandler } from 'nitro/h3'
import { loadGameState, applyEvent, gameStateMap, registerBroadcast, type GameState } from '#/lib/game-state'

// Maps peer.id → { sessionId, playerId }
const peerMeta = new Map<string, { sessionId: string; playerId: string | null }>()
// Active peers per session — Set of peer instances (für externes broadcastState)
const sessionPeers = new Map<string, Set<any>>()

registerBroadcast((sessionId: string, state: GameState) => {
  const peers = sessionPeers.get(sessionId)
  if (!peers || peers.size === 0) return
  const msg = JSON.stringify({ type: 'STATE_UPDATE', payload: state })
  for (const peer of peers) {
    try { peer.send(msg) } catch { /* peer dead */ }
  }
})

export default defineWebSocketHandler({
  async open(peer) {
    const url = new URL(peer.request?.url ?? '', 'http://localhost')
    const sessionId = url.pathname.split('/').at(-1) ?? ''
    peerMeta.set(peer.id, { sessionId, playerId: null })
    peer.subscribe(`session:${sessionId}`)
    let set = sessionPeers.get(sessionId)
    if (!set) { set = new Set(); sessionPeers.set(sessionId, set) }
    set.add(peer)
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
      // Force reload from DB so newly joined players are included
      gameStateMap.delete(meta.sessionId)
      if (meta.playerId) {
        await applyEvent(meta.sessionId, { type: 'PLAYER_CONNECTED', payload: { playerId: meta.playerId } })
      }
      // Wenn JOIN ohne playerId (z.B. Lobby-Page für Pending-Joiner) → trotzdem
      // aktuellen State an diesen Peer senden.
      if (!meta.playerId) {
        const state = await loadGameState(meta.sessionId)
        if (state) peer.send(JSON.stringify({ type: 'STATE_UPDATE', payload: state }))
        return
      }
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
    if (meta) {
      const set = sessionPeers.get(meta.sessionId)
      if (set) {
        set.delete(peer)
        if (set.size === 0) sessionPeers.delete(meta.sessionId)
      }
    }
    peer.unsubscribe(`session:${meta?.sessionId ?? ''}`)
    peerMeta.delete(peer.id)
  },
})
