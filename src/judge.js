import { TypeSafeClient, choice, score, noul } from "@typesafe-ai/sdk";
import { TYPESAFE_API_KEY } from "./config.js";

if (!TYPESAFE_API_KEY) {
  throw new Error(
    "TYPESAFE_API_KEY is not set. Copy .env.example to .env and add your TypeSafe API key " +
      "(https://docs.typesafe.ai) — it is read from the environment and never committed to git.",
  );
}

// TypeSafeClient reads TYPESAFE_API_KEY from the environment itself; passing
// it explicitly here just makes the dependency visible at a glance.
const client = new TypeSafeClient({ apiKey: TYPESAFE_API_KEY });

const SENTIMENT = choice(
  "Considering `headline` about `ticker` (`company`), does this news suggest the stock or " +
    "asset's price is more likely to rise, fall, or stay roughly flat?",
  {
    bull: "The news is positive for the company or asset and likely to support a higher price.",
    bear: "The news is negative for the company or asset and likely to pressure the price lower.",
    neu: "The news is neutral, mixed, routine, or unlikely to move the price meaningfully either way.",
  },
);

const CONVICTION = score(
  "How significant and market-moving is `headline` about `ticker`, independent of whether it is " +
    "positive or negative?",
  [
    "Routine or minor news with little expected price impact.",
    "Notable news likely to draw investor attention but not decisive on its own.",
    "Major, market-moving news likely to have a significant, direct impact on the price.",
  ],
);

const REGULATORY = noul(
  "Does `headline` mention a regulatory action, government investigation, lawsuit, or enforcement " +
    "action affecting `ticker` (`company`)?",
);

// One `systemOne` call asks all three questions in parallel against the same
// article state — this is TypeSafe's recommended shape (independent
// questions batched per request) rather than three serial round trips.
export async function judgeArticle({ ticker, company, headline, source }) {
  const response = await client.systemOne({
    state: { ticker, company, headline, source },
    questions: { sentiment: SENTIMENT, conviction: CONVICTION, regulatory: REGULATORY },
  });
  const { sentiment, conviction, regulatory } = response.answers;
  return {
    sentiment: sentiment.choice,
    sentimentConfidence: sentiment.confidence,
    convictionScore: conviction.score, // 0..2
    convictionConfidence: conviction.confidence,
    regulatoryProb: regulatory.noul,
  };
}
