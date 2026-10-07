import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Download, Home, XCircle, MinusCircle } from "lucide-react";
import { api } from "@/lib/api";
import type { AttemptResult } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageLoader,
  ProgressBar,
  Tabs,
} from "@/components/ui";
import { SKILL_ACCENT, SKILL_LABEL, cn, fmtDateTime, fmtDuration, scoreTone } from "@/lib/utils";

export default function ResultPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState("overview");

  const { data, isLoading, error } = useQuery({
    queryKey: ["attempt-result", id],
    queryFn: () => api.get<AttemptResult>(`/attempts/${id}/result`),
    enabled: Boolean(id),
  });

  if (isLoading) return <PageLoader label="Loading result…" />;
  if (error || !data) return <EmptyState title="Result not found" hint="This attempt doesn't exist or isn't yours." />;

  const r = data;
  const review = r.questions ?? [];
  const pending = r.pendingCount > 0;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Download className="h-3.5 w-3.5" /> PDF report
        </Button>
      </div>

      {/* Score hero */}
      <Card className={cn("overflow-hidden", r.passed ? "border-emerald-200" : "border-red-200")}>
        <div className={cn("px-6 py-6 text-center", r.passed ? "bg-emerald-50" : "bg-red-50")}>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
            {r.passed ? (
              <CheckCircle2 className="h-7 w-7 text-success-600" />
            ) : (
              <XCircle className="h-7 w-7 text-danger-500" />
            )}
          </div>
          <p className={cn("mt-3 text-sm font-semibold uppercase tracking-widest", r.passed ? "text-success-600" : "text-danger-600")}>
            {r.passed ? "Passed" : r.status === "TIME_UP" ? "Time's up" : "Not passed"}
          </p>
          <p className={cn("mt-1 text-5xl font-extrabold", scoreTone(r.percentage))}>{r.percentage}%</p>
          <p className="mt-1 text-sm text-ink-500">
            {r.score} / {r.totalPoints} points · pass mark {r.test.passingScore}%
          </p>
          <div className="mx-auto mt-4 flex max-w-md items-center gap-4 text-xs text-ink-600">
            <span className="flex-1">
              <span className="block text-lg font-bold text-ink-900">{fmtDuration(r.durationSeconds)}</span> duration
            </span>
            <span className="flex-1">
              <span className="block text-lg font-bold text-ink-900">{r.correctCount}</span> correct
            </span>
            <span className="flex-1">
              <span className="block text-lg font-bold text-ink-900">{r.wrongCount}</span> wrong
            </span>
            <span className="flex-1">
              <span className="block text-lg font-bold text-ink-900">{r.unansweredCount}</span> blank
            </span>
          </div>
          {pending && (
            <p className="mt-3 inline-block rounded-full bg-warning-500/10 px-3 py-1 text-xs font-medium text-warning-600">
              {r.pendingCount} answer{r.pendingCount === 1 ? "" : "s"} awaiting manual review
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 divide-x divide-ink-100 border-t border-ink-100 text-xs text-ink-500 sm:grid-cols-4">
          <div className="px-4 py-3">
            <p className="font-semibold text-ink-800">{r.test.title}</p>
            <p className="mt-0.5">test</p>
          </div>
          <div className="px-4 py-3">
            <p className="font-semibold text-ink-800">
              <span className={`rounded px-1 py-0.5 text-[10px] ${SKILL_ACCENT[r.test.skill]}`}>
                {SKILL_LABEL[r.test.skill]}
              </span>
            </p>
            <p className="mt-0.5">{r.test.difficulty?.replaceAll("_", " ").toLowerCase()}</p>
          </div>
          <div className="px-4 py-3">
            <p className="font-semibold text-ink-800">{fmtDateTime(r.submittedAt ?? r.startedAt)}</p>
            <p className="mt-0.5">submitted</p>
          </div>
          <div className="px-4 py-3">
            <p className="font-semibold text-ink-800">
              {r.tabSwitches} / {r.refreshCount}
            </p>
            <p className="mt-0.5">tab switches / refreshes</p>
          </div>
        </div>
      </Card>

      <div className="mt-5">
        <Tabs
          tabs={[
            { value: "overview", label: "Overview" },
            { value: "review", label: "Answer review", badge: review.length },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === "overview" ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Score breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: "Correct", value: r.correctCount, tone: "bg-success-500" },
                { label: "Wrong", value: r.wrongCount, tone: "bg-danger-500" },
                { label: "Unanswered", value: r.unansweredCount, tone: "bg-ink-300" },
                { label: "Pending review", value: r.pendingCount, tone: "bg-warning-500" },
              ].map((row) => (
                <div key={row.label}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-ink-600">{row.label}</span>
                    <span className="font-semibold text-ink-900">{row.value}</span>
                  </div>
                  <ProgressBar
                    value={review.length || r.correctCount + r.wrongCount + r.unansweredCount ? (row.value / Math.max(1, review.length || r.correctCount + r.wrongCount + r.unansweredCount)) * 100 : 0}
                    tone={row.tone}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>What's next</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button variant="outline" onClick={() => navigate("/tests")}>
                Back to my tests
              </Button>
              <Button variant="outline" onClick={() => navigate("/")}>
                <Home className="h-3.5 w-3.5" /> Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : review.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No review available"
            hint="Detailed review unlocks once the attempt is submitted and graded."
          />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {review.map((q, i) => {
            const tone =
              q.isCorrect === null ? "border-warning-500/50 bg-warning-500/5" : q.isCorrect ? "border-emerald-200 bg-emerald-50/40" : "border-red-200 bg-red-50/40";
            return (
              <Card key={q.id} className={cn("p-4", tone)}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-ink-900">
                    <span className="mr-2 text-ink-400">{i + 1}.</span>
                    {q.text}
                  </p>
                  <span className="shrink-0">
                    {q.isCorrect === null ? (
                      <Badge tone="amber">
                        <MinusCircle className="h-3 w-3" /> pending
                      </Badge>
                    ) : q.isCorrect ? (
                      <Badge tone="green">+{q.points} pt</Badge>
                    ) : (
                      <Badge tone="red">0 pts</Badge>
                    )}
                  </span>
                </div>

                {q.options.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {q.options.map((opt) => {
                      const chosen = q.yourAnswer?.selectedOptionIds?.includes(opt.id);
                      return (
                        <li
                          key={opt.id}
                          className={cn(
                            "flex items-center justify-between rounded-md border px-3 py-1.5 text-xs",
                            opt.isCorrect
                              ? "border-emerald-300 bg-white text-emerald-800"
                              : chosen
                                ? "border-red-300 bg-white text-red-700"
                                : "border-ink-200 bg-white text-ink-500",
                          )}
                        >
                          <span>{opt.text}</span>
                          <span className="flex gap-2">
                            {opt.isCorrect && <span className="font-semibold">correct</span>}
                            {chosen && <span className="font-semibold">your pick</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {(q.type === "FILL_BLANK" || q.type === "SHORT_ANSWER" || q.type === "MATCHING") && (
                  <div className="mt-3 space-y-1.5 text-xs">
                    <p>
                      <span className="text-ink-500">Your answer: </span>
                      <span className={cn("font-medium", q.isCorrect ? "text-success-600" : "text-ink-800")}>
                        {q.yourAnswer?.answerText || <em className="text-ink-400">blank</em>}
                      </span>
                    </p>
                    {q.correctAnswer && (
                      <p>
                        <span className="text-ink-500">Correct answer: </span>
                        <span className="font-medium text-ink-900">{q.correctAnswer}</span>
                      </p>
                    )}
                  </div>
                )}

                {q.explanation && (
                  <p className="mt-3 rounded-md bg-white/70 p-2.5 text-xs leading-relaxed text-ink-600 ring-1 ring-ink-200">
                    <span className="font-semibold text-ink-800">Explanation: </span>
                    {q.explanation}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
