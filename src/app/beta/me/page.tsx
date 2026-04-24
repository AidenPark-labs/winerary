import Image from "next/image";
import Link from "next/link";
import { Map, BarChart3, Settings, ChevronRight, Share2 } from "lucide-react";
import { monthlyStats, userProfile } from "../_mock/profile";
import Button from "../_components/Button";

export default function MePage() {
  return (
    <div className="max-w-[640px] mx-auto px-3">
      {/* header profile */}
      <header className="pt-5 pb-4">
        <div className="flex items-center gap-3">
          <Image
            src={userProfile.avatar}
            alt=""
            width={56}
            height={56}
            className="rounded-full object-cover"
            unoptimized
          />
          <div className="flex-1 min-w-0">
            <div className="text-lg font-bold text-[var(--foreground)]">{userProfile.nickname}</div>
            <div className="text-xs text-[var(--text-muted)]">{userProfile.userCode}</div>
          </div>
          <Button variant="ghost" size="sm">
            다듬기
          </Button>
        </div>
        <p className="mt-3 text-sm text-[var(--text-muted)]">{userProfile.bio}</p>
      </header>

      {/* monthly story — isometric depth */}
      <section className="mb-6">
        <div
          className="relative rounded-[22px] p-6 overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #FFF9F0 0%, #FAD4C0 50%, #E8A98A 100%)",
            boxShadow:
              "0 12px 32px -8px rgba(232, 169, 138, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.6)",
            perspective: "1400px",
          }}
        >
          {/* decorative blur blob */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(122,27,46,0.25) 0%, transparent 70%)",
            }}
          />

          <div className="relative flex items-baseline gap-2 mb-6">
            <span className="text-3xl">🍷</span>
            <h2 className="text-2xl font-extrabold text-[var(--accent)] tracking-tight">
              {userProfile.nickname}의 {monthlyStats.month}
            </h2>
          </div>

          {/* Isometric stat blocks */}
          <div className="relative grid grid-cols-[1.3fr_1fr] gap-5 mb-6 pt-2 pb-3">
            <IsoBlock
              value={`${monthlyStats.totalGlasses}`}
              label="잔을 기울였어요"
              size="lg"
              tilt="left"
            />
            <IsoBlock
              value={monthlyStats.avgRating.toFixed(1)}
              label="평균 ⭐"
              size="md"
              tilt="right"
            />
          </div>

          {/* Info rows with subtle iso tilt */}
          <div className="relative grid grid-cols-1 gap-2.5 text-sm text-[var(--accent)] mb-5">
            <IsoInfoRow label="최애 품종" value={monthlyStats.topGrape} />
            <IsoInfoRow label="도장 깬 와인바" value={`${monthlyStats.placesCount}곳`} />
          </div>

          {/* ratio bar */}
          <div className="relative">
            <div className="flex text-xs font-medium text-[var(--accent)] mb-1.5 justify-between">
              <span>레드</span>
              <span>화이트</span>
              <span>스파클링</span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden bg-white/60">
              <div style={{ width: `${monthlyStats.ratioRed * 100}%` }} className="bg-[var(--accent)]" />
              <div style={{ width: `${monthlyStats.ratioWhite * 100}%` }} className="bg-[var(--accent-strong)]" />
              <div style={{ width: `${monthlyStats.ratioSparkling * 100}%` }} className="bg-[var(--accent-soft)]" />
            </div>
          </div>

          <button className="relative mt-5 w-full h-11 rounded-[12px] bg-[var(--accent)] text-[var(--primary-on)] font-medium inline-flex items-center justify-center gap-2 hover:bg-[var(--primary-hover)]">
            <Share2 size={16} />
            이번 달 이야기 나누기
          </button>
        </div>
      </section>

      {/* navigation tiles */}
      <section className="grid grid-cols-2 gap-3 mb-6">
        <NavTile icon={<Map size={20} />} label="내가 다녀간 자리" hint="4곳" />
        <NavTile icon={<BarChart3 size={20} />} label="지나온 한 잔들" hint="32잔" />
      </section>

      {/* settings */}
      <section className="mb-8">
        <div
          className="rounded-[14px] overflow-hidden"
          style={{
            background: "var(--gradient-card)",
            backdropFilter: "blur(20px) saturate(1.3)",
            WebkitBackdropFilter: "blur(20px) saturate(1.3)",
            border: "1px solid var(--glass-border)",
            boxShadow: "inset 0 1px 0 var(--glass-highlight)",
          }}
        >
          <SettingRow icon={<Settings size={18} />} label="설정" />
          <div className="border-t border-[var(--border)]" />
          <Link
            href="/diary"
            className="flex items-center justify-between px-3 py-3 hover:bg-[var(--surface-alt)]"
          >
            <span className="text-[15px]">기존 버전으로 돌아가기</span>
            <ChevronRight size={18} className="text-[var(--text-muted)]" />
          </Link>
          <div className="border-t border-[var(--border)]" />
          <SettingRow label="다음에 또 올게요" valueClass="text-[var(--text-muted)]" />
        </div>
      </section>
    </div>
  );
}

function IsoBlock({
  value,
  label,
  size = "md",
  tilt = "left",
}: {
  value: string;
  label: string;
  size?: "sm" | "md" | "lg";
  tilt?: "left" | "right";
}) {
  const fontSize = size === "lg" ? "text-[52px]" : size === "md" ? "text-[38px]" : "text-[28px]";
  const padding = size === "lg" ? "px-4 py-5" : "px-4 py-4";
  const rotY = tilt === "left" ? -9 : 9;
  const shadowLeft =
    "-3px 4px 0 rgba(122,27,46,0.14), -6px 8px 0 rgba(122,27,46,0.10), -9px 12px 0 rgba(122,27,46,0.05), 0 14px 24px -4px rgba(122,27,46,0.22), inset 0 1px 0 rgba(255,255,255,0.95)";
  const shadowRight =
    "3px 4px 0 rgba(122,27,46,0.14), 6px 8px 0 rgba(122,27,46,0.10), 9px 12px 0 rgba(122,27,46,0.05), 0 14px 24px -4px rgba(122,27,46,0.22), inset 0 1px 0 rgba(255,255,255,0.95)";
  return (
    <div
      className={`relative rounded-[14px] border ${padding} text-center`}
      style={{
        transform: `rotateX(10deg) rotateY(${rotY}deg)`,
        transformStyle: "preserve-3d",
        transformOrigin: "center",
        background: "rgba(255, 255, 255, 0.9)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        borderColor: "rgba(255, 255, 255, 0.95)",
        boxShadow: tilt === "left" ? shadowLeft : shadowRight,
      }}
    >
      <div className={`font-extrabold text-[var(--accent)] tabular-nums leading-none ${fontSize}`}>
        {value}
      </div>
      <div className="mt-1.5 text-[11px] font-medium text-[var(--accent)]/75">{label}</div>
    </div>
  );
}

function IsoInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-center justify-between rounded-[12px] px-3 py-2.5 border"
      style={{
        transform: "rotateX(6deg)",
        transformOrigin: "center top",
        background: "rgba(255, 255, 255, 0.72)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        borderColor: "rgba(255, 255, 255, 0.85)",
        boxShadow:
          "2px 3px 0 rgba(122,27,46,0.08), 4px 6px 0 rgba(122,27,46,0.04), 0 6px 14px rgba(232,169,138,0.2)",
      }}
    >
      <span className="font-medium">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function NavTile({ icon, label, hint }: { icon: React.ReactNode; label: string; hint?: string }) {
  return (
    <button
      className="flex flex-col items-start gap-2 p-3 rounded-[14px] text-left transition-all hover:brightness-105"
      style={{
        background: "var(--gradient-card)",
        backdropFilter: "blur(20px) saturate(1.3)",
        WebkitBackdropFilter: "blur(20px) saturate(1.3)",
        border: "1px solid var(--glass-border)",
        boxShadow: "inset 0 1px 0 var(--glass-highlight)",
      }}
    >
      <span className="text-[var(--accent)]">{icon}</span>
      <div>
        <div className="text-[15px] font-semibold">{label}</div>
        {hint ? <div className="text-xs text-[var(--text-muted)] mt-0.5">{hint}</div> : null}
      </div>
    </button>
  );
}

function SettingRow({
  icon,
  label,
  valueClass,
}: {
  icon?: React.ReactNode;
  label: string;
  valueClass?: string;
}) {
  return (
    <button className="w-full flex items-center gap-3 px-3 py-3 hover:bg-[var(--surface-alt)] text-left">
      {icon ? <span className="text-[var(--text-muted)]">{icon}</span> : null}
      <span className={`flex-1 text-[15px] ${valueClass ?? ""}`}>{label}</span>
      <ChevronRight size={18} className="text-[var(--text-muted)]" />
    </button>
  );
}
