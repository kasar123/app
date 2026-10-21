// Native persistence: single JSON database file in the app's private document
// directory. Writes are atomic: write to a temp file, then move over the old one,
// so an interrupted write never corrupts the existing database.
import { Directory, File, Paths } from "expo-file-system";

const dir = () => new Directory(Paths.document, "txh");
const DB_NAME = "business-db.json";

function ensureDir() {
  const d = dir();
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

export async function readDB(): Promise<string | null> {
  const d = ensureDir();
  const f = new File(d, DB_NAME);
  if (f.exists) return f.text();
  // recover from an interrupted move
  const tmp = new File(d, DB_NAME + ".tmp");
  if (tmp.exists) return tmp.text();
  return null;
}

export async function writeDB(json: string): Promise<void> {
  const d = ensureDir();
  const tmp = new File(d, DB_NAME + ".tmp");
  if (tmp.exists) tmp.delete();
  tmp.create();
  tmp.write(json);
  const target = new File(d, DB_NAME);
  if (target.exists) target.delete();
  tmp.moveSync(target);
}

// Keeps a copy of the database before a restore so a bad restore can be undone.
export async function writeSafetyCopy(json: string): Promise<void> {
  const d = ensureDir();
  const f = new File(d, "pre-restore-copy.json");
  if (f.exists) f.delete();
  f.create();
  f.write(json);
}
