// One-off migration: add an idempotency_key column + unique index to `orders`
// so order submissions can be retried safely without creating duplicate rows.
//
// Additive and backward-compatible: existing rows (and other tenants' apps that
// don't set a key) store NULL, and SQLite/libSQL treats NULLs as distinct in a
// UNIQUE index, so they never collide. Only real keys are deduplicated.
//
// Run from the project root:  node scripts/add-idempotency-key.mjs
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const url = env.TURSO_URL || env.VITE_TURSO_URL;
const authToken = env.TURSO_AUTH_TOKEN || env.VITE_TURSO_AUTH_TOKEN;
if (!url) throw new Error("Missing TURSO_URL / VITE_TURSO_URL in .env");

const db = createClient({ url, authToken });
console.log("DB:", url);

const cols = await db.execute("PRAGMA table_info(orders)");
const hasColumn = cols.rows.some((r) => r.name === "idempotency_key");
if (hasColumn) {
  console.log("• idempotency_key column already exists — skipping ALTER.");
} else {
  await db.execute("ALTER TABLE orders ADD COLUMN idempotency_key TEXT");
  console.log("• Added idempotency_key column.");
}

await db.execute(
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key ON orders(idempotency_key)",
);
console.log("• Ensured unique index idx_orders_idempotency_key.");

const idx = await db.execute("PRAGMA index_list(orders)");
console.log("Indexes now:", idx.rows.map((r) => r.name).join(", "));
console.log("Done.");
