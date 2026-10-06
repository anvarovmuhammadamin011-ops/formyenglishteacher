import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Skill } from "@/lib/types";
import { SKILL_LABEL, cn } from "@/lib/utils";

const tooltipStyle = {
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  fontSize: 12,
  boxShadow: "0 4px 14px rgba(15,23,42,.08)",
  color: "#0f172a",
};

export function TrendChart({
  data,
  height = 240,
  showScore = true,
}: {
  data: Array<{ date: string; attempts: number; averageScore?: number }>;
  height?: number;
  showScore?: boolean;
}) {
  const rows = data.map((d) => ({ ...d, label: d.date.slice(5) }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="attemptsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Area type="monotone" dataKey="attempts" name="Attempts" stroke="#6366f1" strokeWidth={2} fill="url(#attemptsFill)" />
        {showScore && (
          <Line type="monotone" dataKey="averageScore" name="Avg score %" stroke="#16a34a" strokeWidth={2} dot={false} />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function SkillBarChart({
  data,
  height = 240,
  horizontal = false,
}: {
  data: Array<{ skill: Skill; averageScore: number; attempts?: number }>;
  height?: number;
  horizontal?: boolean;
}) {
  const rows = data.map((d) => ({ name: SKILL_LABEL[d.skill], score: d.averageScore, attempts: d.attempts ?? 0 }));
  const palette = ["#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#f43f5e"];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 8, left: horizontal ? 8 : -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        {horizontal ? (
          <>
            <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} domain={[0, 100]} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={80} />
          </>
        ) : (
          <>
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} domain={[0, 100]} />
          </>
        )}
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f1f5f9" }} />
        <Bar dataKey="score" name="Avg score %" radius={[6, 6, 6, 6]} maxBarSize={46}>
          {rows.map((_, i) => (
            <Cell key={i} fill={palette[i % palette.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AttemptsScoreChart({
  data,
  height = 260,
}: {
  data: Array<{ date: string; attempts: number; averageScore: number }>;
  height?: number;
}) {
  const rows = data.map((d) => ({ label: d.date.slice(5), attempts: d.attempts, averageScore: d.averageScore }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="l" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="l" dataKey="attempts" name="Attempts" fill="#c7d2fe" radius={[4, 4, 0, 0]} maxBarSize={26} />
        <Line yAxisId="r" type="monotone" dataKey="averageScore" name="Avg score %" stroke="#4f46e5" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SkillRing({ value, label, className }: { value: number; label: string; className?: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const tone = value >= 80 ? "#16a34a" : value >= 60 ? "#4f46e5" : value >= 40 ? "#f59e0b" : "#ef4444";
  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <svg width="84" height="84" viewBox="0 0 84 84">
        <circle cx="42" cy="42" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle
          cx="42"
          cy="42"
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * c} ${c}`}
          transform="rotate(-90 42 42)"
        />
        <text x="42" y="46" textAnchor="middle" fontSize="16" fontWeight="700" fill="#0f172a">
          {Math.round(value)}%
        </text>
      </svg>
      <span className="text-xs font-medium text-ink-600">{label}</span>
    </div>
  );
}
