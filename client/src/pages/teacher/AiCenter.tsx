import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, Wand2 } from "lucide-react";
import { api } from "@/lib/api";
import type { AiRequestRow, AiStatus, Level, Skill, TestDetail } from "@/lib/types";
import {
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
  PageLoader,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui";
import { LEVEL_LABEL, SKILL_LABEL, cn, fmtDateTime, fmtDuration, errorMessage } from "@/lib/utils";

const QUESTION_TYPES = [
  { value: "MULTIPLE_CHOICE", label: "Multiple choice" },
  { value: "TRUE_FALSE", label: "True / False" },
  { value: "FILL_BLANK", label: "Fill in the blank" },
  { value: "SHORT_ANSWER", label: "Short answer" },
] as const;

export default function AiCenterPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    topic: "",
    skill: "GRAMMAR" as Skill,
    level: "INTERMEDIATE" as Level,
    questionCount: "10",
    title: "",
    types: [] as string[],
  });

  const status = useQuery({
    queryKey: ["ai-status"],
    queryFn: () => api.get<AiStatus>("/ai/status"),
  });

  const requests = useQuery({
    queryKey: ["ai-requests"],
    queryFn: () => api.get<{ items: AiRequestRow[]; total: number }>("/ai/requests"),
  });

  const generate = useMutation({
    mutationFn: () =>
      api.post<TestDetail>("/ai/generate-test", {
        topic: form.topic.trim(),
        skill: form.skill,
        level: form.level,
        questionCount: Number(form.questionCount),
        ...(form.title.trim() ? { title: form.title.trim() } : {}),
        ...(form.types.length ? { types: form.types } : {}),
      }),
    onSuccess: (test) => {
      toast.success(`Test "${test.title}" generated`);
      qc.invalidateQueries({ queryKey: ["ai-requests"] });
      qc.invalidateQueries({ queryKey: ["tests"] });
      navigate(`/tests/${test.id}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const cfg = status.data;

  function toggleType(t: string) {
    setForm((f) => ({
      ...f,
      types: f.types.includes(t) ? f.types.filter((x) => x !== t) : [...f.types, t],
    }));
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-ink-900">
            <Sparkles className="h-5 w-5 text-indigo-500" /> AI Center
          </h1>
          <p className="mt-0.5 text-sm text-ink-500">Generate tests with AI and inspect previous requests.</p>
        </div>
        {cfg &&
          (cfg.configured ? (
            <Badge tone="green">
              {cfg.provider}
              {cfg.model ? ` · ${cfg.model}` : ""}
            </Badge>
          ) : (
            <Badge tone="amber">AI not configured — set AI_API_KEY in the server environment</Badge>
          ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Generate a test</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Topic *">
              <Input
                value={form.topic}
                onChange={(e) => setForm({ ...form, topic: e.target.value })}
                placeholder="e.g. phrasal verbs, present perfect, travel vocabulary"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Skill">
                <Select value={form.skill} onChange={(e) => setForm({ ...form, skill: e.target.value as Skill })}>
                  {(Object.keys(SKILL_LABEL) as Skill[]).map((s) => (
                    <option key={s} value={s}>
                      {SKILL_LABEL[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Level">
                <Select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value as Level })}>
                  {(Object.keys(LEVEL_LABEL) as Level[]).map((l) => (
                    <option key={l} value={l}>
                      {LEVEL_LABEL[l]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Questions (3–30)">
                <Input
                  type="number"
                  min={3}
                  max={30}
                  value={form.questionCount}
                  onChange={(e) => setForm({ ...form, questionCount: e.target.value })}
                />
              </Field>
              <Field label="Title (optional)">
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="auto from topic" />
              </Field>
            </div>
            <div>
              <Label>Question types (optional)</Label>
              <div className="flex flex-wrap gap-1.5">
                {QUESTION_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => toggleType(t.value)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                      form.types.includes(t.value)
                        ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                        : "border-ink-300 bg-white text-ink-500 hover:border-ink-400",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <Button
              className="w-full"
              disabled={generate.isPending || !cfg?.configured}
              onClick={() => {
                if (!form.topic.trim() || form.topic.trim().length < 2) return toast.error("Enter a topic (min 2 characters).");
                generate.mutate();
              }}
            >
              <Wand2 className="h-4 w-4" />
              {generate.isPending ? "Generating (10–40s)…" : "Generate test"}
            </Button>
            {!cfg?.configured && (
              <p className="text-xs text-warning-600">
                Add <code className="rounded bg-ink-100 px-1">AI_API_KEY=…</code> to <code className="rounded bg-ink-100 px-1">server/.env</code> and restart the API.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Request history</CardTitle>
            <span className="text-xs text-ink-400">{requests.data?.total ?? 0} total</span>
          </CardHeader>
          <CardContent className="p-0">
            {requests.isLoading ? (
              <PageLoader label="Loading requests…" />
            ) : (requests.data?.items.length ?? 0) === 0 ? (
              <div className="p-5">
                <EmptyState title="No AI requests yet" hint="Generated tests and analyses will appear here." />
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Type</TH>
                    <TH>Prompt</TH>
                    <TH>Status</TH>
                    <TH>Tokens</TH>
                    <TH>Time</TH>
                  </TR>
                </THead>
                <TBody>
                  {(requests.data?.items ?? []).map((r) => (
                    <TR key={r.id}>
                      <TD>
                        <Badge tone={r.type.includes("TEST") ? "indigo" : "sky"}>{r.type.replace(/_/g, " ").toLowerCase()}</Badge>
                      </TD>
                      <TD className="max-w-56">
                        <span className="block truncate text-xs" title={r.prompt ?? ""}>
                          {r.prompt ?? "—"}
                        </span>
                        {r.error && <span className="block truncate text-[10px] text-danger-500">{r.error}</span>}
                      </TD>
                      <TD>
                        <span
                          className={cn(
                            "text-xs font-medium",
                            r.status === "SUCCESS" ? "text-success-600" : r.status === "ERROR" || r.status === "FAILED" ? "text-danger-600" : "text-ink-500",
                          )}
                        >
                          {r.status.toLowerCase()}
                        </span>
                      </TD>
                      <TD className="text-xs text-ink-500">
                        {r.inputTokens ?? 0} in / {r.outputTokens ?? 0} out
                      </TD>
                      <TD className="text-xs text-ink-400">
                        <span>{fmtDateTime(r.createdAt)}</span>
                        {r.durationMs != null && <span className="ml-1">· {fmtDuration(Math.round(r.durationMs / 1000))}</span>}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
