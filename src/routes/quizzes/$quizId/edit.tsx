import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { quiz, category, question, questionMedia } from '#/db/schema'
import { eq, asc, inArray } from 'drizzle-orm'
import { getRequest } from '@tanstack/react-start/server'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { Upload, Image as ImageIcon, Music, Video, Check, Plus, Trash2, Youtube, Pencil, Play } from 'lucide-react'
import {
  Button,
  FormField,
  Input,
  Textarea,
  Modal,
} from '#/components/ui'
import { MediaEditorModal } from '#/components/editor/MediaEditorModal'
import { TestQuestionModal } from '#/components/editor/TestQuestionModal'
import { EditorMobileBoard } from '#/components/editor/EditorMobileBoard'
import { formatPoints } from '#/lib/format'
import type { ActiveQuestion } from '#/lib/game-state'

const getQuizData = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ quizId: z.string() }))
  .handler(async ({ data }) => {
    const { auth } = await import('#/lib/auth')
    const { db } = await import('#/db/index')

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

    const qIds = questions.map(q => q.id)
    const allMedia = qIds.length > 0
      ? await db.select().from(questionMedia).where(inArray(questionMedia.questionId, qIds)).orderBy(asc(questionMedia.sortOrder)).all()
      : []

    return { quiz: q, categories, questions, allMedia }
  })

const saveCategory = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.string(), name: z.string(), allowRebuzz: z.boolean() }))
  .handler(async ({ data }) => {
    const { db } = await import('#/db/index')

    await db
      .update(category)
      .set({ name: data.name, allowRebuzz: data.allowRebuzz })
      .where(eq(category.id, data.id))
    return { ok: true }
  })

const mediaItemSchema = z.object({ id: z.string(), url: z.string(), type: z.string(), role: z.enum(['question', 'answer']), sortOrder: z.number() })

const saveQuestion = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id: z.string().optional(),
      categoryId: z.string(),
      quizId: z.string(),
      rowIndex: z.number(),
      questionText: z.string(),
      answerText: z.string(),
      allowRebuzz: z.boolean(),
      autoplayMedia: z.boolean(),
      rapidFire: z.boolean(),
      showMediaOnPlayer: z.boolean(),
      mediaPlaceholder: z.boolean(),
      mediaItems: z.array(mediaItemSchema),
    }),
  )
  .handler(async ({ data }) => {
    const { db } = await import('#/db/index')
    const { questionMedia } = await import('#/db/schema')

    const qId = data.id ?? nanoid(10)

    if (data.id) {
      await db
        .update(question)
        .set({ questionText: data.questionText, answerText: data.answerText, allowRebuzz: data.allowRebuzz, autoplayMedia: data.autoplayMedia, rapidFire: data.rapidFire, showMediaOnPlayer: data.showMediaOnPlayer, mediaPlaceholder: data.mediaPlaceholder })
        .where(eq(question.id, data.id))
    } else {
      await db.insert(question).values({
        id: qId,
        categoryId: data.categoryId,
        quizId: data.quizId,
        rowIndex: data.rowIndex,
        questionText: data.questionText,
        answerText: data.answerText,
        allowRebuzz: data.allowRebuzz,
        autoplayMedia: data.autoplayMedia,
        rapidFire: data.rapidFire,
        showMediaOnPlayer: data.showMediaOnPlayer,
        mediaPlaceholder: data.mediaPlaceholder,
      })
    }

    // replace all media items
    await db.delete(questionMedia).where(eq(questionMedia.questionId, qId))
    if (data.mediaItems.length > 0) {
      await db.insert(questionMedia).values(
        data.mediaItems.map(item => ({ id: item.id.startsWith('new-') ? nanoid(10) : item.id, questionId: qId, url: item.url, type: item.type, role: item.role, sortOrder: item.sortOrder }))
      )
    }

    return { id: qId }
  })

export const Route = createFileRoute('/quizzes/$quizId/edit')({
  loader: async ({ params }) => getQuizData({ data: { quizId: params.quizId } }),
  component: EditQuizPage,
})

type MediaRole = 'question' | 'answer'

type MediaItem = {
  id: string
  url: string
  type: string // 'image' | 'audio' | 'video' | 'youtube'
  role: MediaRole
  sortOrder: number
}

type Question = {
  id: string
  categoryId: string
  quizId: string
  rowIndex: number
  questionText: string
  answerText: string
  allowRebuzz: boolean
  autoplayMedia: boolean
  rapidFire: boolean
  showMediaOnPlayer: boolean
  mediaPlaceholder: boolean
  mediaItems: MediaItem[]
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
  mediaItems: MediaItem[]
}

function EditQuizPage() {
  const { quiz: q, categories: initCats, questions: initQuestions, allMedia } = Route.useLoaderData()
  const pointValues: number[] = JSON.parse(q.pointValues)
  const [categories, setCategories] = useState<Category[]>(initCats as Category[])
  const [questions, setQuestions] = useState<Question[]>(() =>
    (initQuestions as (typeof initQuestions[0] & { mediaItems?: MediaItem[] })[]).map(q => ({
      ...q,
      mediaItems: allMedia
        .filter(m => m.questionId === q.id)
        .map(m => ({ id: m.id, url: m.url, type: m.type, role: (m.role === 'answer' ? 'answer' : 'question') as MediaRole, sortOrder: m.sortOrder })),
    }))
  )
  const [editing, setEditing] = useState<EditingQuestion | null>(null)
  const [editorTab, setEditorTab] = useState<'content' | 'options'>('content')
  const [saving, setSaving] = useState(false)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [editorTarget, setEditorTarget] = useState<{ id: string; url: string; type: 'image' | 'video' | 'audio' | 'youtube' } | null>(null)
  const [testing, setTesting] = useState<{ categoryId: string; rowIndex: number } | null>(null)

  function buildTestQuestion(catId: string, rowIdx: number): ActiveQuestion | null {
    const q_ = getQuestion(catId, rowIdx)
    if (!q_ || !q_.questionText) return null
    const cat = categories.find(c => c.id === catId)
    return {
      id: q_.id,
      categoryName: cat?.name ?? '',
      pointValue: pointValues[rowIdx] ?? (rowIdx + 1) * 100,
      questionText: q_.questionText,
      answerText: q_.answerText,
      mediaUrl: null,
      mediaType: null,
      youtubeUrl: null,
      mediaItems: q_.mediaItems.map(m => ({
        id: m.id,
        url: m.url,
        type: m.type,
        role: m.role,
        sortOrder: m.sortOrder,
      })),
      allowRebuzz: q_.allowRebuzz,
      autoplayMedia: q_.autoplayMedia,
      rapidFire: q_.rapidFire,
      showMediaOnPlayer: q_.showMediaOnPlayer,
      mediaPlaceholder: q_.mediaPlaceholder,
    }
  }

  async function handleMediaUpload(file: File, itemId: string) {
    setUploadingId(itemId)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error((e as { message?: string }).message ?? 'Upload fehlgeschlagen')
      }
      const { url } = (await res.json()) as { url: string }
      const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : 'video'
      setEditing(prev => {
        if (!prev) return prev
        return { ...prev, mediaItems: prev.mediaItems.map(m => m.id === itemId ? { ...m, url, type } : m) }
      })
      if (type === 'image' || type === 'video' || type === 'audio') {
        setEditorTarget({ id: itemId, url, type })
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Upload fehlgeschlagen')
    } finally {
      setUploadingId(null)
    }
  }

  function applyEditedMedia(itemId: string, newUrl: string, newType?: 'image' | 'video' | 'audio') {
    setEditing(prev => {
      if (!prev) return prev
      return { ...prev, mediaItems: prev.mediaItems.map(m => m.id === itemId ? { ...m, url: newUrl, ...(newType ? { type: newType } : {}) } : m) }
    })
  }

  function updateMediaItem(itemId: string, patch: Partial<MediaItem>) {
    setEditing(prev => {
      if (!prev) return prev
      return { ...prev, mediaItems: prev.mediaItems.map(m => m.id === itemId ? { ...m, ...patch } : m) }
    })
  }

  function addMediaItem(role: MediaRole) {
    setEditing(prev => {
      if (!prev) return prev
      const sortOrder = prev.mediaItems.filter(m => m.role === role).length
      return { ...prev, mediaItems: [...prev.mediaItems, { id: `new-${Date.now()}`, url: '', type: 'image', role, sortOrder }] }
    })
  }

  function removeMediaItem(itemId: string) {
    setEditing(prev => {
      if (!prev) return prev
      const remaining = prev.mediaItems.filter(m => m.id !== itemId)
      // resequence sortOrder per role
      const requestion = remaining.filter(m => m.role === 'question').map((m, i) => ({ ...m, sortOrder: i }))
      const reanswer = remaining.filter(m => m.role === 'answer').map((m, i) => ({ ...m, sortOrder: i }))
      return { ...prev, mediaItems: [...requestion, ...reanswer] }
    })
  }

  function getQuestion(catId: string, rowIdx: number) {
    return questions.find(q => q.categoryId === catId && q.rowIndex === rowIdx)
  }

  async function handleCatNameBlur(cat: Category, newName: string) {
    if (newName === cat.name || !newName.trim()) return
    await saveCategory({ data: { id: cat.id, name: newName, allowRebuzz: cat.allowRebuzz } })
    setCategories(prev => prev.map(c => (c.id === cat.id ? { ...c, name: newName } : c)))
  }

  function openQuestion(catId: string, rowIdx: number) {
    const existing = getQuestion(catId, rowIdx)
    setEditorTab('content')
    setEditing(
      existing ?? {
        categoryId: catId,
        quizId: q.id,
        rowIndex: rowIdx,
        questionText: '',
        answerText: '',
        allowRebuzz: true,
        autoplayMedia: false,
        rapidFire: false,
        showMediaOnPlayer: false,
        mediaPlaceholder: false,
        mediaItems: [],
      },
    )
  }

  async function handleSaveQuestion() {
    if (!editing) return
    setSaving(true)
    const result = await saveQuestion({
      data: {
        id: editing.id,
        categoryId: editing.categoryId,
        quizId: editing.quizId,
        rowIndex: editing.rowIndex,
        questionText: editing.questionText ?? '',
        answerText: editing.answerText ?? '',
        allowRebuzz: editing.allowRebuzz ?? true,
        autoplayMedia: editing.autoplayMedia ?? false,
        rapidFire: editing.rapidFire ?? false,
        showMediaOnPlayer: editing.showMediaOnPlayer ?? false,
        mediaPlaceholder: editing.mediaPlaceholder ?? false,
        mediaItems: editing.mediaItems.filter(m => m.url.trim()),
      },
    })
    const saved: Question = {
      id: result.id,
      categoryId: editing.categoryId,
      quizId: editing.quizId,
      rowIndex: editing.rowIndex,
      questionText: editing.questionText ?? '',
      answerText: editing.answerText ?? '',
      allowRebuzz: editing.allowRebuzz ?? true,
      autoplayMedia: editing.autoplayMedia ?? false,
      rapidFire: editing.rapidFire ?? false,
      showMediaOnPlayer: editing.showMediaOnPlayer ?? false,
      mediaPlaceholder: editing.mediaPlaceholder ?? false,
      mediaItems: editing.mediaItems.filter(m => m.url.trim()),
    }
    setQuestions(prev => {
      const idx = prev.findIndex(q => q.id === result.id)
      if (idx >= 0) return prev.map(q => (q.id === result.id ? saved : q))
      return [...prev, saved]
    })
    setSaving(false)
    setEditing(null)
  }

  const completedCount = questions.length
  const totalCount = categories.length * q.rowCount
  const percent = Math.round((completedCount / totalCount) * 100)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-3 sm:py-5">
      <header className="flex items-end justify-between gap-3 mb-3 sm:mb-5">
        <div className="min-w-0">
          <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.25em] text-violet-400 mb-0.5 sm:mb-1">
            Bearbeiten
          </p>
          <h1 className="font-board uppercase tracking-wide text-xl sm:text-3xl text-ink-50 leading-none truncate">
            {q.title}
          </h1>
          <p className="mt-1 text-ink-300 text-xs sm:text-sm">
            {completedCount} / {totalCount} Fragen ausgefüllt
          </p>
        </div>
        <div className="hidden sm:flex flex-col w-40 shrink-0">
          <div className="h-2 rounded-full bg-bg-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-[10px] uppercase tracking-widest text-ink-500 mt-1 text-right tabular-nums">
            {percent}%
          </span>
        </div>
      </header>

      <div className="md:hidden">
        <EditorMobileBoard
          categories={categories}
          rowCount={q.rowCount}
          pointValues={pointValues}
          getQuestion={getQuestion}
          onOpenQuestion={(catId, rowIdx) => openQuestion(catId, rowIdx)}
          onTestQuestion={(catId, rowIdx) => setTesting({ categoryId: catId, rowIndex: rowIdx })}
          onRenameCategory={(cat, newName) => {
            const full = categories.find(c => c.id === cat.id)
            if (full) handleCatNameBlur(full, newName)
          }}
        />
      </div>

      <div className="hidden md:block overflow-x-auto overflow-y-hidden -mx-4 sm:-mx-2 px-4 sm:px-2 py-2">
        <div
          className="grid gap-2 sm:gap-2.5 min-w-fit"
          style={{ gridTemplateColumns: `repeat(${categories.length}, minmax(140px, 1fr))` }}
        >
          {categories.map(cat => (
            <input
              key={cat.id}
              defaultValue={cat.name}
              onBlur={e => handleCatNameBlur(cat, e.target.value)}
              className="bg-gradient-to-b from-violet-700/80 to-violet-600/40 border border-violet-400/30 rounded-xl px-3 h-10 text-ink-50 text-center font-board uppercase tracking-wider text-sm focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
            />
          ))}

          {Array.from({ length: q.rowCount }, (_, rowIdx) =>
            categories.map(cat => {
              const q_ = getQuestion(cat.id, rowIdx)
              const pts = pointValues[rowIdx] ?? (rowIdx + 1) * 100
              const filled = !!q_?.questionText
              return (
                <button
                  key={`${cat.id}-${rowIdx}`}
                  onClick={() => openQuestion(cat.id, rowIdx)}
                  className={[
                    'min-h-[110px] md:min-h-[120px] rounded-xl border flex flex-col items-center justify-center gap-1 px-3 py-2.5 transition-all hover:scale-[1.02] active:scale-[0.99] relative overflow-hidden',
                    filled
                      ? 'bg-gradient-to-br from-bg-700 via-bg-800 to-bg-900 border-violet-500/30 text-cyan-400 shadow-[var(--shadow-tile)]'
                      : 'bg-bg-800/40 border-bg-700 text-ink-500 hover:border-bg-600',
                  ].join(' ')}
                >
                  {filled ? (
                    <span
                      className="text-[10px] sm:text-[11px] uppercase tracking-widest opacity-80 text-ink-200 text-center line-clamp-2 break-words"
                      title={q_!.questionText}
                    >
                      {q_!.questionText}
                    </span>
                  ) : null}
                  <span
                    className="font-board leading-none"
                    style={{ fontSize: 'clamp(1.4rem, 2.8vw, 2rem)' }}
                  >
                    {formatPoints(pts)}
                  </span>
                  {!filled && (
                    <span className="text-[10px] uppercase tracking-widest opacity-80">
                      Tippen
                    </span>
                  )}
                  {filled && (
                    <>
                      <span className="absolute top-2 left-2 w-2 h-2 rounded-full bg-good" />
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label="Frage testen"
                        title="Frage testen"
                        onClick={(e) => {
                          e.stopPropagation()
                          setTesting({ categoryId: cat.id, rowIndex: rowIdx })
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            e.stopPropagation()
                            setTesting({ categoryId: cat.id, rowIndex: rowIdx })
                          }
                        }}
                        className="absolute bottom-2 right-2 inline-flex items-center gap-1 h-8 sm:h-7 px-3 sm:px-2.5 rounded-full bg-violet-600 hover:bg-violet-500 text-ink-50 text-[11px] sm:text-[10px] font-bold uppercase tracking-wider border border-violet-400/40 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
                      >
                        <Play className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                        Testen
                      </span>
                    </>
                  )}
                </button>
              )
            }),
          )}
        </div>
      </div>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={
          editing
            ? `Frage · ${formatPoints(pointValues[editing.rowIndex] ?? (editing.rowIndex + 1) * 100)} Punkte`
            : ''
        }
        size="md"
      >
        {editing && (() => {
          const activeOptionCount =
            (!(editing.allowRebuzz ?? true) ? 1 : 0) +
            ((editing.autoplayMedia ?? false) ? 1 : 0) +
            ((editing.rapidFire ?? false) ? 1 : 0) +
            ((editing.showMediaOnPlayer ?? false) ? 1 : 0) +
            ((editing.mediaPlaceholder ?? false) ? 1 : 0)
          return (
            <div className="px-5 py-5 flex flex-col gap-4">
              <div className="flex gap-1 p-1 rounded-xl bg-bg-900 border border-bg-700">
                <button
                  type="button"
                  onClick={() => setEditorTab('content')}
                  className={[
                    'flex-1 h-9 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors',
                    editorTab === 'content'
                      ? 'bg-bg-700 text-ink-50 shadow-sm'
                      : 'text-ink-400 hover:text-ink-200',
                  ].join(' ')}
                >
                  Inhalt
                </button>
                <button
                  type="button"
                  onClick={() => setEditorTab('options')}
                  className={[
                    'flex-1 h-9 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors inline-flex items-center justify-center gap-2',
                    editorTab === 'options'
                      ? 'bg-bg-700 text-ink-50 shadow-sm'
                      : 'text-ink-400 hover:text-ink-200',
                  ].join(' ')}
                >
                  Optionen
                  {activeOptionCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-[10px] tabular-nums">
                      {activeOptionCount}
                    </span>
                  )}
                </button>
              </div>

              {editorTab === 'content' && (
                <>
                  <FormField label="Frage">
                    <Textarea
                      required
                      value={editing.questionText ?? ''}
                      onChange={e =>
                        setEditing(prev => (prev ? { ...prev, questionText: e.target.value } : prev))
                      }
                      rows={3}
                      placeholder="Was ist…?"
                    />
                  </FormField>
                  <FormField label="Antwort">
                    <Input
                      type="text"
                      required
                      value={editing.answerText ?? ''}
                      onChange={e =>
                        setEditing(prev => (prev ? { ...prev, answerText: e.target.value } : prev))
                      }
                      placeholder="Die Antwort lautet…"
                    />
                  </FormField>
                  <MediaSection
                    label="Frage-Medien"
                    hint="Werden während der Frage angezeigt"
                    tone="cyan"
                    items={editing.mediaItems
                      .filter(m => m.role === 'question')
                      .sort((a, b) => a.sortOrder - b.sortOrder)}
                    onAdd={() => addMediaItem('question')}
                    onUpdate={updateMediaItem}
                    onRemove={removeMediaItem}
                    onUpload={handleMediaUpload}
                    onEdit={(item) => setEditorTarget({ id: item.id, url: item.url, type: item.type as 'image' | 'video' | 'audio' })}
                    uploadingId={uploadingId}
                  />

                  <MediaSection
                    label="Antwort-Medien"
                    hint="Werden bei Auflösung gezeigt"
                    tone="violet"
                    items={editing.mediaItems
                      .filter(m => m.role === 'answer')
                      .sort((a, b) => a.sortOrder - b.sortOrder)}
                    onAdd={() => addMediaItem('answer')}
                    onUpdate={updateMediaItem}
                    onRemove={removeMediaItem}
                    onUpload={handleMediaUpload}
                    onEdit={(item) => setEditorTarget({ id: item.id, url: item.url, type: item.type as 'image' | 'video' | 'audio' })}
                    uploadingId={uploadingId}
                  />
                </>
              )}

              {editorTab === 'options' && (
                <div className="flex flex-col gap-3">
                  <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-bg-700 bg-bg-800/60 px-4 h-12">
                    <input
                      type="checkbox"
                      checked={editing.allowRebuzz ?? true}
                      onChange={e =>
                        setEditing(prev => (prev ? { ...prev, allowRebuzz: e.target.checked } : prev))
                      }
                      className="sr-only peer"
                    />
                    <span className="w-4 h-4 rounded border-2 border-bg-600 peer-checked:border-cyan-400 peer-checked:bg-cyan-400 inline-flex items-center justify-center transition-colors shrink-0">
                      {(editing.allowRebuzz ?? true) && <Check className="w-3 h-3 text-bg-950" strokeWidth={3} />}
                    </span>
                    <span className="text-sm text-ink-200 flex-1">
                      Wiederholtes Buzzern nach falscher Antwort erlaubt
                    </span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-bg-700 bg-bg-800/60 px-4 h-12">
                    <input
                      type="checkbox"
                      checked={editing.autoplayMedia ?? false}
                      onChange={e =>
                        setEditing(prev => (prev ? { ...prev, autoplayMedia: e.target.checked } : prev))
                      }
                      className="sr-only peer"
                    />
                    <span className="w-4 h-4 rounded border-2 border-bg-600 peer-checked:border-cyan-400 peer-checked:bg-cyan-400 inline-flex items-center justify-center transition-colors shrink-0">
                      {(editing.autoplayMedia ?? false) && <Check className="w-3 h-3 text-bg-950" strokeWidth={3} />}
                    </span>
                    <span className="text-sm text-ink-200 flex-1">
                      Erstes Video / Audio automatisch abspielen
                    </span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 h-12">
                    <input
                      type="checkbox"
                      checked={editing.rapidFire ?? false}
                      onChange={e =>
                        setEditing(prev => (prev ? { ...prev, rapidFire: e.target.checked } : prev))
                      }
                      className="sr-only peer"
                    />
                    <span className="w-4 h-4 rounded border-2 border-bg-600 peer-checked:border-amber-400 peer-checked:bg-amber-400 inline-flex items-center justify-center transition-colors shrink-0">
                      {(editing.rapidFire ?? false) && <Check className="w-3 h-3 text-bg-950" strokeWidth={3} />}
                    </span>
                    <span className="text-sm text-ink-200 flex-1">
                      Mehrmals antworten möglich (Master entscheidet wann Frage endet)
                    </span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-4 h-12">
                    <input
                      type="checkbox"
                      checked={editing.showMediaOnPlayer ?? false}
                      onChange={e =>
                        setEditing(prev => (prev ? { ...prev, showMediaOnPlayer: e.target.checked } : prev))
                      }
                      className="sr-only peer"
                    />
                    <span className="w-4 h-4 rounded border-2 border-bg-600 peer-checked:border-cyan-400 peer-checked:bg-cyan-400 inline-flex items-center justify-center transition-colors shrink-0">
                      {(editing.showMediaOnPlayer ?? false) && <Check className="w-3 h-3 text-bg-950" strokeWidth={3} />}
                    </span>
                    <span className="text-sm text-ink-200 flex-1">
                      Medien auf Spieler-Handy anzeigen (Master gibt stückweise frei)
                    </span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-violet-500/30 bg-violet-500/5 px-4 h-12">
                    <input
                      type="checkbox"
                      checked={editing.mediaPlaceholder ?? false}
                      onChange={e =>
                        setEditing(prev => (prev ? { ...prev, mediaPlaceholder: e.target.checked } : prev))
                      }
                      className="sr-only peer"
                    />
                    <span className="w-4 h-4 rounded border-2 border-bg-600 peer-checked:border-violet-400 peer-checked:bg-violet-400 inline-flex items-center justify-center transition-colors shrink-0">
                      {(editing.mediaPlaceholder ?? false) && <Check className="w-3 h-3 text-bg-950" strokeWidth={3} />}
                    </span>
                    <span className="text-sm text-ink-200 flex-1">
                      Placeholder auf TV (Medien erst nach Freigabe sichtbar)
                    </span>
                  </label>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditing(null)}
                  className="flex-1"
                >
                  Abbrechen
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleSaveQuestion}
                  disabled={saving || !editing.questionText || !editing.answerText}
                  className="flex-1"
                >
                  {saving ? 'Speichern…' : 'Speichern'}
                </Button>
              </div>
            </div>
          )
        })()}
      </Modal>

      <MediaEditorModal
        open={editorTarget !== null}
        url={editorTarget?.url ?? ''}
        type={editorTarget?.type ?? 'image'}
        onClose={() => setEditorTarget(null)}
        onSaved={(newUrl, newType) => {
          if (editorTarget) applyEditedMedia(editorTarget.id, newUrl, newType)
        }}
      />

      {testing && (() => {
        const tq = buildTestQuestion(testing.categoryId, testing.rowIndex)
        if (!tq) return null
        const reward = pointValues[testing.rowIndex] ?? (testing.rowIndex + 1) * 100
        const basePenalty = Math.round(reward * q.wrongAnswerPenalty)
        return (
          <TestQuestionModal
            open
            onClose={() => setTesting(null)}
            question={tq}
            rewardOnCorrect={reward}
            basePenalty={basePenalty}
          />
        )
      })()}
    </div>
  )
}

interface MediaSectionProps {
  label: string
  hint: string
  tone: 'cyan' | 'violet'
  items: MediaItem[]
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<MediaItem>) => void
  onRemove: (id: string) => void
  onUpload: (file: File, id: string) => void
  onEdit: (item: MediaItem) => void
  uploadingId: string | null
}

function MediaSection({ label, hint, tone, items, onAdd, onUpdate, onRemove, onUpload, onEdit, uploadingId }: MediaSectionProps) {
  const accent = tone === 'cyan'
    ? { dot: 'bg-cyan-400', text: 'text-cyan-400 hover:text-cyan-300', border: 'border-cyan-500/20' }
    : { dot: 'bg-violet-400', text: 'text-violet-300 hover:text-violet-200', border: 'border-violet-500/20' }
  return (
    <div className={`rounded-xl border ${accent.border} bg-bg-900/40 p-3`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full ${accent.dot} shrink-0`} />
          <span className="text-xs uppercase tracking-widest text-ink-300 font-bold">{label}</span>
          <span className="text-[10px] text-ink-500 truncate">· {hint}</span>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className={`inline-flex items-center gap-1 text-xs ${accent.text} transition-colors shrink-0`}
        >
          <Plus className="w-3.5 h-3.5" />
          Hinzufügen
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {items.map(item => (
          <div key={item.id} className="rounded-xl border border-bg-700 bg-bg-800/60 p-2.5 flex flex-col gap-2">
            <div className="flex gap-2 items-center">
              <div className="flex gap-1">
                {([
                  { t: 'image', icon: <ImageIcon className="w-3 h-3" />, label: 'Bild' },
                  { t: 'audio', icon: <Music className="w-3 h-3" />, label: 'Audio' },
                  { t: 'video', icon: <Video className="w-3 h-3" />, label: 'Video' },
                  { t: 'youtube', icon: <Youtube className="w-3 h-3" />, label: 'YT' },
                ] as const).map(opt => (
                  <button
                    key={opt.t}
                    type="button"
                    onClick={() => onUpdate(item.id, { type: opt.t })}
                    className={[
                      'inline-flex items-center gap-1 px-2 h-7 rounded-lg text-[11px] font-bold border transition-colors',
                      item.type === opt.t
                        ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                        : 'bg-bg-900 border-bg-700 text-ink-400 hover:border-bg-600',
                    ].join(' ')}
                  >
                    {opt.icon}{opt.label}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-2">
                {item.url && (item.type === 'image' || item.type === 'video' || item.type === 'audio') && (
                  <button
                    type="button"
                    onClick={() => onEdit(item)}
                    className="text-ink-500 hover:text-cyan-400 transition-colors"
                    title="Medium bearbeiten"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  className="text-ink-500 hover:text-red-400 transition-colors"
                  title="Medium entfernen"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <Input
                type="url"
                value={item.url}
                onChange={e => onUpdate(item.id, { url: e.target.value })}
                placeholder={item.type === 'youtube' ? 'https://youtube.com/watch?v=…' : 'https://… oder /uploads/…'}
                className="flex-1 text-sm"
              />
              {item.type !== 'youtube' && (
                <label className={[
                  'inline-flex items-center gap-1 h-11 px-3 rounded-xl text-xs font-bold cursor-pointer transition-colors border shrink-0',
                  uploadingId === item.id ? 'bg-bg-700 text-ink-500 border-bg-600 cursor-wait' : 'bg-bg-700 hover:bg-bg-600 text-ink-50 border-bg-600',
                ].join(' ')}>
                  <Upload className="w-3.5 h-3.5" />
                  {uploadingId === item.id ? '…' : 'Upload'}
                  <input type="file" accept="image/*,audio/*,video/*" className="hidden" disabled={uploadingId === item.id}
                    onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f, item.id); e.target.value = '' }} />
                </label>
              )}
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-ink-500 text-xs text-center py-2">Kein Medium — klicke „Hinzufügen"</p>
        )}
      </div>
    </div>
  )
}

