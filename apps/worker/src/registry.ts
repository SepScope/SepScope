import { readFile } from "node:fs/promises";
import { anchors, type Database } from "@sepscope/db";
import { sql } from "drizzle-orm";
import { z } from "zod";

// A bare, lowercase hostname: no scheme, port, path or trailing dot.
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export const registrySchema = z
  .array(
    z.object({
      domain: z.string().regex(HOSTNAME, "must be a bare lowercase hostname, e.g. anchor.example.com"),
      network: z.enum(["pubnet", "testnet"]),
      name: z.string().trim().min(1),
    }),
  )
  .superRefine((entries, ctx) => {
    const seen = new Set<string>();
    entries.forEach((e, i) => {
      if (seen.has(e.domain)) ctx.addIssue({ code: "custom", path: [i, "domain"], message: `duplicate domain ${e.domain}` });
      seen.add(e.domain);
    });
  });

export type RegistryEntry = z.infer<typeof registrySchema>[number];

export interface Anchor {
  id: number;
  domain: string;
}

export async function loadRegistry(path: string): Promise<RegistryEntry[]> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    throw new Error(`Could not read anchor registry ${path}: ${(err as Error).message}`);
  }
  const parsed = registrySchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new Error(`Invalid anchor registry ${path}: ${issues}`);
  }
  return parsed.data;
}

/**
 * Upserts the registry into `anchors` by domain and returns the rows to
 * schedule. Anchors removed from the registry keep their row and history but
 * are no longer checked.
 */
export async function syncAnchors(db: Database, entries: RegistryEntry[]): Promise<Anchor[]> {
  if (entries.length === 0) return [];
  return db
    .insert(anchors)
    .values(entries)
    .onConflictDoUpdate({
      target: anchors.domain,
      set: { network: sql`excluded.network`, name: sql`excluded.name` },
    })
    .returning({ id: anchors.id, domain: anchors.domain });
}
