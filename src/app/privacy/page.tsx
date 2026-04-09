import fs from "fs/promises";
import path from "path";
import { LegalDocument } from "@/components/LegalDocument";

export const metadata = { title: "개인정보처리방침 | Winerary" };

export default async function PrivacyPage() {
  const content = await fs.readFile(path.join(process.cwd(), "public/privacy-policy.md"), "utf-8");
  return <LegalDocument content={content} />;
}
