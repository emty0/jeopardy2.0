/**
 * Server-only Helper für Single-Active-Session-Enforcement.
 * Liefert die aktive Session des Users (falls vorhanden) — optional unter
 * Ausschluss einer Ziel-Session-Id (für „bin ich schon DORT drin?"-Check).
 * Verwendet die gleiche Query-Logik wie `getActiveGame` in `__root.tsx`.
 */
export async function findActiveSessionForUser(
  userId: string,
  excludeSessionId?: string,
): Promise<{ sessionId: string; isMaster: boolean } | null> {
  const { db } = await import('#/db/index')
  const { gameSession, gamePlayer } = await import('#/db/schema')
  const { eq, and, ne } = await import('drizzle-orm')

  // Als Spieler in einer Session?
  const asPlayerRows = await db
    .select({ sessionId: gamePlayer.sessionId })
    .from(gamePlayer)
    .innerJoin(gameSession, eq(gameSession.id, gamePlayer.sessionId))
    .where(and(eq(gamePlayer.userId, userId), ne(gameSession.status, 'finished')))
    .all()
  const asPlayer = asPlayerRows.find(r => r.sessionId !== excludeSessionId)
  if (asPlayer) return { sessionId: asPlayer.sessionId, isMaster: false }

  // Als Master einer Session?
  const asMasterRows = await db
    .select({ id: gameSession.id })
    .from(gameSession)
    .where(and(eq(gameSession.masterId, userId), ne(gameSession.status, 'finished')))
    .all()
  const asMaster = asMasterRows.find(r => r.id !== excludeSessionId)
  if (asMaster) return { sessionId: asMaster.id, isMaster: true }

  return null
}

/**
 * Kanonisches Prefix für Konflikt-Errors. Client-Seite parsed `message`,
 * extrahiert das JSON nach dem `:` und öffnet das Confirm-Modal.
 */
export const CONFLICT_PREFIX = 'CONFLICT_ACTIVE_SESSION:'

export function conflictError(payload: { sessionId: string; isMaster: boolean }): Error {
  return new Error(CONFLICT_PREFIX + JSON.stringify(payload))
}

export function parseConflictError(err: unknown): { sessionId: string; isMaster: boolean } | null {
  if (!(err instanceof Error)) return null
  const idx = err.message.indexOf(CONFLICT_PREFIX)
  if (idx < 0) return null
  try {
    return JSON.parse(err.message.slice(idx + CONFLICT_PREFIX.length))
  } catch {
    return null
  }
}
