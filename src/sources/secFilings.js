import { XMLParser } from "fast-xml-parser";
import { fetchJson, fetchText } from "../lib/httpJson.js";
import {
  SEC_USER_AGENT,
  MAX_FILINGS_PER_TICKER,
  FILING_LOOKBACK_DAYS,
  RELEVANT_FILING_FORMS,
} from "../config.js";

const secHeaders = { "User-Agent": SEC_USER_AGENT, Accept: "application/json" };
const xmlParser = new XMLParser({ ignoreAttributes: false });

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

const TRANSACTION_CODE_LABELS = {
  P: "open-market purchase",
  S: "open-market sale",
  A: "award/grant",
  M: "option exercise",
  G: "gift",
  F: "tax withholding",
  C: "conversion",
};

function asArray(value) {
  return Array.isArray(value) ? value : value != null ? [value] : [];
}

// Form 4s report insider trades; the submissions API only gives us "a Form
// 4 was filed", so we fetch the filing's own XML for the actual buy/sell
// detail — much sharper signal than the bare form type.
async function describeForm4(cikNumeric, accessionNumber, primaryDocument) {
  const accessionNoDashes = accessionNumber.replace(/-/g, "");
  // The primaryDocument path may point at an XSLT-rendering folder
  // (e.g. "xslF345X06/foo.xml"); the raw data file lives at the same name
  // directly under the accession folder.
  const fileName = primaryDocument.split("/").pop();
  const url = `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accessionNoDashes}/${fileName}`;
  const xml = await fetchText(url, { headers: secHeaders });
  const doc = xmlParser.parse(xml)?.ownershipDocument;
  if (!doc) return null;

  const ownerName = asArray(doc.reportingOwner)[0]?.reportingOwnerId?.rptOwnerName || "An insider";
  const relationship = asArray(doc.reportingOwner)[0]?.reportingOwnerRelationship;
  const title = Number(relationship?.isOfficer) === 1 ? relationship.officerTitle || "officer" : Number(relationship?.isDirector) === 1 ? "director" : "insider";

  const transactions = asArray(doc.nonDerivativeTable?.nonDerivativeTransaction);
  if (transactions.length === 0) return null;

  let acquired = 0;
  let disposed = 0;
  const codes = new Set();
  for (const t of transactions) {
    const shares = Number(t.transactionAmounts?.transactionShares?.value) || 0;
    const code = t.transactionAmounts?.transactionAcquiredDisposedCode?.value;
    const txnCode = t.transactionCoding?.transactionCode;
    if (txnCode) codes.add(TRANSACTION_CODE_LABELS[txnCode] || txnCode);
    if (code === "A") acquired += shares;
    else if (code === "D") disposed += shares;
  }

  const net = acquired - disposed;
  const direction = net > 0 ? `net acquired ${net.toLocaleString()} shares` : net < 0 ? `net disposed of ${Math.abs(net).toLocaleString()} shares` : "reported an offsetting transaction";
  const codeLabel = codes.size ? ` (${[...codes].join(", ")})` : "";

  return `${ownerName} (${title}) ${direction}${codeLabel}`;
}

export async function getRecentFilings(ticker) {
  const cikMap = await loadTickerCikMap();
  const cik = cikMap.get(ticker.toUpperCase());
  if (!cik) return [];
  const cikNumeric = String(Number(cik));

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

    let headline = `${filerName} filed Form ${form}`;
    if (form === "4") {
      try {
        const detail = await describeForm4(cikNumeric, recent.accessionNumber[i], recent.primaryDocument[i]);
        if (detail) headline = `${filerName} insider filing: ${detail}`;
      } catch (err) {
        console.warn(`[secFilings] Form 4 detail failed for ${ticker}: ${err.message}`);
      }
    }

    filings.push({ headline, source: "SEC EDGAR", publishedAt: filedAt, isFiling: true, formType: form });
  }
  return filings;
}
