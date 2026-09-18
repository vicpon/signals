// Ticker universe. Kept intentionally small for the first working pipeline —
// stock quotes, news, filings, and Jev calls all cost real request quota
// against free/rate-limited services. Extend toward the README's "top 100"
// by adding entries here; nothing else needs to change.
export const TICKERS = [
  { s: "NVDA", n: "NVIDIA", sec: "Semiconductors", a: "stock" },
  { s: "AAPL", n: "Apple", sec: "Consumer Tech", a: "stock" },
  { s: "TSLA", n: "Tesla", sec: "Automotive", a: "stock" },
  { s: "MSFT", n: "Microsoft", sec: "Software", a: "stock" },
  { s: "AMZN", n: "Amazon", sec: "E-commerce", a: "stock" },
  { s: "META", n: "Meta Platforms", sec: "Social / Ads", a: "stock" },
  { s: "GOOGL", n: "Alphabet", sec: "Internet", a: "stock" },
  { s: "AMD", n: "Advanced Micro Devices", sec: "Semiconductors", a: "stock" },
  { s: "COIN", n: "Coinbase Global", sec: "Crypto Exchange", a: "stock" },
  { s: "JPM", n: "JPMorgan Chase", sec: "Banking", a: "stock" },
  { s: "PLTR", n: "Palantir Technologies", sec: "Software", a: "stock" },
  { s: "BA", n: "Boeing", sec: "Aerospace", a: "stock" },
  { s: "BTC", n: "Bitcoin", sec: "Layer 1", a: "crypto", coingeckoId: "bitcoin" },
  { s: "ETH", n: "Ethereum", sec: "Layer 1", a: "crypto", coingeckoId: "ethereum" },
  { s: "SOL", n: "Solana", sec: "Layer 1", a: "crypto", coingeckoId: "solana" },
];

export const MAX_ARTICLES_PER_TICKER = 5;
export const MAX_FILINGS_PER_TICKER = 2;
export const FILING_LOOKBACK_DAYS = 14;
export const RELEVANT_FILING_FORMS = new Set(["8-K", "10-Q", "10-K", "4", "SC 13D", "SC 13G"]);

// Sequential per-ticker delay so the pipeline stays a good citizen of the
// free, keyless public endpoints it depends on (Yahoo Finance, CoinGecko,
// Google News, SEC EDGAR) instead of bursting them.
export const REQUEST_SPACING_MS = 350;

export const SEC_USER_AGENT =
  process.env.SEC_USER_AGENT || "signals-dashboard/0.1 (contact: set SEC_USER_AGENT in .env)";

export const TYPESAFE_API_KEY = process.env.TYPESAFE_API_KEY;

export const CACHE_PATH = new URL("../data/signals.json", import.meta.url);
