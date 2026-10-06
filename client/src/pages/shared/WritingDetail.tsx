import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Send } from "lucide-react";
import { api } from "@/lib/api";
import type { WritingDetail, WritingSubmissionRow } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Input,
  Label,
  Modal,
  PageLoader,
  ProgressBar,
  StatCard,
  Textarea,
} from "@/components/ui";
import { LEVEL_LABEL, cn, errorMessage, fmtDate, fmtDateTime, scoreTone } from "@/lib/utils";

export default function WritingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isTeacher = user?.role === "TEACHER";
  const qc = useQueryClient();

  const [text, setText] = useState("");
  const [gradeFor, setGradeFor] = useState<WritingSubmissionRow | null>(null);
  const [score, setScore] = useState("80");
  const [feedback, setFeedback] = useState("");
  const seededFor = useRef<string | null>(null);

  const detail = useQuery({
    queryKey: ["writing", id],
    queryFn: () => api.get<WritingDetail>(`/writing/${id}`),
    enabled: Boolean(id) && !isTeacher,
  });

  const submissions = useQuery({
    queryKey: ["writing-submissions", id],
    queryFn: () => api.get<WritingSubmissionRow[]>(`/writing/${id}/submissions`),
    enabled: Boolean(id) && isTeacher,
  });

  const wordCount = useMemo(() => text.trim().split(/\s+/).filter(Boolean).length, [text]);
  useEffect(() => {
    const d = detail.data;
    if (d && seededFor.current !== d.id) {
      seededFor.current = d.id;
      setText(d.submission?.text ?? "");
    }
  }, [detail.data]);

  const submit = useMutation({
    mutationFn: () => api.post(`/writing/${id}/submit`, { text }),
    onSuccess: () => {
      toast.success("Essay submitted");
      qc.invalidateQueries({ queryKey: ["writing"] });
      qc.invalidateQueries({ queryKey: ["writing", id] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const grade = useMutation({
    mutationFn: () => api.post(`/writing/submissions/${gradeFor!.id}/grade`, { score: Number(score), feedback: feedback.trim() }),
    onSuccess: () => {
      toast.success("Submission graded");
      setGradeFor(null);
      setFeedback("");
      qc.invalidateQueries({ queryKey: ["writing-submissions", id] });
      qc.invalidateQueries({ queryKey: ["writing"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (isTeacher) {
    if (submissions.isLoading) return <PageLoader label="Loading submissions…" />;
    const rows = submissions.data ?? [];
    return (
      <>
        <BackToWriting />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-ink-900">Submissions</h1>
          <Badge tone="gray">{rows.length} total</Badge>
        </div>

        {rows.length === 0 ? (
          <EmptyState title="No submissions yet" hint="Student essays will appear here for grading." />
        ) : (
          <div className="space-y-3">
            {rows.map((s) => (
              <Card key={s.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <Avatar src={s.user.avatarUrl} firstName={s.user.firstName} lastName={s.user.lastName} size="sm" />
                    <div>
                      <p className="text-sm font-semibold text-ink-900">
                        {s.user.firstName} {s.user.lastName}
                      </p>
                      <p className="text-[10px] text-ink-400">
                        @{s.user.username} · {s.wordCount} words · {fmtDateTime(s.submittedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.status === "GRADED" ? (
                      <Badge tone="green">
                        graded · {s.score}/100
                      </Badge>
                    ) : (
                      <Badge tone="amber">needs grading</Badge>
                    )}
                    <Button
                      size="sm"
                      variant={s.status === "GRADED" ? "outline" : "default"}
                      onClick={() => {
                        setGradeFor(s);
                        setScore(s.score != null ? String(s.score) : "80");
                        setFeedback(s.feedback ?? "");
                      }}
                    >
                      {s.status === "GRADED" ? "Re-grade" : "Grade"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="max-h-52 overflow-y-auto whitespace-pre-wrap rounded-lg bg-ink-50 p-3 text-sm leading-6 text-ink-700">
                    {s.text}
                  </div>
                  {s.status === "GRADED" && s.feedback && (
                    <div className="rounded-lg border border-brand-100 bg-brand-50/50 p-3 text-sm text-ink-700">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-brand-500">Feedback</p>
                      {s.feedback}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Modal
          open={Boolean(gradeFor)}
          onOpenChange={(o) => !o && setGradeFor(null)}
          title={`Grade — ${gradeFor?.user.firstName ?? ""} ${gradeFor?.user.lastName ?? ""}`}
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setGradeFor(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={grade.isPending || !feedback.trim()}
                onClick={() => grade.mutate()}
              >
                {grade.isPending ? "Saving…" : "Save grade"}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <div>
              <Label>Score (0–100)</Label>
              <Input type="number" min={0} max={100} value={score} onChange={(e) => setScore(e.target.value)} />
              <ProgressBar
                value={Number(score) || 0}
                className="mt-2"
                tone={Number(score) >= 60 ? "bg-success-500" : "bg-danger-500"}
              />
            </div>
            <Field label="Feedback *">
              <Textarea rows={5} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="What was good, what to improve, concrete suggestions…" />
            </Field>
          </div>
        </Modal>
      </>
    );
  }

  if (detail.isLoading) return <PageLoader label="Loading task…" />;
  if (!detail.data) return <EmptyState title="Writing task not found" />;
  const w = detail.data;
  const sub = w.submission;

  return (
    <>
      <BackToWriting />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-ink-900">{w.title}</h1>
        <Badge tone="gray">{LEVEL_LABEL[w.level]}</Badge>
        <Badge tone="gray">
          {w.minWords}–{w.maxWords} words
        </Badge>
        {w.dueAt && <Badge tone="amber">due {fmtDate(w.dueAt)}</Badge>}
      </div>

      <Card className="mb-4">
        <CardContent className="p-5">
          <p className="whitespace-pre-wrap text-sm leading-6 text-ink-700">{w.instructions}</p>
          {w.topic && <p className="mt-2 text-xs text-ink-400">Topic: {w.topic}</p>}
        </CardContent>
      </Card>

      {sub && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Status" value={sub.status === "GRADED" ? "Graded" : "Submitted"} tone={sub.status === "GRADED" ? "green" : "amber"} />
          <StatCard label="Words" value={sub.wordCount} tone="ink" />
          <StatCard label="Score" value={sub.score != null ? `${sub.score}/100` : "—"} tone="brand" />
          <StatCard label="Submitted" value={fmtDate(sub.submittedAt)} />
        </div>
      )}

      {sub?.status === "GRADED" && sub.feedback && (
        <Card className="mb-4 border-brand-200">
          <CardHeader>
            <CardTitle>Teacher feedback</CardTitle>
            <span className={cn("text-lg font-bold", scoreTone(sub.score))}>{sub.score}/100</span>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-6 text-ink-700">{sub.feedback}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{sub ? "Your essay" : "Write your essay"}</CardTitle>
          {sub && <Badge tone="gray">resubmitting resets grading</Badge>}
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea rows={14} value={text} onChange={(e) => setText(e.target.value)} placeholder={sub ? "Type here to revise and resubmit…" : "Start writing…"} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={cn("text-xs", wordCount < w.minWords ? "text-warning-600" : wordCount > w.maxWords ? "text-danger-600" : "text-success-600")}>
              {wordCount} words
              {wordCount < w.minWords && ` · ${w.minWords - wordCount} more needed`}
              {wordCount > w.maxWords && ` · over by ${wordCount - w.maxWords}`}
            </span>
            <div className="flex gap-2">
              {text !== sub?.text && text.trim() && (
                <Button variant="ghost" size="sm" onClick={() => setText(sub?.text ?? "")}>
                  Revert
                </Button>
              )}
              <Button
                size="sm"
                disabled={submit.isPending || wordCount < w.minWords || !text.trim()}
                onClick={() => submit.mutate()}
              >
                <Send className="h-3.5 w-3.5" />
                {submit.isPending ? "Submitting…" : sub ? "Resubmit" : "Submit essay"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function BackToWriting() {
  return (
    <Link to="/writing" className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-brand-600">
      <ArrowLeft className="h-3 w-3" /> Writing tasks
    </Link>
  );
}
