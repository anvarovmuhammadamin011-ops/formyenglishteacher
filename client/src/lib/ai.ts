import { loadDb, saveDb, nowIso, uid } from "@/lib/db";
import type { AiConfig, DbAiRequest } from "@/lib/types";
import { HttpError } from "@/lib/local/core";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiUsage = {
  promptTokens: number;
  completionTokens: number;
  model: string;
  durationMs: number;
};

const DEFAULT_CONFIG: AiConfig = {
  provider: "deepseek",
  apiKey: "",
  model: "deepseek-chat",
  baseUrl: "https://api.deepseek.com/v1",
  maxTokens: 4096,
  temperature: 0.7,
};

export function getAiConfig(): AiConfig {
  const db = loadDb();
  return { ...DEFAULT_CONFIG, ...db.aiConfig };
}

export function setAiConfig(patch: Partial<AiConfig>): AiConfig {
  const db = loadDb();
  db.aiConfig = { ...DEFAULT_CONFIG, ...db.aiConfig, ...patch };
  saveDb(db);
  return db.aiConfig;
}

export function isAiConfigured(): boolean {
  return getAiConfig().apiKey.trim().length > 0;
}

export function extractJson<T>(text: string): T {
  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  if (!raw.startsWith("{") && !raw.startsWith("[")) {
    const first = raw.search(/[{[]/);
    if (first >= 0) raw = raw.slice(first);
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1)) as T;
    }
    throw new HttpError(502, "AI returned invalid JSON", "AI_BAD_RESPONSE");
  }
}

export type ChatOptions = {
  messages: ChatMessage[];
  requestType?: string;
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
};

/** Calls the configured chat-completions provider directly from the browser. */
export async function chatRaw(options: ChatOptions): Promise<{ content: string; usage: AiUsage }> {
  const cfg = getAiConfig();
  if (!cfg.apiKey.trim()) {
    throw new HttpError(400, "AI kaliti kiritilmagan. Settings → AI bo'limidan DeepSeek kalitingizni kiriting.", "AI_NOT_CONFIGURED");
  }

  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const started = performance.now();
  const requestType = options.requestType ?? "CHAT";

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: options.messages,
        max_tokens: options.maxTokens ?? cfg.maxTokens,
        temperature: options.temperature ?? cfg.temperature,
        ...(options.json === false ? {} : { response_format: { type: "json_object" } }),
      }),
    });
  } catch (err) {
    const message =
      err instanceof Error && /failed|network|cors/i.test(err.message)
        ? "AI so'rovi bloklandi (CORS/tarmoq). Internet aloqasini tekshiring yoki VITE_API_URL orqali serverless AI proxysini yoqing."
        : "AI ga ulanib bo'lmadi.";
    logAiRequest({ requestType, prompt: options.messages.map((m) => m.content).join("\n"), status: "ERROR", error: message, durationMs: Math.round(performance.now() - started), model: cfg.model });
    throw new HttpError(502, message, "AI_UNAVAILABLE");
  }

  const durationMs = Math.round(performance.now() - started);

  if (!res.ok) {
    let detail = `AI xatosi (HTTP ${res.status})`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) detail = body.error.message;
    } catch {
      /* non-JSON body */
    }
    logAiRequest({ requestType, prompt: options.messages.map((m) => m.content).join("\n"), status: "ERROR", error: detail, durationMs, model: cfg.model });
    throw new HttpError(502, detail, "AI_ERROR");
  }

  const json = (await res.json()) as {
    model?: string;
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = json.choices?.[0]?.message?.content ?? "";
  const usage: AiUsage = {
    promptTokens: json.usage?.prompt_tokens ?? 0,
    completionTokens: json.usage?.completion_tokens ?? 0,
    model: json.model ?? cfg.model,
    durationMs,
  };

  logAiRequest({
    requestType,
    prompt: options.messages.map((m) => m.content).join("\n"),
    status: "SUCCESS",
    error: null,
    durationMs,
    model: usage.model,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
  });

  return { content, usage };
}

export async function chatJson<T>(options: ChatOptions): Promise<T> {
  const { content } = await chatRaw(options);
  return extractJson<T>(content);
}

function logAiRequest(entry: {
  requestType: string;
  prompt: string;
  status: "SUCCESS" | "ERROR";
  error: string | null;
  durationMs: number;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
}): void {
  const db = loadDb();
  const row: DbAiRequest = {
    id: uid("air"),
    userId: db.sessionUserId,
    type: entry.requestType,
    prompt: entry.prompt.slice(0, 2000),
    status: entry.status,
    model: entry.model,
    error: entry.error,
    durationMs: entry.durationMs,
    promptTokens: entry.promptTokens ?? 0,
    completionTokens: entry.completionTokens ?? 0,
    createdAt: nowIso(),
  };
  db.aiRequests.unshift(row);
  if (db.aiRequests.length > 200) db.aiRequests.length = 200;
  saveDb(db);
}
