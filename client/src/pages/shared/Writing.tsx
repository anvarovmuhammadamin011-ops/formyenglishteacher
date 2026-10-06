import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Level, Paginated, WritingListItem } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import {
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Select,
  StatCard,
  Textarea,
} from "@/components/ui";
import { LEVEL_LABEL, errorMessage, fmtDate } from "@/lib/utils";

interface WritingDraft {
  id?: string;
  title: string;
  instructions: string;
  minWords: string;
  maxWords: string;
  level: Level;
  topic: string;
  dueAt: string;
  status: "DRAFT" | "PUBLISHED";
}

const emptyDraft: WritingDraft = {
  title: "",
  instructions: "",
  minWords: "100",
  maxWords: "300",
  level: "INTERMEDIATE",
  topic: "",
  dueAt: "",
  status: "DRAFT",
};

function toLocalInput(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function WritingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isTeacher = user?.role === "TEACHER";
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<WritingDraft | null>(null);
  const [deleteFor, setDeleteFor] = useState<WritingListItem | null>(null);

  const writings = useQuery({
    queryKey: ["writing", page],
    queryFn: () => api.get<Paginated<WritingListItem>>("/writing", { query: { page, limit: 12 } }),
    placeholderData: (prev) => prev,
  });

  const saveWriting = useMutation({
    mutationFn: () => {
      const body = {
        title: draft!.title.trim(),
        instructions: draft!.instructions.trim(),
        minWords: Number(draft!.minWords) || 100,
        maxWords: Number(draft!.maxWords) || 300,
        level: draft!.level,
        topic: draft!.topic.trim() || undefined,
        dueAt: draft!.dueAt ? new Date(draft!.dueAt).toISOString() : null,
        status: draft!.status,
      };
      return draft!.id ? api.patch(`/writing/${draft!.id}`, body) : api.post("/writing", body);
    },
    onSuccess: () => {
      toast.success(draft?.id ? "Writing task updated" : "Writing task created");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["writing"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const removeWriting = useMutation({
    mutationFn: () => api.del(`/writing/${deleteFor!.id}`),
    onSuccess: () => {
      toast.success("Deleted");
      setDeleteFor(null);
      qc.invalidateQueries({ queryKey: ["writing"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const items = writings.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Writing"
        subtitle={isTeacher ? "Assign essay tasks and grade submissions." : "Write essays, get feedback and improve."}
        actions={
          isTeacher ? (
            <Button size="sm" onClick={() => setDraft({ ...emptyDraft })}>
              <Plus className="h-3.5 w-3.5" /> New task
            </Button>
          ) : null
        }
      />

      {!isTeacher && items.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Tasks" value={items.length} />
          <StatCard label="Submitted" value={items.filter((x) => x.submitted).length} tone="green" />
          <StatCard label="Graded" value={items.filter((x) => x.myStatus === "GRADED").length} tone="brand" />
          <StatCard
            label="Avg score"
            value={
              (() => {
                const graded = items.filter((x) => x.myScore != null);
                return graded.length ? `${Math.round(graded.reduce((s, x) => s + (x.myScore ?? 0), 0) / graded.length)}/100` : "—";
              })()
            }
            tone="amber"
          />
        </div>
      )}

      {writings.isLoading ? (
        <PageLoader label="Loading tasks…" />
      ) : items.length === 0 ? (
        <EmptyState
          title="No writing tasks"
          hint={isTeacher ? "Create an essay prompt for your students." : "New tasks will appear here."}
          action={
            isTeacher ? (
              <Button size="sm" onClick={() => setDraft({ ...emptyDraft })}>
                <Plus className="h-3.5 w-3.5" /> New task
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((w) => (
            <Card key={w.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <span className="rounded-lg bg-brand-50 p-2.5 text-brand-600">
                  <FileText className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/writing/${w.id}`} className="text-sm font-semibold text-ink-900 hover:text-brand-600">
                      {w.title}
                    </Link>
                    <Badge tone="gray">{LEVEL_LABEL[w.level]}</Badge>
                    {isTeacher ? (
                      <Badge tone={w.status === "PUBLISHED" ? "green" : "amber"}>{w.status.toLowerCase()}</Badge>
                    ) : w.submitted ? (
                      <Badge tone={w.myStatus === "GRADED" ? "green" : "amber"}>
                        {w.myStatus === "GRADED" ? `graded · ${w.myScore}/100` : "submitted"}
                      </Badge>
                    ) : (
                      <Badge tone="sky">not started</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-xs text-ink-500">
                    {w.instructions}
                  </p>
                  <p className="mt-0.5 text-[10px] text-ink-400">
                    {w.minWords}–{w.maxWords} words
                    {w.dueAt && <> · due {fmtDate(w.dueAt)}</>}
                    {isTeacher && <> · {w.submissions} submissions</>}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {isTeacher && (
                    <>
                      <Button
                        variant="ghost"
                        size="iconSm"
                        title="Edit"
                        onClick={() =>
                          setDraft({
                            id: w.id,
                            title: w.title,
                            instructions: w.instructions,
                            minWords: String(w.minWords),
                            maxWords: String(w.maxWords),
                            level: w.level,
                            topic: w.topic ?? "",
                            dueAt: w.dueAt ? toLocalInput(w.dueAt) : "",
                            status: w.status,
                          })
                        }
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="iconSm" className="text-danger-500" title="Delete" onClick={() => setDeleteFor(w)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="outline" onClick={() => navigate(`/writing/${w.id}`)}>
                    {isTeacher ? "Open" : w.submitted ? "View" : "Start"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(writings.data?.pages ?? 1) > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-xs text-ink-500">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Prev
          </Button>
          <span>
            Page {page} of {writings.data?.pages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= (writings.data?.pages ?? 1)} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      <Modal
        open={Boolean(draft)}
        onOpenChange={(o) => !o && setDraft(null)}
        wide
        title={draft?.id ? "Edit writing task" : "New writing task"}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={saveWriting.isPending || !draft?.title.trim() || !draft?.instructions.trim()}
              onClick={() => saveWriting.mutate()}
            >
              {saveWriting.isPending ? "Saving…" : "Save task"}
            </Button>
          </>
        }
      >
        {draft && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Title *">
                <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Instructions *">
                <Textarea rows={3} value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} placeholder="Prompt, requirements, formatting notes…" />
              </Field>
            </div>
            <Field label="Level">
              <Select value={draft.level} onChange={(e) => setDraft({ ...draft, level: e.target.value as Level })}>
                {(Object.keys(LEVEL_LABEL) as Level[]).map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_LABEL[l]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Topic">
              <Input value={draft.topic} onChange={(e) => setDraft({ ...draft, topic: e.target.value })} />
            </Field>
            <Field label="Min words">
              <Input type="number" min={10} max={2000} value={draft.minWords} onChange={(e) => setDraft({ ...draft, minWords: e.target.value })} />
            </Field>
            <Field label="Max words">
              <Input type="number" min={50} max={5000} value={draft.maxWords} onChange={(e) => setDraft({ ...draft, maxWords: e.target.value })} />
            </Field>
            <Field label="Due date">
              <Input type="datetime-local" value={draft.dueAt} onChange={(e) => setDraft({ ...draft, dueAt: e.target.value })} />
            </Field>
            <Field label="Status">
              <Select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as "DRAFT" | "PUBLISHED" })}>
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
              </Select>
            </Field>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteFor)}
        onOpenChange={(o) => !o && setDeleteFor(null)}
        title="Delete writing task?"
        message={`"${deleteFor?.title}" and all submissions will be removed.`}
        confirmLabel="Delete"
        danger
        loading={removeWriting.isPending}
        onConfirm={() => removeWriting.mutate()}
      />
    </>
  );
}
