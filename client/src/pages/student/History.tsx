import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AttemptHistoryItem, Paginated } from "@/lib/types";
import { Badge, Card, CardContent, EmptyState, PageHeader, PageLoader, Table, TBody, TD, TH, THead, TR, Tabs } from "@/components/ui";
import { SKILL_ACCENT, SKILL_LABEL, cn, fmtDuration, fmtShort, scoreTone } from "@/lib/utils";

export default function HistoryPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("finished");

  const { data, isLoading } = useQuery({
    queryKey: ["attempts", "mine", status],
    queryFn: () =>
      api.get<Paginated<AttemptHistoryItem>>("/attempts/mine", {
        query: { page: 1, limit: 20, status: status === "in-progress" ? "IN_PROGRESS" : undefined },
      }),
  });

  if (isLoading) return <PageLoader label="Loading history…" />;

  const items = data?.items ?? [];

  return (
    <>
      <PageHeader title="Attempt history" subtitle="Every test you've taken and how you scored." />
      <Tabs
        tabs={[
          { value: "finished", label: "Finished" },
          { value: "in-progress", label: "In progress" },
        ]}
        value={status}
        onChange={setStatus}
      />
      <Card className="mt-4">
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No attempts yet" hint="Take your first test from the My Tests page." />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Test</TH>
                  <TH>Group</TH>
                  <TH>Score</TH>
                  <TH>Duration</TH>
                  <TH>Date</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {items.map((a) => (
                  <TR key={a.id} className="cursor-pointer" onClick={() => navigate(a.status === "IN_PROGRESS" ? `/attempts/${a.id}` : `/results/${a.id}`)}>
                    <TD>
                      <span className="flex items-center gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SKILL_ACCENT[a.test.skill]}`}>
                          {SKILL_LABEL[a.test.skill]}
                        </span>
                        <span className="font-medium text-ink-900">{a.test.title}</span>
                      </span>
                    </TD>
                    <TD className="text-xs">{a.assignment?.group.name ?? "—"}</TD>
                    <TD>
                      {a.status === "IN_PROGRESS" ? (
                        <span className="text-ink-400">—</span>
                      ) : (
                        <span className={cn("font-bold", scoreTone(a.percentage))}>
                          {a.percentage}%{" "}
                          <span className="font-normal text-ink-400">
                            ({a.score}/{a.totalPoints})
                          </span>
                        </span>
                      )}
                    </TD>
                    <TD className="text-xs">{fmtDuration(a.durationSeconds)}</TD>
                    <TD className="text-xs">{fmtShort(a.submittedAt ?? a.startedAt)}</TD>
                    <TD>
                      {a.status === "IN_PROGRESS" ? (
                        <Badge tone="amber">In progress</Badge>
                      ) : a.status === "TIME_UP" ? (
                        <Badge tone="red">Time up</Badge>
                      ) : (
                        <Badge tone="green">Submitted</Badge>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <p className="mt-3 text-right text-xs text-ink-500">
        <Link to="/tests" className="text-brand-600 hover:underline">
          ← Back to my tests
        </Link>
      </p>
    </>
  );
}
