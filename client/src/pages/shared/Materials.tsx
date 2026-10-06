import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookOpen, Headphones, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Level, MaterialDetail, MaterialListItem, Paginated } from "@/lib/types";
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
  Textarea,
} from "@/components/ui";
import { LEVEL_LABEL, cn, errorMessage, fmtDuration } from "@/lib/utils";

type Kind = "reading" | "listening";

interface MaterialDraft {
  id?: string;
  title: string;
  level: Level;
  topic: string;
  estimatedMinutes: string;
  status: "DRAFT" | "PUBLISHED";
  text: string;
  audioUrl: string;
  transcript: string;
}

const emptyDraft: MaterialDraft = {
  title: "",
  level: "INTERMEDIATE",
  topic: "",
  estimatedMinutes: "15",
  status: "DRAFT",
  text: "",
  audioUrl: "",
  transcript: "",
};

export default function MaterialsPage({ kind }: { kind: Kind }) {
  const { user } = useAuth();
  const isTeacher = user?.role === "TEACHER";
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("");
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<MaterialDraft | null>(null);
  const [deleteFor, setDeleteFor] = useState<MaterialListItem | null>(null);

  const materials = useQuery({
    queryKey: [kind, search, level, page],
    queryFn: () =>
      api.get<Paginated<MaterialListItem>>(`/${kind}`, { query: { search, level, page, limit: 12 } }),
    placeholderData: (prev) => prev,
  });

  const saveMaterial = useMutation({
    mutationFn: () => {
      const base = {
        title: draft!.title.trim(),
        level: draft!.level,
        topic: draft!.topic.trim() || undefined,
        estimatedMinutes: Number(draft!.estimatedMinutes) || 15,
        status: draft!.status,
        ...(kind === "reading"
          ? { text: draft!.text }
          : { audioUrl: draft!.audioUrl.trim(), transcript: draft!.transcript.trim() || undefined }),
      };
      return draft!.id ? api.patch(`/${kind}/${draft!.id}`, base) : api.post(`/${kind}`, base);
    },
    onSuccess: () => {
      toast.success(draft?.id ? "Material updated" : "Material created");
      setDraft(null);
      qc.invalidateQueries({ queryKey: [kind] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const removeMaterial = useMutation({
    mutationFn: () => api.del(`/${kind}/${deleteFor!.id}`),
    onSuccess: () => {
      toast.success("Material deleted");
      setDeleteFor(null);
      qc.invalidateQueries({ queryKey: [kind] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  async function openEdit(m: MaterialListItem) {
    try {
      const d = await api.get<MaterialDetail>(`/${kind}/${m.id}`);
      setDraft({
        id: d.id,
        title: d.title,
        level: d.level,
        topic: d.topic ?? "",
        estimatedMinutes: String(d.estimatedMinutes),
        status: d.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
        text: d.text ?? "",
        audioUrl: d.audioUrl ?? "",
        transcript: d.transcript ?? "",
      });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const items = materials.data?.items ?? [];
  const Icon = kind === "reading" ? BookOpen : Headphones;

  return (
    <>
      <PageHeader
        title={kind === "reading" ? "Reading" : "Listening"}
        subtitle={
          isTeacher
            ? "Manage texts and audio materials with comprehension questions."
            : "Read, listen and check your understanding."
        }
        actions={
          isTeacher ? (
            <Button size="sm" onClick={() => setDraft({ ...emptyDraft })}>
              <Plus className="h-3.5 w-3.5" /> New material
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input placeholder="Search title…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-8" />
        </div>
        <Select value={level} onChange={(e) => { setLevel(e.target.value); setPage(1); }} className="w-44">
          <option value="">All levels</option>
          {(Object.keys(LEVEL_LABEL) as Level[]).map((l) => (
            <option key={l} value={l}>
              {LEVEL_LABEL[l]}
            </option>
          ))}
        </Select>
      </div>

      {materials.isLoading ? (
        <PageLoader label="Loading materials…" />
      ) : items.length === 0 ? (
        <EmptyState
          title="No materials yet"
          hint={isTeacher ? "Create a text or audio exercise to get started." : "Nothing here yet — check back soon."}
          action={
            isTeacher ? (
              <Button size="sm" onClick={() => setDraft({ ...emptyDraft })}>
                <Plus className="h-3.5 w-3.5" /> New material
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((m) => (
            <Card key={m.id} className="group relative">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="rounded-lg bg-brand-50 p-2 text-brand-600">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="flex flex-wrap justify-end gap-1">
                    <Badge tone="gray">{LEVEL_LABEL[m.level]}</Badge>
                    {isTeacher && (
                      <Badge tone={m.status === "PUBLISHED" ? "green" : "amber"}>{m.status.toLowerCase()}</Badge>
                    )}
                  </div>
                </div>
                <Link
                  to={`/${kind}/${m.id}`}
                  className="mt-3 block text-sm font-semibold text-ink-900 hover:text-brand-600"
                >
                  {m.title}
                </Link>
                <p className="mt-0.5 text-xs text-ink-400">
                  {m.topic ?? "general"} · {m.questions} questions · ~{fmtDuration(m.estimatedMinutes * 60)}
                </p>

                <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-2.5 text-xs">
                  {!isTeacher ? (
                    <>
                      <span className="text-ink-500">{m.attempts} attempts</span>
                      {m.bestScore != null ? (
                        <span className={cn("font-bold", m.bestScore >= 60 ? "text-success-600" : "text-warning-600")}>
                          best {m.bestScore}%
                        </span>
                      ) : (
                        <span className="text-ink-400">not tried</span>
                      )}
                    </>
                  ) : (
                    <div className="flex w-full justify-end gap-1">
                      <Button variant="ghost" size="iconSm" title="Edit" onClick={() => openEdit(m)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="iconSm" className="text-danger-500" title="Delete" onClick={() => setDeleteFor(m)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(materials.data?.pages ?? 1) > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-xs text-ink-500">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Prev
          </Button>
          <span>
            Page {page} of {materials.data?.pages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= (materials.data?.pages ?? 1)} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      <Modal
        open={Boolean(draft)}
        onOpenChange={(o) => !o && setDraft(null)}
        wide
        title={draft?.id ? "Edit material" : `New ${kind} material`}
        description="Comprehension questions are added on the next step after creation."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={saveMaterial.isPending || !draft?.title.trim()}
              onClick={() => saveMaterial.mutate()}
            >
              {saveMaterial.isPending ? "Saving…" : draft?.id ? "Save changes" : "Create"}
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
            <Field label="Level">
              <Select value={draft.level} onChange={(e) => setDraft({ ...draft, level: e.target.value as Level })}>
                {(Object.keys(LEVEL_LABEL) as Level[]).map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_LABEL[l]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as "DRAFT" | "PUBLISHED" })}>
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
              </Select>
            </Field>
            <Field label="Topic">
              <Input value={draft.topic} onChange={(e) => setDraft({ ...draft, topic: e.target.value })} placeholder="e.g. environment" />
            </Field>
            <Field label="Estimated minutes">
              <Input type="number" min={1} max={120} value={draft.estimatedMinutes} onChange={(e) => setDraft({ ...draft, estimatedMinutes: e.target.value })} />
            </Field>

            {kind === "reading" ? (
              <div className="sm:col-span-2">
                <Field label="Text *">
                  <Textarea rows={8} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} placeholder="Paste the reading passage…" />
                </Field>
              </div>
            ) : (
              <>
                <div className="sm:col-span-2">
                  <Field label="Audio URL *">
                    <Input value={draft.audioUrl} onChange={(e) => setDraft({ ...draft, audioUrl: e.target.value })} placeholder="/uploads/audio/….mp3 or https://…" />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Transcript" hint="Shown to students after they attempt the material.">
                    <Textarea rows={5} value={draft.transcript} onChange={(e) => setDraft({ ...draft, transcript: e.target.value })} />
                  </Field>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteFor)}
        onOpenChange={(o) => !o && setDeleteFor(null)}
        title="Delete material?"
        message={`"${deleteFor?.title}" and its attempts will be removed.`}
        confirmLabel="Delete"
        danger
        loading={removeMaterial.isPending}
        onConfirm={() => removeMaterial.mutate()}
      />
    </>
  );
}
