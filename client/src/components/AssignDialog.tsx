import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Level } from "@/lib/types";
import { Button, Field, Input, Modal, PageLoader } from "@/components/ui";
import { errorMessage } from "@/lib/utils";

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AssignDialog({
  testId,
  testTitle,
  open,
  onOpenChange,
}: {
  testId: string;
  testTitle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [startAt, setStartAt] = useState("");
  const [deadlineAt, setDeadlineAt] = useState("");
  const [duration, setDuration] = useState("15");
  const [maxAttempts, setMaxAttempts] = useState("2");

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    const in2days = new Date(now.getTime() + 2 * 24 * 3600 * 1000);
    setStartAt(toLocalInput(now));
    setDeadlineAt(toLocalInput(in2days));
    setGroupIds([]);
    setDuration("15");
    setMaxAttempts("2");
  }, [open, testId]);

  const groups = useQuery({
    queryKey: ["group-options"],
    queryFn: () => api.get<Array<{ id: string; name: string; level: Level; _count?: { members: number } }>>("/groups/options"),
    enabled: open,
  });

  const assign = useMutation({
    mutationFn: () =>
      api.post(`/tests/${testId}/assign`, {
        groupIds,
        startAt: new Date(startAt).toISOString(),
        deadlineAt: new Date(deadlineAt).toISOString(),
        durationSeconds: Number(duration) * 60,
        maxAttempts: Number(maxAttempts),
      }),
    onSuccess: () => {
      toast.success(`Assigned to ${groupIds.length} group${groupIds.length === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["tests"] });
      qc.invalidateQueries({ queryKey: ["assignments"] });
      qc.invalidateQueries({ queryKey: ["test-detail", testId] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Assign test"
      description={testTitle}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={groupIds.length === 0 || assign.isPending} onClick={() => assign.mutate()}>
            {assign.isPending ? "Assigning…" : `Assign to ${groupIds.length || ""} group(s)`}
          </Button>
        </>
      }
    >
      {groups.isLoading ? (
        <PageLoader />
      ) : (
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink-700">Groups *</p>
            <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-ink-200 p-2.5">
              {(groups.data ?? []).map((g) => (
                <label key={g.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1 text-sm hover:bg-ink-50">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                    checked={groupIds.includes(g.id)}
                    onChange={(e) =>
                      setGroupIds((prev) => (e.target.checked ? [...prev, g.id] : prev.filter((x) => x !== g.id)))
                    }
                  />
                  <span className="flex-1">{g.name}</span>
                  <span className="text-xs text-ink-400">{g._count?.members ?? "?"} students</span>
                </label>
              ))}
              {(groups.data ?? []).length === 0 && <p className="text-xs text-ink-500">No active groups.</p>}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Opens at *">
              <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            </Field>
            <Field label="Deadline *">
              <Input type="datetime-local" value={deadlineAt} onChange={(e) => setDeadlineAt(e.target.value)} />
            </Field>
            <Field label="Duration (minutes)">
              <Input type="number" min={1} max={240} value={duration} onChange={(e) => setDuration(e.target.value)} />
            </Field>
            <Field label="Max attempts">
              <Input type="number" min={1} max={10} value={maxAttempts} onChange={(e) => setMaxAttempts(e.target.value)} />
            </Field>
          </div>
        </div>
      )}
    </Modal>
  );
}
