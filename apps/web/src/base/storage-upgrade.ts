/** Remove obsolete receipts without touching saved CV drafts or preferences. */
export function clearRetiredStorage(storage: Pick<Storage, 'length' | 'key' | 'removeItem'>) {
  try {
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i));
    for (const key of keys) {
      if (key && /^resumora:translation:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:/i.test(key)) storage.removeItem(key);
    }
  } catch { /* Storage privacy settings must not prevent sign-in or editing. */ }
}
