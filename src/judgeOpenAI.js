import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { OPENAI_API_KEY, OPENAI_MODEL } from "./config.js";

// Optional comparison engine — see config.js. Unlike judge.js (TypeSafe),
// this does NOT throw at import time when unconfigured: it's meant to be
// skippable, not required.
export const OPENAI_ENABLED = Boolean(OPENAI_API_KEY);

const client = OPENAI_ENABLED ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// Mirrors judge.js's three questions as closely as a single structured-output
// schema allows, for a fair side-by-side comparison. The methodology is NOT
// equivalent, though, and that difference matters for reading the demo:
// TypeSafe's Choice/Score return a full probability distribution computed by
// a model architected to produce calibrated judgments. Here, a general chat
// model is asked to self-report a confidence number alongside its answer —
// an introspective guess, not a distribution. Treat OpenAI's "confidence"
// fields as a much weaker signal than Jev's.
const JudgmentSchema = z.object({
  sentiment: z.enum(["bull", "bear", "neu"]),
  sentiment_confidence: z.number().min(0).max(1),
  conviction_level: z.number().int().min(0).max(2),
  conviction_confidence: z.number().min(0).max(1),
  regulatory_probability: z.number().min(0).max(1),
});

const SYSTEM_PROMPT = `You judge a single financial news headline about a stock or crypto asset. Answer three things:

1. sentiment: does this headline suggest the asset's price is more likely to rise (bull), fall (bear), or stay roughly flat (neu)?
2. conviction_level: how significant and market-moving is this headline, independent of direction?
   0 = routine or minor news with little expected price impact
   1 = notable news likely to draw investor attention but not decisive on its own
   2 = major, market-moving news likely to have a significant, direct impact on the price
3. regulatory_probability: probability (0 to 1) that this headline mentions a regulatory action, government investigation, lawsuit, or enforcement action affecting the company.

Also self-report your own confidence (0 to 1) in the sentiment call and in the conviction call. Be honest about uncertainty — do not default to 1.0.`;

export async function judgeArticleOpenAI({ ticker, company, headline, source }) {
  if (!OPENAI_ENABLED) {
    throw new Error("OpenAI comparison is not configured (OPENAI_API_KEY unset)");
  }
  const response = await client.responses.parse({
    model: OPENAI_MODEL,
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify({ ticker, company, headline, source }) },
    ],
    text: { format: zodTextFormat(JudgmentSchema, "article_judgment") },
  });

  const p = response.output_parsed;
  return {
    sentiment: p.sentiment,
    sentimentConfidence: p.sentiment_confidence,
    convictionScore: p.conviction_level, // 0..2, same scale as Jev's Score
    convictionConfidence: p.conviction_confidence,
    regulatoryProb: p.regulatory_probability,
  };
}
