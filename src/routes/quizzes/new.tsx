import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { quiz, category } from '#/db/schema'
import { getRequest } from '@tanstack/react-start/server'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { ArrowRight, Globe, Lock } from 'lucide-react'
import {
  Button,
  Card,
  FormField,
  Input,
  Textarea,
  PageContainer,
  PageHeader,
} from '#/components/ui'

const createQuiz = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      columnCount: z.number().int().min(2).max(10),
      rowCount: z.number().int().min(2).max(8),
      pointValues: z.array(z.number()),
      wrongAnswerPenalty: z.number().min(0).max(2),
      isPublic: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    const { auth } = await import('#/lib/auth')
    const { db } = await import('#/db/index')

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
    setPointValues(prev => prev.map((p, idx) => (idx === i ? val : p)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { quizId } = await createQuiz({
        data: {
          title,
          description,
          columnCount: columns,
          rowCount: rows,
          pointValues,
          wrongAnswerPenalty: penalty,
          isPublic,
        },
      })
      await navigate({ to: '/quizzes/$quizId/edit', params: { quizId } })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fehler')
      setLoading(false)
    }
  }

  return (
    <PageContainer size="md">
      <PageHeader
        eyebrow="Neu"
        title="Quiz erstellen"
        subtitle="Lege ein leeres Board an — Fragen füllst du im nächsten Schritt."
      />

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Card className="p-6 flex flex-col gap-4">
          <h2 className="font-board uppercase tracking-wider text-lg text-ink-50">Allgemein</h2>
          <FormField label="Titel">
            <Input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Mein Quiz"
            />
          </FormField>
          <FormField label="Beschreibung" hint="Optional">
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="Worum geht's?"
            />
          </FormField>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsPublic(false)}
              className={[
                'flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-xl border text-sm font-bold transition-colors',
                !isPublic
                  ? 'bg-violet-500/15 border-violet-500/40 text-violet-300'
                  : 'bg-bg-800 border-bg-700 text-ink-300 hover:border-bg-600',
              ].join(' ')}
            >
              <Lock className="w-4 h-4" />
              Privat
            </button>
            <button
              type="button"
              onClick={() => setIsPublic(true)}
              className={[
                'flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-xl border text-sm font-bold transition-colors',
                isPublic
                  ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                  : 'bg-bg-800 border-bg-700 text-ink-300 hover:border-bg-600',
              ].join(' ')}
            >
              <Globe className="w-4 h-4" />
              Öffentlich
            </button>
          </div>
          <p className="text-xs text-ink-500">
            {isPublic
              ? 'Andere können dieses Quiz spielen.'
              : 'Nur du siehst dieses Quiz.'}
          </p>
        </Card>

        <Card className="p-6 flex flex-col gap-4">
          <h2 className="font-board uppercase tracking-wider text-lg text-ink-50">Board-Größe</h2>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Kategorien" hint="2 – 10 Spalten">
              <Input
                type="number"
                min={2}
                max={10}
                value={columns}
                onChange={e => setColumns(Number(e.target.value))}
              />
            </FormField>
            <FormField label="Fragen pro Kategorie" hint="2 – 8 Zeilen">
              <Input
                type="number"
                min={2}
                max={8}
                value={rows}
                onChange={e => handleRowChange(Number(e.target.value))}
              />
            </FormField>
          </div>
        </Card>

        <Card className="p-6 flex flex-col gap-4">
          <h2 className="font-board uppercase tracking-wider text-lg text-ink-50">Punkte</h2>
          <p className="text-sm text-ink-300">Punktwert pro Zeile, oben → unten.</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {pointValues.map((p, i) => (
              <FormField key={i} label={`Zeile ${i + 1}`}>
                <Input
                  type="number"
                  min={10}
                  step={10}
                  value={p}
                  onChange={e => updatePoint(i, Number(e.target.value))}
                />
              </FormField>
            ))}
          </div>

          <div className="mt-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-300">
                Abzug bei falscher Antwort
              </p>
              <span className="font-board text-xl text-cyan-400 tabular-nums">
                {Math.round(penalty * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={penalty}
              onChange={e => setPenalty(Number(e.target.value))}
              className="w-full accent-violet-500"
            />
            <div className="flex justify-between text-xs text-ink-500 mt-2">
              <span>0% kein Abzug</span>
              <span>100% voll</span>
              <span>200% doppelt</span>
            </div>
          </div>
        </Card>

        {error && <p className="text-bad text-sm">{error}</p>}
        <Button
          type="submit"
          variant="primary"
          size="xl"
          fullWidth
          disabled={loading}
          trailing={<ArrowRight className="w-5 h-5" />}
        >
          {loading ? 'Wird erstellt…' : 'Quiz erstellen & Fragen bearbeiten'}
        </Button>
      </form>
    </PageContainer>
  )
}
