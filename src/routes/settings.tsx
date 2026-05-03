import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { authClient } from '#/lib/auth-client'
import { auth } from '#/lib/auth'
import { db } from '#/db/index'
import { user } from '#/db/schema'
import { eq } from 'drizzle-orm'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'

const updateBuzzerSound = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ buzzerSoundUrl: z.string() }))
  .handler(async ({ data }) => {
    const request = getRequest()
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) throw new Error('Nicht angemeldet')
    await db.update(user).set({ buzzerSoundUrl: data.buzzerSoundUrl }).where(eq(user.id, session.user.id))
    return { ok: true }
  })

const getMyProfile = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest()
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw redirect({ to: '/auth/login' })
  const u = await db.select().from(user).where(eq(user.id, session.user.id)).get()
  return u
})

const BUILTIN_SOUNDS = [
  { label: 'Standard-Buzzer', value: '/sounds/default-buzz.wav' },
  { label: 'Glocke', value: '/sounds/bell.wav' },
  { label: 'Sirene', value: '/sounds/siren.wav' },
]

export const Route = createFileRoute('/settings')({
  loader: async () => getMyProfile(),
  component: SettingsPage,
})

function SettingsPage() {
  const profile = Route.useLoaderData()
  const { data: session } = authClient.useSession()
  const [selectedSound, setSelectedSound] = useState(profile?.buzzerSoundUrl ?? '/sounds/default-buzz.mp3')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [customSounds, setCustomSounds] = useState<Array<{ label: string; value: string }>>([])

  function playSound(url: string) {
    new Audio(url).play().catch(() => {})
  }

  async function handleSoundUpload(file: File) {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as {message?: string}).message ?? 'Upload fehlgeschlagen') }
      const { url } = await res.json() as { url: string }
      const entry = { label: file.name, value: url }
      setCustomSounds(prev => [...prev, entry])
      setSelectedSound(url)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Upload fehlgeschlagen')
    } finally {
      setUploading(false)
    }
  }

  async function saveSound() {
    setSaving(true)
    await updateBuzzerSound({ data: { buzzerSoundUrl: selectedSound } })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Einstellungen</h1>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-6">
        <h2 className="font-semibold mb-1">Profil</h2>
        <p className="text-neutral-400 text-sm mb-4">Name und E-Mail werden über den Auth-Provider verwaltet.</p>
        <div className="space-y-2 text-sm">
          <p><span className="text-neutral-400">Name: </span>{session?.user?.name}</p>
          <p><span className="text-neutral-400">E-Mail: </span>{session?.user?.email}</p>
          <p><span className="text-neutral-400">Benutzername: </span>@{(profile as {username?: string})?.username}</p>
        </div>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
        <h2 className="font-semibold mb-4">Buzzer-Sound</h2>
        <div className="space-y-2 mb-4">
          {[...BUILTIN_SOUNDS, ...customSounds].map(s => (
            <label key={s.value} className="flex items-center gap-3 cursor-pointer group">
              <input
                type="radio"
                name="buzzer"
                value={s.value}
                checked={selectedSound === s.value}
                onChange={() => setSelectedSound(s.value)}
                className="accent-yellow-400"
              />
              <span className="text-sm truncate">{s.label}</span>
              <button
                type="button"
                onClick={() => playSound(s.value)}
                className="text-xs text-neutral-500 hover:text-yellow-400 transition-colors ml-auto shrink-0"
              >
                ▶ Testen
              </button>
            </label>
          ))}
        </div>
        <div className="mb-4">
          <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${uploading ? 'bg-neutral-700 text-neutral-500' : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-200'}`}>
            {uploading ? 'Wird hochgeladen…' : '+ Eigenen Sound hochladen (.mp3 / .wav, max. 20 MB)'}
            <input
              type="file"
              accept="audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg"
              className="hidden"
              disabled={uploading}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleSoundUpload(f); e.target.value = '' }}
            />
          </label>
        </div>
        <button
          onClick={saveSound}
          disabled={saving}
          className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-bold rounded-lg transition-colors"
        >
          {saved ? '✓ Gespeichert' : saving ? 'Speichern…' : 'Speichern'}
        </button>
      </div>
    </div>
  )
}
