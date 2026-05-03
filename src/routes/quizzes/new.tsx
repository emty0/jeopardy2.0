import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { auth } from '#/lib/auth'
import { db } from '#/db/index'
import { quiz, category } from '#/db/schema'
import { getRequest } from '@tanstack/react-start/server'
import { nanoid } from 'nanoid'
import { z } from 'zod'

const createQuiz = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    columnCount: z.number().int().min(2).max(10),
    rowCount: z.number().int().min(2).max(8),
    pointValues: z.array(z.number()),
    wrongAnswerPenalty: z.number().min(0).max(2),
    isPublic: z.boolean(),
  }))
  .handler(async ({ data }) => {
    const request = getRequest()
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) throw redirect({ to: '/auth/login' })

    const quizId = nanoid(10)
    await db.insert(quiz).values({
      id: quizId,
      creatorId: session.user.id,
      title: data.title,
      description: data.description ?? null,
      columnCount: data.columnCount,
      rowCount: data.rowCount,
      pointValues: JSON.stringify(data.pointValues),
      wrongAnswerPenalty: data.wrongAnswerPenalty,
      isPublic: data.isPublic,
    })

    for (let i = 0; i < data.columnCount; i++) {
      await db.insert(category).values({
        id: nanoid(10),
        quizId,
        name: `Kategorie ${i + 1}`,
        columnIndex: i,
        allowRebuzz: true,
      })
    }

    return { quizId }
  })

export const Route = createFileRoute('/quizzes/new')({
  component: NewQuizPage,
})

function generatePoints(rows: number, base = 100): number[] {
  return Array.from({ length: rows }, (_, i) => base * (i + 1))
}

function NewQuizPage() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [columns, setColumns] = useState(5)
  const [rows, setRows] = useState(5)
  const [pointValues, setPointValues] = useState<number[]>(generatePoints(5))
  const [penalty, setPenalty] = useState(1.0)
  const [isPublic, setIsPublic] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleRowChange(n: number) {
    setRows(n)
    setPointValues(generatePoints(n))
  }

  function updatePoint(i: number, val: number) {
    setPointValues(prev => prev.map((p, idx) => idx === i ? val : p))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { quizId } = await createQuiz({ data: { title, description, columnCount: columns, rowCount: rows, pointValues, wrongAnswerPenalty: penalty, isPublic } })
      await navigate({ to: '/quizzes/$quizId/edit', params: { quizId } })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fehler')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Neues Quiz erstellen</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold">Allgemein</h2>
          <div>
            <label className="block text-sm text-neutral-400 mb-1">Titel *</label>
            <input type="text" required value={title} onChange={e => setTitle(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-yellow-500"
              placeholder="Mein Quiz" />
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-1">Beschreibung</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-yellow-500 resize-none"
              placeholder="Optional" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} className="accent-yellow-400 w-4 h-4" />
            <span className="text-sm">Öffentlich sichtbar (andere können mitspielen)</span>
          </label>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold">Board-Größe</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-neutral-400 mb-1">Kategorien (Spalten)</label>
              <input type="number" min={2} max={10} value={columns} onChange={e => setColumns(Number(e.target.value))}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-yellow-500" />
            </div>
            <div>
              <label className="block text-sm text-neutral-400 mb-1">Fragen pro Kategorie</label>
              <input type="number" min={2} max={8} value={rows} onChange={e => handleRowChange(Number(e.target.value))}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-yellow-500" />
            </div>
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold">Punkte</h2>
          <p className="text-sm text-neutral-400">Punktwert pro Zeile (von oben nach unten)</p>
          <div className="grid grid-cols-3 gap-2">
            {pointValues.map((p, i) => (
              <div key={i}>
                <label className="block text-xs text-neutral-500 mb-1">Zeile {i + 1}</label>
                <input type="number" min={10} step={10} value={p} onChange={e => updatePoint(i, Number(e.target.value))}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-yellow-500" />
              </div>
            ))}
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              Abzug bei falscher Antwort: <span className="text-white">{Math.round(penalty * 100)}%</span> des Fragenwertes
            </label>
            <input type="range" min={0} max={2} step={0.1} value={penalty} onChange={e => setPenalty(Number(e.target.value))}
              className="w-full accent-yellow-400" />
            <div className="flex justify-between text-xs text-neutral-500 mt-1">
              <span>0 = kein Abzug</span>
              <span>100% = voller Abzug</span>
              <span>200% = doppelter Abzug</span>
            </div>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button type="submit" disabled={loading}
          className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-bold rounded-xl text-lg transition-colors">
          {loading ? 'Wird erstellt…' : 'Quiz erstellen & Fragen bearbeiten →'}
        </button>
      </form>
    </div>
  )
}
