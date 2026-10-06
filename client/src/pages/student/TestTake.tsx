import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Send } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { AttemptAnswerInput, AttemptResult, AttemptView } from "@/lib/types";
import { Button, Card, CardContent, CardHeader, ConfirmDialog, PageLoader, ProgressBar, Spinner } from "@/components/ui";
import { SKILL_LABEL, cn, fmtCountdown, errorMessage } from "@/lib/utils";

type AnswerDraft = { selectedOptionIds?: string[]; answerText?: string };

export default function TestTakePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [answers, setAnswers] = useState<Record<string, AnswerDraft>>({});
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [current, setCurrent] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pending = useRef<Record<string, AttemptAnswerInput>>({});
  const finished = useRef(false);

  const { data: attempt, isLoading, error } = useQuery({
    queryKey: ["attempt", id],
    queryFn: () => api.get<AttemptView>(`/attempts/${id}`),
    enabled: Boolean(id),
    refetchInterval: 60_000,
  });

  // Seed local answers + timer from the server snapshot.
  useEffect(() => {
    if (!attempt) return;
    const seeded: Record<string, AnswerDraft> = {};
    for (const a of attempt.answers) {
      seeded[a.questionId] = {
        selectedOptionIds: a.selectedOptionIds ?? [],
        answerText: a.answerText ?? "",
      };
    }
    setAnswers(seeded);
    setSecondsLeft(attempt.remainingSeconds ?? null);
  }, [attempt?.id, attempt?.remainingSeconds]);

  const flushSave = useCallback(async (questionId: string) => {
    const payload = pending.current[questionId];
    if (!payload || !id) return;
    delete pending.current[questionId];
    setSaveState("saving");
    try {
      const res = await api.post<{ saved: boolean; expired?: boolean; result?: AttemptResult }>(
        `/attempts/${id}/answer`,
        payload,
      );
      if (res.expired && res.result) {
        finished.current = true;
        toast.info("Time's up — your attempt was submitted automatically.");
        qc.invalidateQueries({ queryKey: ["attempts"] });
        navigate(`/results/${res.result.id}`, { replace: true });
        return;
      }
      setSaveState("saved");
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        finished.current = true;
        toast.error(err.message);
        navigate(`/results/${id}`, { replace: true });
      } else {
        setSaveState("idle");
      }
    }
  }, [id, navigate, qc]);

  const scheduleSave = useCallback(
    (questionId: string, payload: AttemptAnswerInput) => {
      pending.current[questionId] = payload;
      if (timers.current[questionId]) clearTimeout(timers.current[questionId]);
      timers.current[questionId] = setTimeout(() => void flushSave(questionId), 600);
    },
    [flushSave],
  );

  // Countdown + auto-submit.
  useEffect(() => {
    if (secondsLeft === null) return;
    if (secondsLeft <= 0) {
      if (!finished.current) {
        finished.current = true;
        void submitMutation.mutate({ auto: true });
      }
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  // Anti-cheat events.
  useEffect(() => {
    if (!attempt || attempt.expired) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && !finished.current) {
        void api.post(`/attempts/${id}/event`, { type: "TAB_BLUR" }).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [attempt?.id, attempt?.expired, id]);

  // Flush pending saves on leave.
  useEffect(() => {
    return () => {
      for (const qid of Object.keys(pending.current)) void flushSave(qid);
      for (const t of Object.values(timers.current)) clearTimeout(t);
    };
  }, [flushSave]);

  const submitMutation = useMutation({
    mutationFn: (body: { auto: boolean }) => api.post<AttemptResult>(`/attempts/${id}/submit`, body),
    onSuccess: (result) => {
      finished.current = true;
      qc.invalidateQueries({ queryKey: ["attempts"] });
      qc.invalidateQueries({ queryKey: ["analytics", "me"] });
      navigate(`/results/${result.id}`, { replace: true });
    },
    onError: (err) => {
      finished.current = false;
      if (!submitMutation.variables?.auto) toast.error(errorMessage(err));
      else toast.error(errorMessage(err));
    },
  });

  async function confirmSubmit() {
    setConfirmOpen(false);
    // Flush every pending answer first.
    for (const qid of Object.keys(pending.current)) {
      if (timers.current[qid]) clearTimeout(timers.current[qid]);
      await flushSave(qid);
    }
    submitMutation.mutate({ auto: false });
  }

  const questions = attempt?.questions ?? [];
  const answeredCount = useMemo(
    () =>
      questions.filter((q) => {
        const a = answers[q.id];
        if (!a) return false;
        return (a.selectedOptionIds?.length ?? 0) > 0 || Boolean((a.answerText ?? "").trim());
      }).length,
    [questions, answers],
  );

  if (isLoading) return <PageLoader label="Loading test…" />;

  if (error) {
    if (error instanceof ApiError) {
      return (
        <Card className="mx-auto max-w-md p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-warning-500" />
          <p className="mt-3 text-sm font-medium text-ink-800">{error.message}</p>
          <Button className="mt-4" size="sm" variant="outline" onClick={() => navigate("/tests")}>
            Back to my tests
          </Button>
        </Card>
      );
    }
    return <PageLoader label="Loading test…" />;
  }

  if (!attempt) return null;

  if (attempt.expired || attempt.status !== "IN_PROGRESS") {
    return <Navigate to={`/results/${attempt.id}`} replace />;
  }

  const q = questions[Math.min(current, questions.length - 1)];
  const draft = q ? (answers[q.id] ?? {}) : {};
  const timerTone = secondsLeft !== null && secondsLeft < 60 ? "text-danger-600" : "text-ink-900";

  function pickSingle(questionId: string, optionId: string) {
    const next = { selectedOptionIds: [optionId] };
    setAnswers((prev) => ({ ...prev, [questionId]: next }));
    scheduleSave(questionId, { questionId, selectedOptionIds: [optionId] });
  }

  function toggleMulti(questionId: string, optionId: string) {
    const current2 = answers[questionId]?.selectedOptionIds ?? [];
    const next = current2.includes(optionId) ? current2.filter((x) => x !== optionId) : [...current2, optionId];
    setAnswers((prev) => ({ ...prev, [questionId]: { selectedOptionIds: next } }));
    scheduleSave(questionId, { questionId, selectedOptionIds: next });
  }

  function setText(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: { answerText: value } }));
    scheduleSave(questionId, { questionId, answerText: value });
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* Exam header */}
      <div className="sticky top-14 z-10 -mx-4 mb-4 border-b border-ink-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-bold text-ink-900">{attempt.test.title}</h1>
              <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-600">
                {SKILL_LABEL[attempt.test.skill]}
              </span>
            </div>
            <p className="text-xs text-ink-500">
              Question {current + 1} of {questions.length} · {answeredCount} answered
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={cn("font-mono text-xl font-bold tabular-nums", timerTone)}>{fmtCountdown(secondsLeft)}</span>
            <span className="text-[10px] text-ink-400">
              {saveState === "saving" ? "saving…" : saveState === "saved" ? "saved" : ""}
            </span>
            <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={submitMutation.isPending}>
              {submitMutation.isPending ? <Spinner /> : <Send className="h-3.5 w-3.5" />} Submit test
            </Button>
          </div>
        </div>
        <ProgressBar value={questions.length ? (answeredCount / questions.length) * 100 : 0} className="mt-2.5" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
        {/* Question card */}
        {q && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                  {current + 1}
                </span>
                <Badge type={q.type} points={q.points} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="whitespace-pre-wrap text-[15px] font-medium leading-relaxed text-ink-900">{q.text}</p>

              {(q.type === "MULTIPLE_CHOICE" || q.type === "TRUE_FALSE") && (
                <div className="space-y-2">
                  {q.options.map((opt, i) => {
                    const selected = draft.selectedOptionIds?.[0] === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => pickSingle(q.id, opt.id)}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-lg border p-3 text-left text-sm transition-colors",
                          selected
                            ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500"
                            : "border-ink-200 hover:border-ink-300 hover:bg-ink-50",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 text-[9px] font-bold",
                            selected ? "border-brand-600 bg-brand-600 text-white" : "border-ink-300 text-transparent",
                          )}
                        >
                          ✓
                        </span>
                        <span>
                          <span className="mr-1.5 font-semibold text-ink-400">{String.fromCharCode(65 + i)}.</span>
                          {opt.text}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {q.type === "MULTIPLE_SELECT" && (
                <div className="space-y-2">
                  <p className="text-xs text-ink-500">Select all that apply.</p>
                  {q.options.map((opt, i) => {
                    const selected = draft.selectedOptionIds?.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggleMulti(q.id, opt.id)}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-lg border p-3 text-left text-sm transition-colors",
                          selected
                            ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500"
                            : "border-ink-200 hover:border-ink-300 hover:bg-ink-50",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 text-[9px] font-bold",
                            selected ? "border-brand-600 bg-brand-600 text-white" : "border-ink-300 text-transparent",
                          )}
                        >
                          ✓
                        </span>
                        <span>
                          <span className="mr-1.5 font-semibold text-ink-400">{String.fromCharCode(65 + i)}.</span>
                          {opt.text}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {q.type === "FILL_BLANK" && (
                <div>
                  <p className="mb-1.5 text-xs text-ink-500">Type your answer in the blank.</p>
                  <input
                    className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                    value={draft.answerText ?? ""}
                    onChange={(e) => setText(q.id, e.target.value)}
                    placeholder="Your answer…"
                    autoComplete="off"
                  />
                </div>
              )}

              {q.type === "SHORT_ANSWER" && (
                <div>
                  <p className="mb-1.5 text-xs text-ink-500">Write a short answer.</p>
                  <textarea
                    className="min-h-[110px] w-full rounded-lg border border-ink-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                    value={draft.answerText ?? ""}
                    onChange={(e) => setText(q.id, e.target.value)}
                    placeholder="Your answer…"
                  />
                </div>
              )}

              {q.type === "MATCHING" && (
                <div>
                  <p className="mb-1.5 text-xs text-ink-500">
                    Match the pairs — one per line, in the format <code className="font-mono">left: right</code>.
                  </p>
                  <textarea
                    className="min-h-[110px] w-full rounded-lg border border-ink-300 px-3 py-2 font-mono text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                    value={draft.answerText ?? ""}
                    onChange={(e) => setText(q.id, e.target.value)}
                    placeholder={"apple: olma\ncat: mushuk"}
                  />
                </div>
              )}

              <div className="flex items-center justify-between border-t border-ink-100 pt-3">
                <Button variant="outline" size="sm" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>
                  ← Previous
                </Button>
                <Button
                  size="sm"
                  disabled={current >= questions.length - 1}
                  onClick={() => setCurrent((c) => c + 1)}
                >
                  Next →
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Navigator */}
        <div className="space-y-3 lg:sticky lg:top-32 lg:self-start">
          <Card className="p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Navigator</p>
            <div className="grid grid-cols-6 gap-1.5 lg:grid-cols-5">
              {questions.map((qq, i) => {
                const a = answers[qq.id];
                const done = (a?.selectedOptionIds?.length ?? 0) > 0 || Boolean((a?.answerText ?? "").trim());
                return (
                  <button
                    key={qq.id}
                    type="button"
                    onClick={() => setCurrent(i)}
                    className={cn(
                      "flex h-8 items-center justify-center rounded-md text-xs font-semibold transition-colors",
                      i === current
                        ? "bg-ink-900 text-white"
                        : done
                          ? "bg-brand-100 text-brand-700 ring-1 ring-brand-300"
                          : "bg-ink-100 text-ink-500 hover:bg-ink-200",
                    )}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex gap-3 text-[10px] text-ink-500">
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm bg-brand-100 ring-1 ring-brand-300" /> answered
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm bg-ink-100" /> blank
              </span>
            </div>
          </Card>
          <Card className="p-4 text-xs text-ink-500">
            <p className="font-semibold text-ink-700">Passing score</p>
            <p className="mt-1 text-2xl font-bold text-ink-900">{attempt.test.passingScore}%</p>
            <p className="mt-2 leading-relaxed">
              Answers save automatically. Leaving the tab is recorded. The test submits itself when the timer hits
              zero.
            </p>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Submit test?"
        message={`You have answered ${answeredCount} of ${questions.length} questions. After submitting you cannot change your answers.`}
        confirmLabel="Submit"
        loading={submitMutation.isPending}
        onConfirm={confirmSubmit}
      />
    </div>
  );
}

function Badge({ type, points }: { type: string; points: number }) {
  return (
    <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-600">
      {type.replace("_", " ").toLowerCase()} · {points} pt{points === 1 ? "" : "s"}
    </span>
  );
}
