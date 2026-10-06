import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Copy, Plus, Save, Send, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { Level, QuestionType, Skill, TestDetail } from "@/lib/types";
import { AssignDialog } from "@/components/AssignDialog";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Field,
  Input,
  Label,
  PageLoader,
  Select,
  Textarea,
} from "@/components/ui";
import { LEVEL_LABEL, SKILL_LABEL, errorMessage } from "@/lib/utils";

interface OptionDraft {
  text: string;
  isCorrect: boolean;
}

interface QuestionDraft {
  key: string;
  type: QuestionType;
  text: string;
  topic: string;
  explanation: string;
  correctAnswer: string;
  points: string;
  options: OptionDraft[];
}

interface MetaState {
  title: string;
  description: string;
  topic: string;
  skill: Skill;
  difficulty: Level;
  timeLimitMinutes: string;
  passingScore: string;
  instructions: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
}

const defaultMeta: MetaState = {
  title: "",
  description: "",
  topic: "",
  skill: "GRAMMAR",
  difficulty: "INTERMEDIATE",
  timeLimitMinutes: "15",
  passingScore: "60",
  instructions: "",
  status: "DRAFT",
};

function newQuestion(type: QuestionType = "MULTIPLE_CHOICE"): QuestionDraft {
  return {
    key: crypto.randomUUID(),
    type,
    text: "",
    topic: "",
    explanation: "",
    correctAnswer: type === "TRUE_FALSE" ? "true" : "",
    points: "1",
    options:
      type === "MULTIPLE_CHOICE" || type === "MULTIPLE_SELECT"
        ? [
            { text: "", isCorrect: true },
            { text: "", isCorrect: false },
            { text: "", isCorrect: false },
            { text: "", isCorrect: false },
          ]
        : type === "TRUE_FALSE"
          ? [
              { text: "True", isCorrect: true },
              { text: "False", isCorrect: false },
            ]
          : [],
  };
}

function toDrafts(test: TestDetail): QuestionDraft[] {
  return test.questions.map((q) => ({
    key: q.id,
    type: q.type,
    text: q.text,
    topic: q.topic ?? "",
    explanation: q.explanation ?? "",
    correctAnswer: q.correctAnswer ?? "",
    points: String(q.points),
    options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
  }));
}

function toMeta(test: TestDetail): MetaState {
  return {
    title: test.title,
    description: test.description ?? "",
    topic: test.topic ?? "",
    skill: test.skill,
    difficulty: test.difficulty,
    timeLimitMinutes: String(Math.round(test.timeLimitSeconds / 60)),
    passingScore: String(test.passingScore),
    instructions: test.instructions ?? "",
    status: test.status,
  };
}

export default function TestEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [meta, setMeta] = useState<MetaState>(defaultMeta);
  const [questions, setQuestions] = useState<QuestionDraft[]>([newQuestion()]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const detail = useQuery({
    queryKey: ["test-detail", id],
    queryFn: () => api.get<TestDetail>(`/tests/${id}`),
    enabled: Boolean(id) && !isNew,
  });

  useEffect(() => {
    if (detail.data) {
      setMeta(toMeta(detail.data));
      setQuestions(toDrafts(detail.data));
    }
  }, [detail.data?.id]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title: meta.title.trim(),
        description: meta.description.trim() || undefined,
        topic: meta.topic.trim() || undefined,
        skill: meta.skill,
        difficulty: meta.difficulty,
        timeLimitSeconds: Number(meta.timeLimitMinutes) * 60,
        passingScore: Number(meta.passingScore),
        instructions: meta.instructions.trim() || undefined,
        status: meta.status,
        questions: questions.map((q) => ({
          type: q.type,
          text: q.text.trim(),
          topic: q.topic.trim() || undefined,
          explanation: q.explanation.trim() || undefined,
          correctAnswer: q.type === "SHORT_ANSWER" || q.type === "MULTIPLE_CHOICE" || q.type === "MULTIPLE_SELECT" ? (q.correctAnswer.trim() || undefined) : q.correctAnswer.trim() || undefined,
          points: Number(q.points) || 1,
          options: q.options
            .filter((o) => o.text.trim())
            .map((o) => ({ text: o.text.trim(), isCorrect: o.isCorrect })),
        })),
      };
      return isNew ? api.post<TestDetail>("/tests", payload) : api.patch<TestDetail>(`/tests/${id}`, payload);
    },
    onSuccess: (test) => {
      toast.success(isNew ? "Test created" : "Test saved");
      qc.invalidateQueries({ queryKey: ["tests"] });
      if (isNew) navigate(`/tests/${test.id}`, { replace: true });
      else qc.invalidateQueries({ queryKey: ["test-detail", id] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.details && Array.isArray((err.details as unknown[]))) {
        const d = err.details as Array<{ message?: string; path?: Array<string | number> }>;
        toast.error(`${err.message}: ${d.map((x) => `${x.path?.join(".")}: ${x.message}`).join("; ")}`);
      } else {
        toast.error(errorMessage(err));
      }
    },
  });

  function validate(): string | null {
    if (!meta.title.trim()) return "Test title is required.";
    if (!meta.timeLimitMinutes || Number(meta.timeLimitMinutes) < 1) return "Time limit must be at least 1 minute.";
    if (questions.length === 0) return "Add at least one question.";
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const label = `Q${i + 1}`;
      if (!q.text.trim()) return `${label}: question text is required.`;
      if (q.type === "MULTIPLE_CHOICE") {
        const filled = q.options.filter((o) => o.text.trim());
        if (filled.length < 2) return `${label}: add at least 2 options.`;
        if (q.options.filter((o) => o.isCorrect && o.text.trim()).length !== 1) return `${label}: mark exactly one correct option.`;
      }
      if (q.type === "MULTIPLE_SELECT") {
        if (q.options.filter((o) => o.isCorrect && o.text.trim()).length < 1) return `${label}: mark at least one correct option.`;
      }
      if (q.type === "FILL_BLANK" && !q.correctAnswer.trim()) return `${label}: provide the correct answer.`;
      if (q.type === "MATCHING" && !q.correctAnswer.trim()) return `${label}: provide matching pairs.`;
      if (q.type === "TRUE_FALSE" && !/^(true|false)$/i.test(q.correctAnswer.trim())) return `${label}: set the answer to True or False.`;
    }
    return null;
  }

  const dirty = useMemo(() => true, []);

  if (!isNew && detail.isLoading) return <PageLoader label="Loading test…" />;
  if (!isNew && detail.error) {
    return (
      <Card className="mx-auto max-w-md p-6 text-center text-sm text-ink-600">
        Test not found.
        <div className="mt-3">
          <Button size="sm" variant="outline" onClick={() => navigate("/tests")}>
            Back to tests
          </Button>
        </div>
      </Card>
    );
  }

  function updateQuestion(key: string, patch: Partial<QuestionDraft>) {
    setQuestions((prev) => prev.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  }

  function changeType(key: string, type: QuestionType) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.key !== key) return q;
        const base = { ...q, type };
        if (type === "TRUE_FALSE") {
          base.correctAnswer = "true";
          base.options = [
            { text: "True", isCorrect: true },
            { text: "False", isCorrect: false },
          ];
        } else if (type === "MULTIPLE_CHOICE" || type === "MULTIPLE_SELECT") {
          if (q.options.length < 2 || ["FILL_BLANK", "SHORT_ANSWER", "MATCHING"].includes(q.type)) {
            base.options = [
              { text: "", isCorrect: true },
              { text: "", isCorrect: false },
              { text: "", isCorrect: false },
              { text: "", isCorrect: false },
            ];
          }
          base.correctAnswer = "";
        } else {
          base.options = [];
          base.correctAnswer = "";
        }
        return base;
      }),
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => navigate("/tests")} className="inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-brand-600">
          <ArrowLeft className="h-3 w-3" /> All tests
        </button>
        <div className="flex flex-wrap gap-2">
          {!isNew && (
            <>
              <Button variant="outline" size="sm" onClick={() => setAssignOpen(true)}>
                <Send className="h-3.5 w-3.5" /> Assign
              </Button>
              <Button variant="outline" size="sm" className="text-danger-600" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </>
          )}
          <Button size="sm" disabled={save.isPending} onClick={() => {
            const err = validate();
            if (err) return toast.error(err);
            save.mutate();
          }}>
            {save.isPending ? "Saving…" : <Save className="h-3.5 w-3.5" />}
            {isNew ? "Create test" : "Save changes"}
          </Button>
        </div>
      </div>

      <h1 className="mb-4 text-xl font-bold text-ink-900">{isNew ? "New test" : meta.title || "Edit test"}</h1>

      {/* Meta */}
      <Card>
        <CardHeader>
          <CardTitle>Test details</CardTitle>
          <Badge tone={meta.status === "PUBLISHED" ? "green" : "amber"}>{meta.status.toLowerCase()}</Badge>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-3">
            <Field label="Title *">
              <Input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} placeholder="e.g. Present Perfect — Quiz 3" />
            </Field>
          </div>
          <Field label="Skill">
            <Select value={meta.skill} onChange={(e) => setMeta({ ...meta, skill: e.target.value as Skill })}>
              {(Object.keys(SKILL_LABEL) as Skill[]).map((s) => (
                <option key={s} value={s}>
                  {SKILL_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Difficulty">
            <Select value={meta.difficulty} onChange={(e) => setMeta({ ...meta, difficulty: e.target.value as Level })}>
              {(Object.keys(LEVEL_LABEL) as Level[]).map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABEL[l]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={meta.status} onChange={(e) => setMeta({ ...meta, status: e.target.value as MetaState["status"] })}>
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="ARCHIVED">Archived</option>
            </Select>
          </Field>
          <Field label="Topic">
            <Input value={meta.topic} onChange={(e) => setMeta({ ...meta, topic: e.target.value })} placeholder="e.g. grammar" />
          </Field>
          <Field label="Time limit (minutes) *">
            <Input type="number" min={1} max={240} value={meta.timeLimitMinutes} onChange={(e) => setMeta({ ...meta, timeLimitMinutes: e.target.value })} />
          </Field>
          <Field label="Passing score (%)">
            <Input type="number" min={0} max={100} value={meta.passingScore} onChange={(e) => setMeta({ ...meta, passingScore: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description">
              <Textarea rows={2} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
            </Field>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <Field label="Instructions for students">
              <Textarea rows={2} value={meta.instructions} onChange={(e) => setMeta({ ...meta, instructions: e.target.value })} />
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* Questions */}
      <div className="mt-5 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-800">
          Questions <span className="text-ink-400">({questions.length})</span>
        </h2>
        <div className="flex gap-2">
          <Select
            className="w-44"
            value=""
            onChange={(e) => {
              if (e.target.value) {
                setQuestions((prev) => [...prev, newQuestion(e.target.value as QuestionType)]);
                e.target.value = "";
              }
            }}
          >
            <option value="">Add question…</option>
            <option value="MULTIPLE_CHOICE">Multiple choice</option>
            <option value="MULTIPLE_SELECT">Multiple select</option>
            <option value="TRUE_FALSE">True / False</option>
            <option value="FILL_BLANK">Fill in the blank</option>
            <option value="SHORT_ANSWER">Short answer</option>
            <option value="MATCHING">Matching</option>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setQuestions((prev) => [...prev, newQuestion()])}>
            <Plus className="h-3.5 w-3.5" /> Quick add MC
          </Button>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {questions.map((q, i) => (
          <Card key={q.key}>
            <CardHeader>
              <div className="flex w-full flex-wrap items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-800 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <Select value={q.type} onChange={(e) => changeType(q.key, e.target.value as QuestionType)} className="w-52">
                  <option value="MULTIPLE_CHOICE">Multiple choice</option>
                  <option value="MULTIPLE_SELECT">Multiple select</option>
                  <option value="TRUE_FALSE">True / False</option>
                  <option value="FILL_BLANK">Fill in the blank</option>
                  <option value="SHORT_ANSWER">Short answer</option>
                  <option value="MATCHING">Matching</option>
                </Select>
                <div className="ml-auto flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs text-ink-500">
                    points
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={q.points}
                      onChange={(e) => updateQuestion(q.key, { points: e.target.value })}
                      className="h-7 w-16 text-center"
                    />
                  </label>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    title="Duplicate"
                    onClick={() => {
                      const copy = { ...q, key: crypto.randomUUID(), options: q.options.map((o) => ({ ...o })) };
                      setQuestions((prev) => {
                        const idx = prev.findIndex((x) => x.key === q.key);
                        const next = [...prev];
                        next.splice(idx + 1, 0, copy);
                        return next;
                      });
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="iconSm" className="text-danger-500" title="Remove" onClick={() => setQuestions((prev) => prev.filter((x) => x.key !== q.key))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Question *">
                <Textarea rows={2} value={q.text} onChange={(e) => updateQuestion(q.key, { text: e.target.value })} placeholder="Type the question…" />
              </Field>

              {(q.type === "MULTIPLE_CHOICE" || q.type === "MULTIPLE_SELECT") && (
                <div className="space-y-2">
                  <Label>
                    Options{" "}
                    <span className="font-normal text-ink-400">
                      ({q.type === "MULTIPLE_CHOICE" ? "pick exactly one correct" : "one or more correct"})
                    </span>
                  </Label>
                  {q.options.map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <input
                        type={q.type === "MULTIPLE_CHOICE" ? "radio" : "checkbox"}
                        name={`correct-${q.key}`}
                        checked={opt.isCorrect}
                        onChange={() =>
                          updateQuestion(q.key, {
                            options: q.options.map((o, x) => ({
                              ...o,
                              isCorrect: q.type === "MULTIPLE_CHOICE" ? x === oi : x === oi ? !o.isCorrect : o.isCorrect,
                            })),
                          })
                        }
                        className="h-4 w-4 shrink-0 border-ink-300 text-brand-600 focus:ring-brand-500"
                        title="Mark as correct"
                      />
                      <Input
                        value={opt.text}
                        onChange={(e) =>
                          updateQuestion(q.key, {
                            options: q.options.map((o, x) => (x === oi ? { ...o, text: e.target.value } : o)),
                          })
                        }
                        placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                      />
                      <Button
                        variant="ghost"
                        size="iconSm"
                        className="text-ink-400"
                        onClick={() => updateQuestion(q.key, { options: q.options.filter((_, x) => x !== oi) })}
                        disabled={q.options.length <= 2}
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => updateQuestion(q.key, { options: [...q.options, { text: "", isCorrect: false }] })}>
                    <Plus className="h-3.5 w-3.5" /> Add option
                  </Button>
                </div>
              )}

              {q.type === "TRUE_FALSE" && (
                <Field label="Correct answer">
                  <Select value={/^true$/i.test(q.correctAnswer) ? "true" : "false"} onChange={(e) => updateQuestion(q.key, { correctAnswer: e.target.value })}>
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </Select>
                </Field>
              )}

              {(q.type === "FILL_BLANK" || q.type === "SHORT_ANSWER") && (
                <Field
                  label={q.type === "FILL_BLANK" ? "Correct answer * (separate variants with | or ;)" : "Expected answer (optional — leave blank for manual review)"}
                >
                  <Input value={q.correctAnswer} onChange={(e) => updateQuestion(q.key, { correctAnswer: e.target.value })} />
                </Field>
              )}

              {q.type === "MATCHING" && (
                <Field label='Correct pairs * (JSON, e.g. [{"left":"go","right":"bormoq"}])'>
                  <Textarea rows={2} className="font-mono text-xs" value={q.correctAnswer} onChange={(e) => updateQuestion(q.key, { correctAnswer: e.target.value })} placeholder='[{"left":"cat","right":"mushuk"}]' />
                </Field>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Topic tag">
                  <Input value={q.topic} onChange={(e) => updateQuestion(q.key, { topic: e.target.value })} placeholder="e.g. present-perfect" />
                </Field>
                <Field label="Explanation (shown in review)">
                  <Input value={q.explanation} onChange={(e) => updateQuestion(q.key, { explanation: e.target.value })} />
                </Field>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="sticky bottom-4 mt-5 flex justify-end gap-2">
        <Button
          onClick={() => {
            const err = validate();
            if (err) return toast.error(err);
            save.mutate();
          }}
          disabled={save.isPending || !dirty}
          className="shadow-lg"
        >
          <Save className="h-4 w-4" /> {save.isPending ? "Saving…" : isNew ? "Create test" : "Save changes"}
        </Button>
      </div>

      {!isNew && id && <AssignDialog testId={id} testTitle={meta.title} open={assignOpen} onOpenChange={setAssignOpen} />}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete test?"
        message="Questions and assignments will be removed."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          try {
            await api.del(`/tests/${id}`);
            toast.success("Test deleted");
            navigate("/tests");
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
    </>
  );
}
