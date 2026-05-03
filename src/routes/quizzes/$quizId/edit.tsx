import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { auth } from '#/lib/auth'
import { db } from '#/db/index'
import { quiz, category, question } from '#/db/schema'
import { eq, asc } from 'drizzle-orm'
import { getRequest } from '@tanstack/react-start/server'
import { nanoid } from 'nanoid'
import { z } from 'zod'

const getQuizData = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ quizId: z.string() }))
  .handler(async ({ data }) => {
    const request = getRequest()
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) throw redirect({ to: '/auth/login' })

    const q = await db.select().from(quiz).where(eq(quiz.id, data.quizId)).get()
    if (!q) throw new Error('Quiz nicht gefunden')

    const categories = await db
      .select()
      .from(category)
      .where(eq(category.quizId, data.quizId))
      .orderBy(asc(category.columnIndex))
      .all()

    const questions = await db
      .select()
      .from(question)
      .where(eq(question.quizId, data.quizId))
      .orderBy(asc(question.rowIndex))
      .all()

    return { quiz: q, categories, questions }
  })

const saveCategory = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.string(), name: z.string(), allowRebuzz: z.boolean() }))
  .handler(async ({ data }) => {
    await db.update(category).set({ name: data.name, allowRebuzz: data.allowRebuzz }).where(eq(category.id, data.id))
    return { ok: true }
  })

const saveQuestion = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    id: z.string().optional(),
    categoryId: z.string(),
    quizId: z.string(),
    rowIndex: z.number(),
    questionText: z.string(),
    answerText: z.string(),
    mediaUrl: z.string().optional(),
    mediaType: z.string().optional(),
    youtubeUrl: z.string().optional(),
    allowRebuzz: z.boolean(),
  }))
  .handler(async ({ data }) => {
    if (data.id) {
      await db.update(question).set({
        questionText: data.questionText,
        answerText: data.answerText,
        mediaUrl: data.mediaUrl ?? null,
        mediaType: data.mediaType ?? null,
        youtubeUrl: data.youtubeUrl ?? null,
        allowRebuzz: data.allowRebuzz,
      }).where(eq(question.id, data.id))
      return { id: data.id }
    } else {
      const id = nanoid(10)
      await db.insert(question).values({
        id,
        categoryId: data.categoryId,
        quizId: data.quizId,
        rowIndex: data.rowIndex,
        questionText: data.questionText,
        answerText: data.answerText,
        mediaUrl: data.mediaUrl ?? null,
        mediaType: data.mediaType ?? null,
        youtubeUrl: data.youtubeUrl ?? null,
        allowRebuzz: data.allowRebuzz,
      })
      return { id }
    }
  })

export const Route = createFileRoute('/quizzes/$quizId/edit')({
  loader: async ({ params }) => getQuizData({ data: { quizId: params.quizId } }),
  component: EditQuizPage,
})

type Question = {
  id: string
  categoryId: string
  quizId: string
  rowIndex: number
  questionText: string
  answerText: string
  mediaUrl: string | null
  mediaType: string | null
  youtubeUrl: string | null
  allowRebuzz: boolean
}

type Category = {
  id: string
  quizId: string
  name: string
  columnIndex: number
  allowRebuzz: boolean
}

type EditingQuestion = Partial<Question> & {
  categoryId: string
  quizId: string
  rowIndex: number
}

function EditQuizPage() {
  const { quiz: q, categories: initCats, questions: initQuestions } = Route.useLoaderData()
  const pointValues: number[] = JSON.parse(q.pointValues)
  const [categories, setCategories] = useState<Category[]>(initCats as Category[])
  const [questions, setQuestions] = useState<Question[]>(initQuestions as Question[])
  const [editing, setEditing] = useState<EditingQuestion | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  async function handleMediaUpload(file: File) {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as {message?: string}).message ?? 'Upload fehlgeschlagen') }
      const { url } = await res.json() as { url: string }
      const mediaType = file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : 'video'
      setEditing(prev => prev ? { ...prev, mediaUrl: url, mediaType } : prev)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Upload fehlgeschlagen')
    } finally {
      setUploading(false)
    }
  }

  function getQuestion(catId: string, rowIdx: number) {
    return questions.find(q => q.categoryId === catId && q.rowIndex === rowIdx)
  }

  async function handleCatNameBlur(cat: Category, newName: string) {
    if (newName === cat.name) return
    await saveCategory({ data: { id: cat.id, name: newName, allowRebuzz: cat.allowRebuzz } })
    setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, name: newName } : c))
  }

  function openQuestion(catId: string, rowIdx: number) {
    const existing = getQuestion(catId, rowIdx)
    setEditing(existing ?? { categoryId: catId, quizId: q.id, rowIndex: rowIdx, questionText: '', answerText: '', allowRebuzz: true })
  }

  async function handleSaveQuestion() {
    if (!editing) return
    setSaving(true)
    const result = await saveQuestion({ data: { ...editing, questionText: editing.questionText ?? '', answerText: editing.answerText ?? '', allowRebuzz: editing.allowRebuzz ?? true, mediaUrl: editing.mediaUrl ?? undefined, mediaType: editing.mediaType ?? undefined, youtubeUrl: editing.youtubeUrl ?? undefined } })
    const saved = { ...editing, id: result.id, questionText: editing.questionText ?? '', answerText: editing.answerText ?? '', allowRebuzz: editing.allowRebuzz ?? true, mediaUrl: editing.mediaUrl ?? null, mediaType: editing.mediaType ?? null, youtubeUrl: editing.youtubeUrl ?? null } as Question
    setQuestions(prev => {
      const idx = prev.findIndex(q => q.id === result.id)
      if (idx >= 0) return prev.map(q => q.id === result.id ? saved : q)
      return [...prev, saved]
    })
    setSaving(false)
    setEditing(null)
  }

  const completedCount = questions.length
  const totalCount = categories.length * q.rowCount

  return (
    <div className="max-w-full px-4 py-6">
      <div className="flex items-center justify-between mb-4 max-w-6xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold">{q.title}</h1>
          <p className="text-sm text-neutral-400">{completedCount}/{totalCount} Fragen ausgefüllt</p>
        </div>
      </div>

      {/* Board Grid */}
      <div className="overflow-x-auto">
        <div
          className="grid gap-2 min-w-fit mx-auto"
          style={{ gridTemplateColumns: `repeat(${categories.length}, minmax(160px, 1fr))` }}
        >
          {/* Category headers */}
          {categories.map(cat => (
            <input
              key={cat.id}
              defaultValue={cat.name}
              onBlur={e => handleCatNameBlur(cat, e.target.value)}
              className="bg-blue-900 border border-blue-700 rounded-lg px-3 py-2 text-white text-center font-bold text-sm focus:outline-none focus:border-yellow-400"
            />
          ))}

          {/* Question cells */}
          {Array.from({ length: q.rowCount }, (_, rowIdx) =>
            categories.map(cat => {
              const q_ = getQuestion(cat.id, rowIdx)
              const pts = pointValues[rowIdx] ?? (rowIdx + 1) * 100
              return (
                <button
                  key={`${cat.id}-${rowIdx}`}
                  onClick={() => openQuestion(cat.id, rowIdx)}
                  className={`aspect-[4/3] rounded-lg border text-2xl font-black flex flex-col items-center justify-center transition-all hover:scale-105 ${
                    q_?.questionText
                      ? 'bg-blue-800 border-blue-600 text-yellow-300'
                      : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-500'
                  }`}
                >
                  <span>{pts}</span>
                  {!q_?.questionText && <span className="text-xs font-normal mt-1 text-neutral-600">Klicken</span>}
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Question Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={e => { if (e.target === e.currentTarget) setEditing(null) }}>
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">
              Frage bearbeiten — {pointValues[editing.rowIndex] ?? (editing.rowIndex + 1) * 100} Punkte
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-neutral-400 mb-1">Frage *</label>
                <textarea
                  required
                  value={editing.questionText ?? ''}
                  onChange={e => setEditing(prev => prev ? { ...prev, questionText: e.target.value } : prev)}
                  rows={3}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-yellow-500 resize-none"
                  placeholder="Was ist...?"
                />
              </div>
              <div>
                <label className="block text-sm text-neutral-400 mb-1">Antwort *</label>
                <input
                  type="text"
                  required
                  value={editing.answerText ?? ''}
                  onChange={e => setEditing(prev => prev ? { ...prev, answerText: e.target.value } : prev)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-yellow-500"
                  placeholder="Die Antwort lautet..."
                />
              </div>
              <div>
                <label className="block text-sm text-neutral-400 mb-1">YouTube-Link (optional)</label>
                <input
                  type="url"
                  value={editing.youtubeUrl ?? ''}
                  onChange={e => setEditing(prev => prev ? { ...prev, youtubeUrl: e.target.value || undefined } : prev)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-yellow-500"
                  placeholder="https://youtube.com/watch?v=..."
                />
              </div>
              <div>
                <label className="block text-sm text-neutral-400 mb-1">Bild / Audio / Video (optional)</label>
                <div className="flex gap-2 mb-1">
                  <input
                    type="url"
                    value={editing.mediaUrl ?? ''}
                    onChange={e => setEditing(prev => prev ? { ...prev, mediaUrl: e.target.value || undefined } : prev)}
                    className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-yellow-500 text-sm"
                    placeholder="https://... oder /uploads/..."
                  />
                  <label className={`px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${uploading ? 'bg-neutral-700 text-neutral-500' : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-200'}`}>
                    {uploading ? '…' : 'Hochladen'}
                    <input
                      type="file"
                      accept="image/*,audio/*,video/*"
                      className="hidden"
                      disabled={uploading}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleMediaUpload(f); e.target.value = '' }}
                    />
                  </label>
                </div>
                <div className="flex gap-2">
                  {(['image', 'audio', 'video'] as const).map(t => (
                    <button key={t} type="button"
                      onClick={() => setEditing(prev => prev ? { ...prev, mediaType: editing.mediaType === t ? undefined : t } : prev)}
                      className={`text-xs px-2 py-1 rounded ${editing.mediaType === t ? 'bg-yellow-500 text-black' : 'bg-neutral-700 text-neutral-300'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editing.allowRebuzz ?? true}
                  onChange={e => setEditing(prev => prev ? { ...prev, allowRebuzz: e.target.checked } : prev)}
                  className="accent-yellow-400 w-4 h-4" />
                <span className="text-sm">Wiederholtes Buzzern nach falscher Antwort erlaubt</span>
              </label>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditing(null)}
                className="flex-1 py-2 bg-neutral-700 hover:bg-neutral-600 rounded-lg transition-colors">
                Abbrechen
              </button>
              <button
                onClick={handleSaveQuestion}
                disabled={saving || !editing.questionText || !editing.answerText}
                className="flex-1 py-2 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-bold rounded-lg transition-colors">
                {saving ? 'Speichern…' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
