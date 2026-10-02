import { z } from "zod";
import { infoCheck } from "../info.js";

// SEP-38 Asset Identification Format: stellar:native, stellar:CODE:ISSUER, or iso4217:CODE.
const ASSET_ID = /^(stellar:native|stellar:[A-Za-z0-9]{1,12}:G[A-Z2-7]{55}|iso4217:[A-Z]{3})$/;

export const sep38InfoSchema = z.object({
  assets: z.array(z.object({ asset: z.string().regex(ASSET_ID, "is not a SEP-38 asset identifier") })),
});

export const sep38Info = infoCheck({
  id: "sep38.info",
  field: "ANCHOR_QUOTE_SERVER",
  schema: sep38InfoSchema,
  detail: (info) => ({ assets: info.assets.map((a) => a.asset) }),
});
