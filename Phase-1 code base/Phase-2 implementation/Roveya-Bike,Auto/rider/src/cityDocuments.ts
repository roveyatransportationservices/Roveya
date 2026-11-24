export type DocumentPresence = Record<string, string | undefined>;

// Bike and auto approval requires both identity documents, plus the licence, RC, and profile photo.
export function cityDocumentsReady(docs: DocumentPresence) {
  return ["selfie", "dlFront", "dlBack", "rc", "aadhaar", "pan"].every((kind) => docs[kind] != null && docs[kind] !== "missing");
}
