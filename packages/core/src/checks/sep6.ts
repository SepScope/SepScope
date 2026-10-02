import { z } from "zod";
import { enabledAssets, infoCheck } from "../info.js";

// Only the fields SEP-6 requires; anchors may add anything else.
const assetSchema = z.object({ enabled: z.boolean() });

export const sep6InfoSchema = z.object({
  deposit: z.record(z.string(), assetSchema),
  withdraw: z.record(z.string(), assetSchema),
  "deposit-exchange": z.record(z.string(), assetSchema).optional(),
  "withdraw-exchange": z.record(z.string(), assetSchema).optional(),
});

export const sep6Info = infoCheck({
  id: "sep6.info",
  field: "TRANSFER_SERVER",
  schema: sep6InfoSchema,
  detail: (info) => ({ deposit: enabledAssets(info.deposit), withdraw: enabledAssets(info.withdraw) }),
});
