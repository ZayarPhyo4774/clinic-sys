import { clearCache } from "@/offline/repositories/cache-repository";
import { clearOutbox } from "@/offline/outbox/outbox-repository";

export async function clearOfflineWork() {
  await Promise.all([clearCache(), clearOutbox()]);
}
