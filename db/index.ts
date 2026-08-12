import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

declare global {
  // The worker sets the stable D1 binding before handing each request to Vinext.
  // The binding is deployment-scoped and identical across concurrent requests.
  var __ADVISOR_WORKSPACE_DB: D1Database | undefined;
}

export function getDb() {
  if (!globalThis.__ADVISOR_WORKSPACE_DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(globalThis.__ADVISOR_WORKSPACE_DB, { schema });
}
