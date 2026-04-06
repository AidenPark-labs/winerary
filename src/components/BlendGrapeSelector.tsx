"use client";

import { useState } from "react";
import { GRAPE_OPTIONS } from "@/lib/grapes";

const iCls = "w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 text-zinc-100 focus:outline-none focus:border-rose-600 transition-colors text-sm";

export default function BlendGrapeSelector({ grapes, onChange }: { grapes: string[]; onChange: (v: string[]) => void }) {
  const [selected, setSelected] = useState("");
  const [customInput, setCustomInput] = useState("");

  const available = GRAPE_OPTIONS.filter((g) => !grapes.includes(g));

  function handleAdd() {
    if (selected === "__custom__") {
      const v = customInput.trim();
      if (v && !grapes.includes(v)) { onChange([...grapes, v]); setCustomInput(""); setSelected(""); }
    } else if (selected && !grapes.includes(selected)) {
      onChange([...grapes, selected]);
      setSelected("");
    }
  }

  return (
    <div className="flex flex-col gap-2 mt-1">
      <div className="flex gap-2">
        <select value={selected} onChange={(e) => setSelected(e.target.value)} className={iCls + " flex-1"}>
          <option value="">품종 선택</option>
          {available.map((g) => <option key={g} value={g}>{g}</option>)}
          <option value="__custom__">직접입력</option>
        </select>
        <button type="button" onClick={handleAdd} disabled={!selected}
          className="px-4 py-3 rounded-xl bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-zinc-200 text-sm font-medium transition-colors whitespace-nowrap">추가</button>
      </div>
      {selected === "__custom__" && (
        <input value={customInput} onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
          placeholder="품종명 입력" className={iCls} />
      )}
      {grapes.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {grapes.map((g, i) => (
            <span key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-900/40 border border-rose-800/50 text-rose-200 text-sm">
              🍇 {g}
              <button type="button" onClick={() => onChange(grapes.filter((_, idx) => idx !== i))}
                className="text-rose-400 hover:text-rose-200 text-base leading-none">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
