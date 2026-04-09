import fs from "fs/promises";
import path from "path";
import { LegalDocument } from "@/components/LegalDocument";

export const metadata = { title: "이용약관 | Winerary" };

export default async function TermsPage() {
  const content = await fs.readFile(path.join(process.cwd(), "public/terms-of-service.md"), "utf-8");
  return <LegalDocument content={content} />;
}
