import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Flame, Medal, Trophy } from "lucide-react";
import { api } from "@/lib/api";
import type { RankingRow } from "@/lib/types";
import { Avatar, Card, CardContent, EmptyState, PageHeader, PageLoader, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { cn, scoreTone } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

const PERIODS = [
  { value: "7d", label: "This week" },
  { value: "30d", label: "This month" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

export default function RankingsPage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState("30d");

  const { data, isLoading } = useQuery({
    queryKey: ["rankings", period],
    queryFn: () => api.get<RankingRow[]>(`/analytics/rankings`, { query: { period, limit: 50 } }),
  });

  if (isLoading) return <PageLoader label="Loading rankings…" />;

  const rows = data ?? [];
  const podium = rows.slice(0, 3);
  const myRow = rows.find((r) => r.userId === user?.id);

  return (
    <>
      <PageHeader
        title="Rankings"
        subtitle="Leaderboard by average score among active students."
        actions={
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-40">
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {[podium[1], podium[0], podium[2]].map((row, i) => {
          const place = row?.rank ?? 0;
          const medal =
            place === 1 ? "bg-amber-100 text-amber-700 ring-amber-300" : place === 2 ? "bg-ink-100 text-ink-600 ring-ink-300" : "bg-orange-100 text-orange-700 ring-orange-300";
          if (!row) return <Card key={i} className="hidden sm:block" />;
          return (
            <Card key={row.userId} className={cn("p-4 text-center", place === 1 && "ring-2 ring-amber-300/60")}>
              <div className={cn("mx-auto flex h-12 w-12 items-center justify-center rounded-full ring-1", medal)}>
                {place === 1 ? <Trophy className="h-5 w-5" /> : <Medal className="h-5 w-5" />}
              </div>
              <p className="mt-2 text-xs font-bold text-ink-400">#{place}</p>
              <div className="mt-1 flex justify-center">
                <Avatar src={row.avatarUrl} firstName={row.name.split(" ")[0]} lastName={row.name.split(" ")[1]} className="h-10 w-10 text-sm" />
              </div>
              <p className="mt-1.5 truncate text-sm font-semibold text-ink-900">{row.name}</p>
              <p className={cn("text-lg font-bold", scoreTone(row.averageScore))}>{row.averageScore}%</p>
              <p className="text-[10px] text-ink-500">
                {row.tests} tests · <Flame className="inline h-3 w-3 text-amber-500" /> {row.streak}d
              </p>
            </Card>
          );
        })}
      </div>

      {myRow && (
        <Card className="mb-4 border-brand-200 bg-brand-50/50 p-3">
          <p className="text-xs text-ink-600">
            Your position: <span className="font-bold text-brand-700">#{myRow.rank}</span> · {myRow.name} ·{" "}
            <span className="font-semibold">{myRow.averageScore}%</span> · {myRow.tests} tests
          </p>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No rankings yet" hint="Scores appear once students start submitting tests." />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="w-14">#</TH>
                  <TH>Student</TH>
                  <TH>Tests</TH>
                  <TH>Avg score</TH>
                  <TH>Streak</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.userId} className={cn(r.userId === user?.id && "bg-brand-50/60")}>
                    <TD className="font-bold text-ink-400">{r.rank}</TD>
                    <TD>
                      <span className="flex items-center gap-2.5">
                        <Avatar src={r.avatarUrl} firstName={r.name.split(" ")[0]} lastName={r.name.split(" ")[1]} />
                        <span>
                          <span className="block font-medium text-ink-900">{r.name}</span>
                          <span className="block text-[10px] text-ink-400">@{r.username}</span>
                        </span>
                      </span>
                    </TD>
                    <TD>{r.tests}</TD>
                    <TD>
                      <span className={cn("font-bold", scoreTone(r.averageScore))}>{r.averageScore}%</span>
                    </TD>
                    <TD>
                      <span className="inline-flex items-center gap-1 text-amber-600">
                        <Flame className="h-3.5 w-3.5" /> {r.streak}
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
