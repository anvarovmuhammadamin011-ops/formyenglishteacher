import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Level, Skill } from "@/lib/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(firstName?: string, lastName?: string) {
  return `${(firstName ?? "").charAt(0)}${(lastName ?? "").charAt(0)}`.toUpperCase() || "?";
}

export function fmtDate(value?: string | Date | null, opts?: Intl.DateTimeFormatOptions) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", opts ?? { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(value?: string | Date | null) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtShort(value?: string | Date | null) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function fmtTimeAgo(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(d);
}

export function fmtDuration(seconds?: number | null) {
  if (seconds === null || seconds === undefined) return "—";
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

export function fmtCountdown(seconds: number | null) {
  if (seconds === null) return "--:--";
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export const LEVEL_LABEL: Record<Level, string> = {
  BEGINNER: "Beginner",
  ELEMENTARY: "Elementary",
  PRE_INTERMEDIATE: "Pre-Intermediate",
  INTERMEDIATE: "Intermediate",
  UPPER_INTERMEDIATE: "Upper-Intermediate",
  ADVANCED: "Advanced",
};

export const SKILL_LABEL: Record<Skill, string> = {
  GRAMMAR: "Grammar",
  VOCABULARY: "Vocabulary",
  READING: "Reading",
  LISTENING: "Listening",
  WRITING: "Writing",
};

export function scoreTone(pct: number | null | undefined) {
  if (pct === null || pct === undefined) return "text-ink-400";
  if (pct >= 80) return "text-success-600";
  if (pct >= 60) return "text-brand-600";
  if (pct >= 40) return "text-warning-500";
  return "text-danger-500";
}

export function barTone(pct: number | null | undefined) {
  if (pct === null || pct === undefined) return "bg-ink-300";
  if (pct >= 80) return "bg-success-500";
  if (pct >= 60) return "bg-brand-500";
  if (pct >= 40) return "bg-warning-500";
  return "bg-danger-500";
}

export const SKILL_ACCENT: Record<Skill, string> = {
  GRAMMAR: "bg-violet-100 text-violet-700",
  VOCABULARY: "bg-cyan-100 text-cyan-700",
  READING: "bg-emerald-100 text-emerald-700",
  LISTENING: "bg-amber-100 text-amber-700",
  WRITING: "bg-rose-100 text-rose-700",
};

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}
