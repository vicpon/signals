const DEFAULT_TIMEOUT_MS = 10_000;

// Shared fetch wrapper: enforces a timeout (public APIs occasionally hang
// rather than error) and surfaces non-2xx responses as errors with the
// status attached, so callers can decide whether to skip a single ticker
// instead of crashing the whole pipeline run.
export async function fetchText(url, { headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS, method = "GET", body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal, method, body });
    if (!res.ok) {
      const err = new Error(`${res.status} ${res.statusText} for ${url}`);
      err.status = res.status;
      throw err;
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url, opts) {
  const text = await fetchText(url, opts);
  return JSON.parse(text);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
