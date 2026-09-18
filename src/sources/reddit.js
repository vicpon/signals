import { fetchJson } from "../lib/httpJson.js";
import { REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USER_AGENT } from "../config.js";

export const REDDIT_ENABLED = Boolean(REDDIT_CLIENT_ID && REDDIT_CLIENT_SECRET);

let tokenPromise = null;
let tokenExpiresAt = 0;

// Reddit's read-only search is no longer usable anonymously (anonymous
// requests now get redirected to a login wall / 403). A free "script" app
// (reddit.com/prefs/apps) still gets read-only access via the standard
// OAuth2 client_credentials grant — no user account or password needed,
// just the app's client id/secret.
async function getAccessToken() {
  if (tokenPromise && Date.now() < tokenExpiresAt) return tokenPromise;

  const basicAuth = Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString("base64");
  tokenPromise = fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": REDDIT_USER_AGENT,
    },
    body: "grant_type=client_credentials",
  }).then(async (res) => {
    if (!res.ok) throw new Error(`Reddit auth failed: ${res.status} ${res.statusText}`);
    const data = await res.json();
    tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
    return data.access_token;
  });
  return tokenPromise;
}

// subreddit chosen per asset type: general equities discussion vs. crypto.
export async function getRedditPosts(query, assetType, limit) {
  if (!REDDIT_ENABLED) return [];

  const subreddit = assetType === "crypto" ? "CryptoCurrency" : "stocks";
  const token = await getAccessToken();
  const url =
    `https://oauth.reddit.com/r/${subreddit}/search` +
    `?q=${encodeURIComponent(query)}&restrict_sr=1&sort=new&t=week&limit=${limit}`;
  const data = await fetchJson(url, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": REDDIT_USER_AGENT },
  });

  const children = data?.data?.children ?? [];
  return children.map((c) => ({
    headline: c.data.title,
    source: `Reddit r/${subreddit}`,
    publishedAt: new Date(c.data.created_utc * 1000),
  }));
}
