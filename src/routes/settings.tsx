import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { authClient } from '#/lib/auth-client'
import { user } from '#/db/schema'
import { eq } from 'drizzle-orm'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'
import { Play, Upload, Check, User, Mail, AtSign } from 'lucide-react'
import {
  Button,
  Card,
  PageContainer,
  PageHeader,
} from '#/components/ui'

const updateBuzzerSound = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ buzzerSoundUrl: z.string() }))
  .handler(async ({ data }) => {
    const { auth } = await import('#/lib/auth')
    const { db } = await import('#/db/index')

    const request = getRequest()
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) throw new Error('Nicht angemeldet')
    await db
      .update(user)
      .set({ buzzerSoundUrl: data.buzzerSoundUrl })
      .where(eq(user.id, session.user.id))
    return { ok: true }
  })

const getMyProfile = createServerFn({ method: 'GET' }).handler(async () => {
  const { auth } = await import('#/lib/auth')
  const { db } = await import('#/db/index')

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
  const [selectedSound, setSelectedSound] = useState(
    profile?.buzzerSoundUrl ?? '/sounds/default-buzz.wav',
  )
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
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error((e as { message?: string }).message ?? 'Upload fehlgeschlagen')
      }
      const { url } = (await res.json()) as { url: string }
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

  const allSounds = [...BUILTIN_SOUNDS, ...customSounds]

  return (
    <PageContainer size="md">
      <PageHeader eyebrow="Konto" title="Einstellungen" />

      <div className="flex flex-col gap-6">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <User className="w-4 h-4" />
            </div>
            <h2 className="font-board uppercase tracking-wider text-lg text-ink-50">Profil</h2>
          </div>
          <p className="text-ink-300 text-sm mb-4">
            Name und E-Mail werden über den Auth-Provider verwaltet.
          </p>
          <div className="grid sm:grid-cols-3 gap-3">
            <ProfileField icon={<User className="w-3.5 h-3.5" />} label="Name" value={session?.user?.name ?? '—'} />
            <ProfileField icon={<Mail className="w-3.5 h-3.5" />} label="E-Mail" value={session?.user?.email ?? '—'} />
            <ProfileField icon={<AtSign className="w-3.5 h-3.5" />} label="Username" value={`@${(profile as { username?: string })?.username ?? '?'}`} />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Play className="w-4 h-4" />
            </div>
            <h2 className="font-board uppercase tracking-wider text-lg text-ink-50">
              Buzzer-Sound
            </h2>
          </div>
          <p className="text-ink-300 text-sm mb-4">
            Wähle den Klang, den du hörst, wenn du erfolgreich gebuzzert hast.
          </p>

          <div className="flex flex-col gap-2 mb-4">
            {allSounds.map(s => {
              const checked = selectedSound === s.value
              return (
                <label
                  key={s.value}
                  className={[
                    'flex items-center gap-3 px-4 h-12 rounded-xl border cursor-pointer transition-colors',
                    checked
                      ? 'border-cyan-500/50 bg-cyan-500/10'
                      : 'border-bg-700 bg-bg-800 hover:border-bg-600',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="buzzer"
                    value={s.value}
                    checked={checked}
                    onChange={() => setSelectedSound(s.value)}
                    className="sr-only"
                  />
                  <span
                    className={[
                      'w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center',
                      checked ? 'border-cyan-400' : 'border-bg-600',
                    ].join(' ')}
                  >
                    {checked && <span className="w-2 h-2 rounded-full bg-cyan-400" />}
                  </span>
                  <span className="text-sm font-medium text-ink-50 truncate flex-1">{s.label}</span>
                  <button
                    type="button"
                    onClick={e => {
                      e.preventDefault()
                      playSound(s.value)
                    }}
                    className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg text-xs text-ink-300 hover:text-cyan-300 hover:bg-bg-700 transition-colors shrink-0"
                  >
                    <Play className="w-3 h-3" />
                    Test
                  </button>
                </label>
              )
            })}
          </div>

          <label
            className={[
              'inline-flex items-center gap-2 h-11 px-4 rounded-xl text-sm font-bold cursor-pointer transition-colors mb-4 border',
              uploading
                ? 'bg-bg-700 text-ink-500 border-bg-600 cursor-wait'
                : 'bg-bg-700 hover:bg-bg-600 text-ink-50 border-bg-600',
            ].join(' ')}
          >
            <Upload className="w-4 h-4" />
            {uploading ? 'Wird hochgeladen…' : 'Eigenen Sound hochladen'}
            <input
              type="file"
              accept="audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg"
              className="hidden"
              disabled={uploading}
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) handleSoundUpload(f)
                e.target.value = ''
              }}
            />
          </label>
          <p className="text-xs text-ink-500 mb-4">.mp3 / .wav / .ogg, max. 20 MB.</p>

          <Button
            onClick={saveSound}
            variant={saved ? 'success' : 'primary'}
            size="lg"
            disabled={saving}
            leading={saved ? <Check className="w-4 h-4" /> : undefined}
          >
            {saved ? 'Gespeichert' : saving ? 'Speichern…' : 'Speichern'}
          </Button>
        </Card>
      </div>
    </PageContainer>
  )
}

function ProfileField({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-bg-700 bg-bg-800/60 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-[0.2em] text-ink-500 inline-flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className="text-sm text-ink-50 truncate font-medium">{value}</p>
    </div>
  )
}
