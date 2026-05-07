/**
 * Translate a failed fetch response into a friendly toast message.
 *
 * The server's contract on errors is: JSON body with at least
 *   { error: string, code?: string, ...extra }
 * — see apiError() in src/lib/api-auth.ts and the per-endpoint extras like
 * { selectionCount } on OPTION_HAS_SELECTIONS or { currentUpdatedAt } on
 * OPTION_CONCURRENCY / PHASE_CONCURRENCY.
 *
 * This helper exists because raw `res.statusText` ("Internal Server Error")
 * is hostile, and bare `body.error` is sometimes a JSON-stringified Zod
 * issue dump that's also hostile. We translate to plain language, special-
 * casing the codes the panel actually surfaces.
 */
export interface ApiErrorPayload {
  error?: string;
  code?: string;
  selectionCount?: number;
  currentUpdatedAt?: string;
  // Zod's flatten() shape, when validation failed and the route forwarded it.
  fieldErrors?: Record<string, string[]>;
  formErrors?: string[];
}

export interface FriendlyError {
  /** Body of the toast — short, direct, no codes. */
  message: string;
  /** Stable machine code from the server, if any. Useful for code-driven UX. */
  code?: string;
  /** HTTP status. */
  status: number;
  /** Server-provided extras worth keeping (e.g. currentUpdatedAt for 409). */
  extras: ApiErrorPayload;
}

/**
 * Parse a Response into a FriendlyError. The Response body is read once.
 * Always resolves — never throws — so callers can use it from a catch block.
 *
 * `subject` is the user-facing thing being acted on (e.g. "Marriott option",
 * "phase settings"). It's used to build prefixes like "Couldn't update X:".
 * Callers can also override the produced message via the returned `message`.
 */
export async function parseApiError(
  res: Response,
  subject: string
): Promise<FriendlyError> {
  let body: ApiErrorPayload = {};
  try {
    body = (await res.json()) as ApiErrorPayload;
  } catch {
    // No JSON — fall through with empty body.
  }

  const code = body.code;
  const status = res.status;
  const prefix = `Couldn't update ${subject}`;

  // Code-driven cases first — these carry richer context than the HTTP status.
  if (code === "OPTION_CONCURRENCY" || code === "PHASE_CONCURRENCY") {
    return {
      status,
      code,
      extras: body,
      message: `${subject} was changed by someone else. Reloading to show the latest version — please re-apply your edit.`,
    };
  }
  if (code === "OPTION_HAS_SELECTIONS") {
    const n = body.selectionCount ?? 0;
    return {
      status,
      code,
      extras: body,
      message: `Can't delete: ${n} attendee${
        n === 1 ? " has" : "s have"
      } selected this option. Deactivate it instead.`,
    };
  }
  if (code === "MODULE_NOT_ENABLED") {
    return {
      status,
      code,
      extras: body,
      message: `${prefix}: the post-registration phases module is turned off for this event.`,
    };
  }
  if (code === "SELECTION_MODE_NOT_ALLOWED_ON_REGISTRATION_PHASE") {
    return {
      status,
      code,
      extras: body,
      message:
        "Selectable options can only be enabled on post-registration phases, not on the Registration phase itself.",
    };
  }
  if (code === "NOT_EVENT_MEMBER" || code === "INSUFFICIENT_EVENT_ROLE") {
    return {
      status,
      code,
      extras: body,
      message: `${prefix}: you don't have permission to edit this event.`,
    };
  }

  // HTTP status fallbacks — keep them concrete, not jargon.
  switch (status) {
    case 400: {
      // 400s typically carry a Zod flatten dump. Pick the first field error
      // we can find and surface it; otherwise generic "invalid input".
      const fieldErrors = body.fieldErrors ?? {};
      const firstField = Object.keys(fieldErrors)[0];
      if (firstField && fieldErrors[firstField]?.[0]) {
        return {
          status,
          code,
          extras: body,
          message: `${prefix}: ${firstField} — ${fieldErrors[firstField][0]}.`,
        };
      }
      return {
        status,
        code,
        extras: body,
        message: `${prefix}: ${body.error ?? "the input was invalid"}.`,
      };
    }
    case 401:
      return {
        status,
        code,
        extras: body,
        message: "Your session expired. Please log in again.",
      };
    case 403:
      return {
        status,
        code,
        extras: body,
        message: `${prefix}: you don't have permission.`,
      };
    case 404:
      return {
        status,
        code,
        extras: body,
        message: `${subject} couldn't be found — it may have been deleted in another tab.`,
      };
    case 409:
      return {
        status,
        code,
        extras: body,
        message: body.error ?? `${prefix}: the request conflicted with the current state.`,
      };
    case 429:
      return {
        status,
        code,
        extras: body,
        message: `${prefix}: too many requests. Wait a moment and try again.`,
      };
    case 500:
    case 502:
    case 503:
    case 504:
      return {
        status,
        code,
        extras: body,
        message: `${prefix}: the server hit an error. Please try again in a moment.`,
      };
    default:
      return {
        status,
        code,
        extras: body,
        message: body.error
          ? `${prefix}: ${body.error}`
          : `${prefix}: request failed (status ${status}).`,
      };
  }
}

/**
 * Convenience wrapper used by panel mutations. When the request fails, parses
 * the response and returns the FriendlyError. When it succeeds, returns the
 * parsed JSON. The caller distinguishes by checking `result.ok`.
 */
export type FetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: FriendlyError };

export async function fetchJson<T>(
  url: string,
  init: RequestInit,
  subject: string
): Promise<FetchResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    // Network failure (offline, DNS, connection reset). Fabricate a friendly
    // error rather than letting an opaque TypeError bubble up.
    return {
      ok: false,
      error: {
        status: 0,
        code: "NETWORK_ERROR",
        extras: {},
        message: `Couldn't reach the server. Check your connection and try again.`,
      },
    };
  }
  if (!res.ok) {
    return { ok: false, error: await parseApiError(res, subject) };
  }
  // 204 No Content has no body; tolerate that.
  if (res.status === 204) {
    return { ok: true, data: undefined as unknown as T };
  }
  try {
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      error: {
        status: res.status,
        code: "BAD_RESPONSE",
        extras: {},
        message: `${subject} saved, but the server response couldn't be read. Reload to confirm.`,
      },
    };
  }
}
