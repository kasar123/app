// Web preview persistence (browser storage). Native uses persist.ts.
import { storage } from "@/src/utils/storage";

const KEY = "txh_business_db";

export async function readDB(): Promise<string | null> {
  return storage.getItem<string | null>(KEY, null);
}

export async function writeDB(json: string): Promise<void> {
  const ok = await storage.setItem(KEY, json);
  if (!ok) throw new Error("Could not save data (storage full?)");
}

export async function writeSafetyCopy(json: string): Promise<void> {
  await storage.setItem(KEY + "_pre_restore", json);
}
