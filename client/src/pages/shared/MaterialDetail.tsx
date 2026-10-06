import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Check, Eye, RotateCcw, X } from "lucide-react";
import { api, mediaUrl } from "@/lib/api";
import type { MaterialDetail, MaterialSubmitResult } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  PageLoader,
  StatCard,
} from "@/components/ui";
import { LEVEL_LABEL, cn, errorMessage, fmtDuration, scoreTone } from "@/lib/utils";

type Kind = "reading" | "listening";

export default function MaterialDetailPage({ kind }: { kind: Kind }) {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isTeacher = user?.role === "TEACHER";

  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<MaterialSubmitResult | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const startedAt = useRef(Date.now());

  const detail = useQuery({
    queryKey: [kind, id],
    queryFn: () => api.get<MaterialDetail>(`/${kind}/${id}`),
    enabled: Boolean(id),
  });

  useEffect(() => {
    startedAt.current = Date.now();
  }, [id]);

  const answered = useMemo(() => Object.keys(answers).length, [answers]);
  const questions = detail.data?.questions ?? [];

  const doSubmit = useMutation({
    mutationFn: () =>
      api.post<MaterialSubmitResult>(`/${kind}/${id}/attempts`, {
        answers: questions.map((q) => ({ questionId: q.id, selectedIndex: answers[q.id] })).filter((a) => a.selectedIndex !== undefined),
        durationSeconds: Math.round((Date.now() - startedAt.current) / 1000),
      }),
    onSuccess: (res) => {
      setResult(res);
      setConfirmSubmit(false);
      toast.success(`Submitted — ${res.percentage}%`);
      detail.refetch();
    },
    onError: (err) => {
      setConfirmSubmit(false);
      toast.error(errorMessage(err));
    },
  });

  if (detail.isLoading) return <PageLoader label="Loading material…" />;
  if (!detail.data) return <EmptyState title="Material not found" />;
  const m = detail.data;

  function reset() {
    setAnswers({});
    setResult(null);
    startedAt.current = Date.now();
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link to={`/${kind}`} className="inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-brand-600">
          <ArrowLeft className="h-3 w-3" /> {kind === "reading" ? "Reading" : "Listening"}
        </Link>
        <div className="flex items-center gap-2">
          <Badge tone="gray">{LEVEL_LABEL[m.level]}</Badge>
          <Badge tone="gray">{m.questions.length} questions</Badge>
          {isTeacher && <Badge tone={m.status === "PUBLISHED" ? "green" : "amber"}>{m.status.toLowerCase()}</Badge>}
        </div>
      </div>

      <h1 className="mb-1 text-xl font-bold text-ink-900">{m.title}</h1>
      <p className="mb-4 text-sm text-ink-500">{m.topic ?? "general"}</p>

      {/* Source */}
      <Card className="mb-4">
        <CardContent className="p-5">
          {kind === "reading" ? (
            <div className="max-w-prose whitespace-pre-wrap text-sm leading-7 text-ink-700">{m.text}</div>
          ) : (
            <div className="space-y-3">
              {m.audioUrl ? (
                <audio controls preload="none" className="w-full" src={mediaUrl(m.audioUrl)}>
                  Your browser does not support audio.
                </audio>
              ) : (
                <p className="text-sm text-ink-500">No audio attached.</p>
              )}
              {m.transcriptUnlocked && m.transcript ? (
                <div className="rounded-lg bg-ink-50 p-4 text-sm leading-7 text-ink-700">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">Transcript</p>
                  {m.transcript}
                </div>
              ) : (
                !isTeacher && (
                  <p className="rounded-lg border border-dashed border-ink-300 p-3 text-xs text-ink-500">
                    Submit the exercise to unlock the transcript.
                  </p>
                )
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Result hero */}
      {result && (
        <Card className="mb-4 border-brand-200 bg-brand-50/40">
          <CardContent className="flex flex-wrap items-center gap-4 p-5">
            <div>
              <p className="text-3xl font-black text-ink-900">{result.percentage}%</p>
              <p className="text-xs text-ink-500">
                {result.correct} correct · {result.wrong} wrong · {result.unanswered} unanswered
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={reset}>
                <RotateCcw className="h-3.5 w-3.5" /> Try again
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Questions */}
      <div className="space-y-3">
        {questions.map((q, i) => {
          const review = result ? result.detail.find((d) => d.id === q.id) : null;
          const correctIndex = review ? Number(review.correctAnswer) : q.correctAnswer !== undefined ? Number(q.correctAnswer) : null;
          const chosen = answers[q.id];
          const isCorrect = review && chosen !== undefined && chosen === correctIndex;
          const isWrong = review && chosen !== undefined && chosen !== correctIndex;

          return (
            <Card key={q.id} className={cn(review && (isCorrect ? "border-success-300" : isWrong ? "border-danger-300" : "border-ink-200"))}>
              <CardHeader>
                <CardTitle className="flex-1 text-sm">
                  <span className="mr-2 text-ink-400">{i + 1}.</span>
                  {q.text}
                </CardTitle>
                {review && (
                  isCorrect ? (
                    <Badge tone="green">
                      <Check className="h-3 w-3" /> correct
                    </Badge>
                  ) : (
                    <Badge tone="red">
                      <X className="h-3 w-3" /> {chosen === undefined ? "unanswered" : "wrong"}
                    </Badge>
                  )
                )}
              </CardHeader>
              <CardContent className={cn("space-y-2", isTeacher && "bg-ink-50/50")}>
                {q.options.map((opt, oi) => {
                  const selected = chosen === oi;
                  const isAnswer = correctIndex === oi;
                  return (
                    <label
                      key={oi}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors",
                        selected ? "border-brand-400 bg-brand-50 text-brand-800" : "border-ink-200 bg-white text-ink-700 hover:border-ink-300",
                        review && isAnswer && "border-success-400 bg-success-50 text-success-800",
                        review && selected && !isAnswer && "border-danger-400 bg-danger-50 text-danger-800",
                        (result || isTeacher) && "cursor-default",
                      )}
                    >
                      <input
                        type="radio"
                        name={q.id}
                        checked={selected || false}
                        disabled={Boolean(result) || isTeacher}
                        onChange={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                        className="h-4 w-4 border-ink-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span className="flex-1">{opt}</span>
                      {review && isAnswer && <Eye className="h-3.5 w-3.5" />}
                    </label>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!result && !isTeacher && questions.length > 0 && (
        <div className="sticky bottom-4 mt-5 flex items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white/95 p-3 shadow-lg backdrop-blur">
          <span className="text-xs text-ink-500">
            {answered}/{questions.length} answered
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={answered === 0} onClick={() => setAnswers({})}>
              Clear
            </Button>
            <Button
              size="sm"
              disabled={doSubmit.isPending}
              onClick={() => setConfirmSubmit(true)}
            >
              Submit answers
            </Button>
          </div>
        </div>
      )}

      {isTeacher && (
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Questions" value={m.questions.length} />
          <StatCard label="Estimated" value={fmtDuration(m.estimatedMinutes * 60)} tone="ink" />
          <StatCard label="Your attempts" value={m.attempts.length} tone="brand" />
          <StatCard label="Transcript" value={m.transcriptUnlocked ? "unlocked" : "locked"} tone={m.transcriptUnlocked ? "green" : "amber"} />
        </div>
      )}

      {!isTeacher && m.attempts.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>My attempts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {m.attempts.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-xs">
                <span className="text-ink-500">{a.submittedAt ? new Date(a.submittedAt).toLocaleString() : "—"}</span>
                <span className="flex items-center gap-3 text-ink-400">
                  {a.durationSeconds != null && fmtDuration(a.durationSeconds)}
                  <span className={cn("font-bold", scoreTone(a.percentage))}>{a.percentage}%</span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirmSubmit}
        onOpenChange={setConfirmSubmit}
        title="Submit answers?"
        message={`${answered} of ${questions.length} answered. You can retry after submitting.`}
        confirmLabel="Submit"
        loading={doSubmit.isPending}
        onConfirm={() => doSubmit.mutate()}
      />
    </>
  );
}
