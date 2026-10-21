// Native file output: share sheet or save into a user-selected folder (Storage Access Framework).
import { Directory, File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

export type Output = "share" | "save";

function cacheFile(name: string) {
  const f = new File(Paths.cache, name);
  if (f.exists) f.delete();
  f.create();
  return f;
}

async function deliver(file: File, name: string, mime: string, mode: Output): Promise<string> {
  if (mode === "share") {
    if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing is not available on this device");
    await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: name });
    return "Shared";
  }
  const dir = await Directory.pickDirectoryAsync();
  const out = dir.createFile(name, mime);
  out.write(await file.base64(), { encoding: "base64" });
  return `Saved ${name}`;
}

export async function outputBase64(name: string, base64: string, mime: string, mode: Output) {
  const f = cacheFile(name);
  f.write(base64, { encoding: "base64" });
  return deliver(f, name, mime, mode);
}

export async function outputText(name: string, text: string, mime: string, mode: Output) {
  const f = cacheFile(name);
  f.write(text);
  return deliver(f, name, mime, mode);
}

export async function outputPdf(name: string, html: string, mode: Output | "print") {
  if (mode === "print") {
    await Print.printAsync({ html });
    return "Sent to printer";
  }
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
  const tmp = new File(uri);
  const f = cacheFile(name);
  f.write(await tmp.base64(), { encoding: "base64" });
  tmp.delete();
  return deliver(f, name, "application/pdf", mode);
}

export async function readPickedFile(uri: string): Promise<{ base64: string; text: () => Promise<string> }> {
  const f = new File(uri);
  return { base64: await f.base64(), text: () => f.text() };
}
