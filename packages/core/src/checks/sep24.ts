import { z } from "zod";
import { enabledAssets, infoCheck } from "../info.js";

// Only the fields SEP-24 requires; anchors may add anything else.
const assetSchema = z.object({ enabled: z.boolean() });

export const sep24InfoSchema = z.object({
  deposit: z.record(z.string(), assetSchema),
  withdraw: z.record(z.string(), assetSchema),
  fee: z.object({ enabled: z.boolean() }).optional(),
  features: z.object({}).optional(),
});

export const sep24Info = infoCheck({
  id: "sep24.info",
  field: "TRANSFER_SERVER_SEP0024",
  schema: sep24InfoSchema,
  detail: (info) => ({ deposit: enabledAssets(info.deposit), withdraw: enabledAssets(info.withdraw) }),
});
