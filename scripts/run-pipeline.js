import { runPipeline } from "../src/pipeline.js";

runPipeline()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[pipeline] Fatal:", err.message);
    process.exit(1);
  });
