import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookOpen, Check, Plus, Search, Volume2, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Level, Paginated, VocabularyStats, VocabularyWord } from "@/lib/types";
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
} from "@/components/ui";
import { LEVEL_LABEL, errorMessage } from "@/lib/utils";

const STATUS_TONE: Record<string, "green" | "amber" | "gray"> = {
  LEARNED: "green",
  LEARNING: "amber",
  NEW: "gray",
};

interface WordDraft {
  id?: string;
  word: string;
  uzbek: string;
  russian: string;
  example: string;
  pronunciation: string;
  category: string;
  level: Level;
}

const emptyDraft: WordDraft = { word: "", uzbek: "", russian: "", example: "", pronunciation: "", category: "", level: "INTERMEDIATE" };

export default function VocabularyPage() {
  const { user } = useAuth();
  const isTeacher = user?.role === "TEACHER";
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [practiceOn, setPracticeOn] = useState(false);
  const [draft, setDraft] = useState<WordDraft | null>(null);
  const [deleteFor, setDeleteFor] = useState<VocabularyWord | null>(null);

  const words = useQuery({
    queryKey: ["vocabulary", search, level, category, status, page],
    queryFn: () =>
      api.get<Paginated<VocabularyWord>>("/vocabulary", {
        query: { search, level, category, status, page, limit: 24 },
      }),
    placeholderData: (prev) => prev,
  });

  const stats = useQuery({
    queryKey: ["vocabulary-stats"],
    queryFn: () => api.get<VocabularyStats>("/vocabulary/stats"),
  });

  const categories = useQuery({
    queryKey: ["vocabulary-categories"],
    queryFn: () => api.get<Array<{ category: string; count: number }>>("/vocabulary/categories"),
  });

  const saveWord = useMutation({
    mutationFn: () => {
      const body = {
        word: draft!.word.trim(),
        uzbek: draft!.uzbek.trim(),
        russian: draft!.russian.trim() || undefined,
        example: draft!.example.trim() || undefined,
        pronunciation: draft!.pronunciation.trim() || undefined,
        category: draft!.category.trim() || undefined,
        level: draft!.level,
      };
      return draft!.id ? api.patch(`/vocabulary/${draft!.id}`, body) : api.post("/vocabulary", body);
    },
    onSuccess: () => {
      toast.success(draft?.id ? "Word updated" : "Word added");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["vocabulary"] });
      qc.invalidateQueries({ queryKey: ["vocabulary-stats"] });
      qc.invalidateQueries({ queryKey: ["vocabulary-categories"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const removeWord = useMutation({
    mutationFn: () => api.del(`/vocabulary/${deleteFor!.id}`),
    onSuccess: () => {
      toast.success("Word deleted");
      setDeleteFor(null);
      qc.invalidateQueries({ queryKey: ["vocabulary"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const practice = useMutation({
    mutationFn: ({ id, correct }: { id: string; correct: boolean }) => api.post(`/vocabulary/${id}/practice`, { correct }),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const items = words.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Vocabulary"
        subtitle={isTeacher ? "Your word bank — add words and track student mastery." : "Learn words, build your streak, master them all."}
        actions={
          isTeacher ? (
            <Button size="sm" onClick={() => setDraft({ ...emptyDraft })}>
              <Plus className="h-3.5 w-3.5" /> Add word
            </Button>
          ) : items.length > 0 ? (
            <Button size="sm" variant={practiceOn ? "secondary" : "default"} onClick={() => setPracticeOn((v) => !v)}>
              {practiceOn ? <X className="h-3.5 w-3.5" /> : <BookOpen className="h-3.5 w-3.5" />}
              {practiceOn ? "Exit practice" : "Practice"}
            </Button>
          ) : null
        }
      />

      {!isTeacher && stats.data && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="Words" value={stats.data.total} />
          <StatCard label="Learned" value={stats.data.learned} tone="green" />
          <StatCard label="Learning" value={stats.data.learning} tone="amber" />
          <StatCard label="New" value={stats.data.new} tone="ink" />
          <StatCard label="Accuracy" value={`${stats.data.accuracy}%`} tone="brand" />
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input placeholder="Search word or translation…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-8" />
        </div>
        <Select value={level} onChange={(e) => { setLevel(e.target.value); setPage(1); }} className="w-44">
          <option value="">All levels</option>
          {(Object.keys(LEVEL_LABEL) as Level[]).map((l) => (
            <option key={l} value={l}>
              {LEVEL_LABEL[l]}
            </option>
          ))}
        </Select>
        <Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className="w-40">
          <option value="">All categories</option>
          {(categories.data ?? []).map((c) => (
            <option key={c.category} value={c.category}>
              {c.category} ({c.count})
            </option>
          ))}
        </Select>
        {!isTeacher && (
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-36">
            <option value="">Any status</option>
            <option value="NEW">New</option>
            <option value="LEARNING">Learning</option>
            <option value="LEARNED">Learned</option>
          </Select>
        )}
      </div>

      {words.isLoading ? (
        <PageLoader label="Loading words…" />
      ) : items.length === 0 ? (
        <EmptyState title="No words found" hint={isTeacher ? "Add your first word to the bank." : "Try different filters."} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((w) => (
            <Card key={w.id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-bold text-ink-900">{w.word}</p>
                    {w.pronunciation && <p className="text-xs text-ink-400">/{w.pronunciation}/</p>}
                  </div>
                  <button
                    type="button"
                    title="Listen"
                    className="rounded-md p-1.5 text-ink-400 transition-colors hover:bg-brand-50 hover:text-brand-600"
                    onClick={() => {
                      if (!("speechSynthesis" in window)) return toast.error("Speech synthesis is not supported in this browser.");
                      const u = new SpeechSynthesisUtterance(w.word);
                      u.lang = "en-US";
                      window.speechSynthesis.cancel();
                      window.speechSynthesis.speak(u);
                    }}
                  >
                    <Volume2 className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-1.5 text-sm font-medium text-brand-700">{w.uzbek}</p>
                {w.russian && <p className="text-xs text-ink-500">{w.russian}</p>}
                {w.example && <p className="mt-2 rounded-md bg-ink-50 p-2 text-xs italic text-ink-500">“{w.example}”</p>}

                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                  {w.category && <Badge tone="sky">{w.category}</Badge>}
                  <Badge tone="gray">{LEVEL_LABEL[w.level]}</Badge>
                  {!isTeacher && <Badge tone={STATUS_TONE[w.status]}>{w.status.toLowerCase()}</Badge>}
                  {isTeacher && w.correctCount + w.wrongCount > 0 && (
                    <span className="text-[10px] text-ink-400">
                      ✓{w.correctCount} ✗{w.wrongCount}
                    </span>
                  )}
                </div>

                {isTeacher && (
                  <div className="mt-2 flex gap-2 border-t border-ink-100 pt-2">
                    <Button variant="ghost" size="sm" className="flex-1" onClick={() => setDraft({ id: w.id, word: w.word, uzbek: w.uzbek, russian: w.russian ?? "", example: w.example ?? "", pronunciation: w.pronunciation ?? "", category: w.category ?? "", level: w.level })}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" className="flex-1 text-danger-500" onClick={() => setDeleteFor(w)}>
                      Delete
                    </Button>
                  </div>
                )}

                {!isTeacher && practiceOn && (
                  <div className="mt-2 flex gap-2 border-t border-ink-100 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-danger-600"
                      disabled={practice.isPending}
                      onClick={() => practice.mutate({ id: w.id, correct: false })}
                    >
                      <X className="h-3.5 w-3.5" /> Didn't know
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-success-600"
                      disabled={practice.isPending}
                      onClick={() => practice.mutate({ id: w.id, correct: true })}
                    >
                      <Check className="h-3.5 w-3.5" /> Knew it
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(words.data?.pages ?? 1) > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-xs text-ink-500">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Prev
          </Button>
          <span>
            Page {page} of {words.data?.pages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= (words.data?.pages ?? 1)} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      <Modal
        open={Boolean(draft)}
        onOpenChange={(o) => !o && setDraft(null)}
        title={draft?.id ? "Edit word" : "Add word"}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={saveWord.isPending || !draft?.word.trim() || !draft?.uzbek.trim()}
              onClick={() => saveWord.mutate()}
            >
              {saveWord.isPending ? "Saving…" : "Save word"}
            </Button>
          </>
        }
      >
        {draft && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Word *">
              <Input value={draft.word} onChange={(e) => setDraft({ ...draft, word: e.target.value })} />
            </Field>
            <Field label="Uzbek *">
              <Input value={draft.uzbek} onChange={(e) => setDraft({ ...draft, uzbek: e.target.value })} />
            </Field>
            <Field label="Russian">
              <Input value={draft.russian} onChange={(e) => setDraft({ ...draft, russian: e.target.value })} />
            </Field>
            <Field label="Pronunciation">
              <Input value={draft.pronunciation} onChange={(e) => setDraft({ ...draft, pronunciation: e.target.value })} placeholder="ˈwɜːrd" />
            </Field>
            <Field label="Category">
              <Input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="e.g. travel" />
            </Field>
            <Field label="Level">
              <Select value={draft.level} onChange={(e) => setDraft({ ...draft, level: e.target.value as Level })}>
                {(Object.keys(LEVEL_LABEL) as Level[]).map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_LABEL[l]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Example sentence">
                <Input value={draft.example} onChange={(e) => setDraft({ ...draft, example: e.target.value })} />
              </Field>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteFor)}
        onOpenChange={(o) => !o && setDeleteFor(null)}
        title="Delete word?"
        message={`"${deleteFor?.word}" will be removed from the bank for everyone.`}
        confirmLabel="Delete"
        danger
        loading={removeWord.isPending}
        onConfirm={() => removeWord.mutate()}
      />
    </>
  );
}
