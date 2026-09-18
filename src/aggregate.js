const SIG_WORD = { bull: "bullish", bear: "bearish", neu: "mixed" };

function timeAgo(date) {
  const ms = Date.now() - date.getTime();
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

// Combines per-article Jev judgments into one explainable per-ticker record.
// This is deterministic code, not another model call: TypeSafe's own
// guidance is to keep composition and thresholds in code so they stay
// reviewable and don't require re-running inference to retune.
export function aggregateTicker(tickerMeta, quote, judgedArticles) {
  const src = judgedArticles
    .slice()
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .map((a) => ({
      so: a.source,
      h: a.headline,
      t: timeAgo(a.publishedAt),
      tag: a.judgment.sentiment,
    }));

  if (judgedArticles.length === 0) {
    return {
      s: tickerMeta.s,
      n: quote.name || tickerMeta.n,
      sec: tickerMeta.sec,
      a: tickerMeta.a,
      p: quote.price,
      c: quote.changePct,
      sig: "neu",
      cv: 0,
      src: [],
      summary: "No recent coverage found for this ticker.",
    };
  }

  const weightedVotes = { bull: 0, bear: 0, neu: 0 };
  let convictionSum = 0;
  let convictionWeight = 0;
  let regulatoryFlag = false;

  for (const a of judgedArticles) {
    const { sentiment, sentimentConfidence, convictionScore, convictionConfidence, regulatoryProb } =
      a.judgment;
    weightedVotes[sentiment] += sentimentConfidence;
    convictionSum += (convictionScore / 2) * 100 * convictionConfidence;
    convictionWeight += convictionConfidence;
    if (regulatoryProb > 0.6) regulatoryFlag = true;
  }

  const sig = Object.entries(weightedVotes).sort((a, b) => b[1] - a[1])[0][0];
  const agreeCount = judgedArticles.filter((a) => a.judgment.sentiment === sig).length;
  const agreement = agreeCount / judgedArticles.length;
  const avgConviction = convictionWeight > 0 ? convictionSum / convictionWeight : 0;
  const cv = Math.max(0, Math.min(100, Math.round(avgConviction * agreement)));

  const anchor = judgedArticles
    .filter((a) => a.judgment.sentiment === sig)
    .sort((a, b) => b.judgment.sentimentConfidence - a.judgment.sentimentConfidence)[0];

  const bullCount = judgedArticles.filter((a) => a.judgment.sentiment === "bull").length;
  const bearCount = judgedArticles.filter((a) => a.judgment.sentiment === "bear").length;
  const neuCount = judgedArticles.filter((a) => a.judgment.sentiment === "neu").length;

  let summary =
    `Coverage leans ${SIG_WORD[sig]} (${agreeCount} of ${judgedArticles.length} sources), ` +
    `anchored by "${anchor.headline}" (${anchor.source}). ` +
    `${bullCount} bullish, ${neuCount} neutral, ${bearCount} bearish overall.`;
  if (regulatoryFlag) {
    summary += " At least one source flags possible regulatory or legal action.";
  }

  return {
    s: tickerMeta.s,
    n: quote.name || tickerMeta.n,
    sec: tickerMeta.sec,
    a: tickerMeta.a,
    p: quote.price,
    c: quote.changePct,
    sig,
    cv,
    src,
    summary,
    regulatoryFlag,
  };
}
