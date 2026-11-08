export function exportFileName(
  name: string,
  company: string,
  role: string,
  ext: "pdf" | "docx",
): string {
  const base = [name, company, role]
    .map((part) => part
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_")
      .replace(/[^A-Za-z0-9_]/g, "")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, ""))
    .filter(Boolean)
    .join("_");

  return `${base || "CV"}.${ext}`;
}
