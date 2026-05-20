/**
 * Translation service — thin wrapper around MyMemory's free translation API.
 *
 * MyMemory exposes a per-string GET endpoint only; there's no batch endpoint,
 * so multi-string calls fan out and we collect results with Promise.allSettled.
 * One bad string never breaks the rest of the batch.
 *
 * Quota:
 *   - Anonymous: 5,000 chars/day.
 *   - With `de=<email>` param: 50,000 chars/day (the email is just a quota
 *     identifier — MyMemory doesn't verify it).
 *   - We read MYMEMORY_EMAIL from the environment; if it's missing we fall back
 *     to anonymous mode rather than failing.
 *
 * Confidence:
 *   - MyMemory's `match` field is the model's self-reported confidence.
 *   - It comes back inconsistently as 0–1 (e.g. 0.85) or 0–100 (e.g. 85);
 *     normalised here.
 *   - <0.4 → `low_confidence`. The translated text is still returned (admins
 *     can use it as a starting point) but flagged so the UI shows a warning.
 *   - When MyMemory has no match it sometimes echoes the input back verbatim
 *     as the "translation" — we treat that as low_confidence with matchScore 0.
 *
 * No SDK; no caching. All network failures are captured per-string.
 */

export type Lang = "en" | "ar";

export type TranslateResult =
  | { status: "ok"; translatedText: string; matchScore: number }
  | { status: "low_confidence"; translatedText: string; matchScore: number }
  | { status: "error"; error: string };

const MYMEMORY_URL = "https://api.mymemory.translated.net/get";
const REQUEST_TIMEOUT_MS = 8_000;
const LOW_CONFIDENCE_THRESHOLD = 0.4;

interface MyMemoryResponse {
  responseData?: {
    translatedText?: string;
    match?: number;
  };
  responseStatus?: number;
  responseDetails?: string;
}

async function translateOne(
  text: string,
  from: Lang,
  to: Lang
): Promise<TranslateResult> {
  const trimmed = text.trim();
  if (trimmed === "") {
    return { status: "error", error: "Empty input" };
  }

  const url = new URL(MYMEMORY_URL);
  url.searchParams.set("q", trimmed);
  url.searchParams.set("langpair", `${from}|${to}`);
  if (process.env.MYMEMORY_EMAIL) {
    url.searchParams.set("de", process.env.MYMEMORY_EMAIL);
  }

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "TimeoutError"
          ? "Translation request timed out"
          : err.message
        : "Unknown network error";
    return { status: "error", error: message };
  }

  if (!res.ok) {
    return { status: "error", error: `HTTP ${res.status}` };
  }

  let json: MyMemoryResponse;
  try {
    json = (await res.json()) as MyMemoryResponse;
  } catch {
    return { status: "error", error: "Malformed response from MyMemory" };
  }

  // MyMemory signals quota exhaustion either via responseStatus=429 or via a
  // quota-related message in responseDetails. Surface both as the same UI copy.
  if (json.responseStatus === 429) {
    return { status: "error", error: "Daily translation quota reached" };
  }
  if (
    typeof json.responseDetails === "string" &&
    /quota|limit/i.test(json.responseDetails) &&
    /exceeded|reached/i.test(json.responseDetails)
  ) {
    return { status: "error", error: "Daily translation quota reached" };
  }

  const translated = json.responseData?.translatedText;
  if (!translated || typeof translated !== "string") {
    return { status: "error", error: "No translation returned" };
  }

  const matchRaw = json.responseData?.match ?? 0;
  const matchScore = matchRaw > 1 ? matchRaw / 100 : matchRaw;

  // MyMemory's "no match" fallback is to echo the input back. Treat as low-
  // confidence so the UI flags it for review rather than silently accepting.
  if (translated.trim().toLowerCase() === trimmed.toLowerCase()) {
    return { status: "low_confidence", translatedText: translated, matchScore: 0 };
  }

  if (matchScore < LOW_CONFIDENCE_THRESHOLD) {
    return {
      status: "low_confidence",
      translatedText: translated,
      matchScore,
    };
  }

  return { status: "ok", translatedText: translated, matchScore };
}

export interface TranslateBatchInput {
  strings: string[];
  from: Lang;
  to: Lang;
}

/**
 * Translate a batch of strings in parallel. One failure does not affect the
 * rest — every input produces exactly one result in the same order.
 */
export async function translate({
  strings,
  from,
  to,
}: TranslateBatchInput): Promise<TranslateResult[]> {
  if (from === to) {
    // Defensive: callers shouldn't ask for en→en, but if they do we just
    // echo each string back as low-confidence rather than billing the API.
    return strings.map((s) => ({
      status: "low_confidence" as const,
      translatedText: s,
      matchScore: 0,
    }));
  }

  const settled = await Promise.allSettled(
    strings.map((s) => translateOne(s, from, to))
  );

  return settled.map((result) => {
    if (result.status === "fulfilled") return result.value;
    const message =
      result.reason instanceof Error ? result.reason.message : "Unknown error";
    return { status: "error" as const, error: message };
  });
}
