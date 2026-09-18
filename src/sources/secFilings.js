import { fetchJson } from "../lib/httpJson.js";
import {
  SEC_USER_AGENT,
  MAX_FILINGS_PER_TICKER,
  FILING_LOOKBACK_DAYS,
  RELEVANT_FILING_FORMS,
} from "../config.js";

const secHeaders = { "User-Agent": SEC_USER_AGENT, Accept: "application/json" };

let tickerCikMapPromise = null;

// SEC's official ticker->CIK map, refreshed periodically on their end.
// Cached in-process for the lifetime of one pipeline run.
function loadTickerCikMap() {
  if (!tickerCikMapPromise) {
    tickerCikMapPromise = fetchJson("https://www.sec.gov/files/company_tickers.json", {
      headers: secHeaders,
    }).then((data) => {
      const map = new Map();
      for (const entry of Object.values(data)) {
        map.set(String(entry.ticker).toUpperCase(), String(entry.cik_str).padStart(10, "0"));
      }
      return map;
    });
  }
  return tickerCikMapPromise;
}

export async function getRecentFilings(ticker) {
  const cikMap = await loadTickerCikMap();
  const cik = cikMap.get(ticker.toUpperCase());
  if (!cik) return [];

  const data = await fetchJson(`https://data.sec.gov/submissions/CIK${cik}.json`, {
    headers: secHeaders,
  });
  const recent = data?.filings?.recent;
  if (!recent) return [];

  const cutoff = Date.now() - FILING_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const filerName = data.name || ticker;
  const filings = [];
  for (let i = 0; i < recent.form.length && filings.length < MAX_FILINGS_PER_TICKER; i++) {
    const form = recent.form[i];
    const filedAt = new Date(recent.filingDate[i]);
    if (!RELEVANT_FILING_FORMS.has(form) || filedAt.getTime() < cutoff) continue;
    filings.push({
      headline: `${filerName} filed Form ${form}`,
      source: "SEC EDGAR",
      publishedAt: filedAt,
      isFiling: true,
      formType: form,
    });
  }
  return filings;
}
