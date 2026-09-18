import { fetchJson } from "../lib/httpJson.js";

// Free, keyless quote endpoints. Both are unofficial-but-widely-used public
// APIs (no API key, no paid tier) rather than a documented contract, so we
// read defensively and let a single bad ticker fail without the pipeline.

export async function getStockQuote(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
  const data = await fetchJson(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const result = data?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta || typeof meta.regularMarketPrice !== "number") {
    throw new Error(`No quote data for ${ticker}`);
  }
  const prevClose = meta.chartPreviousClose ?? meta.previousClose;
  const price = meta.regularMarketPrice;
  const changePct =
    typeof meta.regularMarketChangePercent === "number"
      ? meta.regularMarketChangePercent
      : prevClose
        ? ((price - prevClose) / prevClose) * 100
        : 0;
  return {
    price,
    changePct,
    name: meta.longName || meta.shortName || ticker,
  };
}

export async function getCryptoQuote(coingeckoId) {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coingeckoId)}&vs_currencies=usd&include_24hr_change=true`;
  const data = await fetchJson(url);
  const entry = data?.[coingeckoId];
  if (!entry || typeof entry.usd !== "number") {
    throw new Error(`No quote data for ${coingeckoId}`);
  }
  return {
    price: entry.usd,
    changePct: entry.usd_24h_change ?? 0,
  };
}
