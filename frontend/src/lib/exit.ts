import { BackHandler, Platform } from "react-native";

import { flushSave } from "@/src/db/store";

// Safe exit: persist everything, then finish the app's own activity/task.
// No process killing — Android manages the process lifecycle itself.
export async function safeExit(): Promise<"closed" | "unsupported" | "save-failed"> {
  const ok = await flushSave();
  if (!ok) return "save-failed";
  if (Platform.OS === "android") {
    BackHandler.exitApp();
    return "closed";
  }
  return "unsupported";
}
