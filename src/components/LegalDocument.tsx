"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

function parseMarkdown(md: string): string {
  return md
    // headings
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold text-zinc-200 mt-6 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold text-zinc-100 mt-8 mb-3">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-white mt-6 mb-4">$1</h1>')
    // horizontal rule
    .replace(/^---$/gm, '<hr class="border-white/5 my-6" />')
    // bold
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-zinc-200">$1</strong>')
    // blockquote
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-2 border-white/10 pl-4 text-zinc-500 text-sm my-2">$1</blockquote>')
    // unordered list
    .replace(/^- (.+)$/gm, '<li class="ml-4 text-sm text-zinc-400 list-disc">$1</li>')
    // ordered list
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 text-sm text-zinc-400 list-decimal"><span>$2</span></li>')
    // table (simple)
    .replace(/^\|(.+)\|$/gm, (_, row: string) => {
      const cells = row.split("|").map((c: string) => c.trim()).filter(Boolean);
      if (cells.every((c: string) => /^[-:]+$/.test(c))) return "";
      const tds = cells.map((c: string) => `<td class="px-3 py-2 text-sm text-zinc-400 border-b border-white/5">${c}</td>`).join("");
      return `<tr>${tds}</tr>`;
    })
    // paragraphs
    .replace(/^(?!<[a-z])((?!^\s*$).+)$/gm, (match) => {
      if (match.startsWith("<")) return match;
      return `<p class="text-sm text-zinc-400 leading-relaxed my-2">${match}</p>`;
    });
}

export function LegalDocument({ content }: { content: string }) {
  const router = useRouter();
  const html = parseMarkdown(content);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-2xl mx-auto px-5 py-4 flex items-center gap-3">
          <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/5 transition-colors">
            <ArrowLeft className="w-5 h-5 text-zinc-400" />
          </button>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-5 py-6 pb-24">
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </main>
    </div>
  );
}
