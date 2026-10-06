import { env, aiConfigured } from "../config/env";
import { ApiError } from "./errors";

export type AiUsage = {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
};

export type AiChatResult<T> = { result: T; usage: AiUsage };

const NOT_CONFIGURED =
  "AI generation is not configured on this server. Set AI_API_KEY (and optionally AI_BASE_URL / AI_MODEL) to enable it.";

export function assertAiConfigured() {
  if (!aiConfigured) throw new ApiError(503, NOT_CONFIGURED, "AI_NOT_CONFIGURED");
}

/** Pulls the first parsable JSON object/array out of a model response. */
function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const startObj = candidate.indexOf("{");
  const startArr = candidate.indexOf("[");
  let start = -1;
  if (startObj === -1) start = startArr;
  else if (startArr === -1) start = startObj;
  else start = Math.min(startObj, startArr);
  if (start === -1) throw new ApiError(502, "AI returned a response without JSON.", "AI_BAD_RESPONSE");
  const open = candidate[start];
  const close = open === "{" ? "}" : "]";
  const end = candidate.lastIndexOf(close);
  if (end <= start) throw new ApiError(502, "AI returned malformed JSON.", "AI_BAD_RESPONSE");
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new ApiError(502, "AI returned malformed JSON.", "AI_BAD_RESPONSE");
  }
}

/**
 * One-shot chat completion that must answer with JSON.
 * Works with any OpenAI-compatible endpoint (OpenAI, OpenRouter, Ollama, vLLM...).
 */
export async function chatJson<T = unknown>(opts: {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<AiChatResult<T>> {
  assertAiConfigured();

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 90_000);

  let response: Response;
  try {
    response = await fetch(`${env.AI_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.AI_MODEL,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        temperature: opts.temperature ?? env.AI_TEMPERATURE,
        max_tokens: opts.maxTokens ?? env.AI_MAX_TOKENS,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    const message =
      (err as Error).name === "AbortError"
        ? "AI request timed out. Please try again."
        : `AI provider is unreachable: ${(err as Error).message}`;
    throw new ApiError(502, message, "AI_UNREACHABLE");
  } finally {
    clearTimeout(timer);
  }

  const durationMs = Date.now() - started;

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const detail = body.slice(0, 400);
    if (response.status === 401 || response.status === 403) {
      throw new ApiError(502, "AI provider rejected the API key. Check AI_API_KEY.", "AI_AUTH");
    }
    throw new ApiError(response.status === 429 ? 429 : 502, `AI provider error (${response.status}): ${detail}`, "AI_ERROR");
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    model?: string;
  };
  const content = payload.choices?.[0]?.message?.content ?? "";
  if (!content) throw new ApiError(502, "AI returned an empty response.", "AI_BAD_RESPONSE");

  const usage: AiUsage = {
    provider: env.AI_PROVIDER,
    model: payload.model ?? env.AI_MODEL,
    promptTokens: payload.usage?.prompt_tokens ?? 0,
    completionTokens: payload.usage?.completion_tokens ?? 0,
    totalTokens: payload.usage?.total_tokens ?? 0,
    durationMs,
  };

  return { result: extractJson(content) as T, usage };
}
