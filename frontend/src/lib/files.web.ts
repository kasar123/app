// Web preview file output: browser download / print dialog.
import * as Print from "expo-print";

export type Output = "share" | "save";

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = (globalThis as any).document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function b64ToBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function outputBase64(name: string, base64: string, mime: string, _mode: Output) {
  download(name, new Blob([b64ToBytes(base64)], { type: mime }));
  return `Downloaded ${name}`;
}

export async function outputText(name: string, text: string, mime: string, _mode: Output) {
  download(name, new Blob([text], { type: mime }));
  return `Downloaded ${name}`;
}

export async function outputPdf(_name: string, html: string, _mode: Output | "print") {
  await Print.printAsync({ html });
  return "Opened print dialog (choose Save as PDF)";
}

export async function readPickedFile(uri: string): Promise<{ base64: string; text: () => Promise<string> }> {
  const blob = await (await fetch(uri)).blob();
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { base64: btoa(bin), text: () => blob.text() };
}
