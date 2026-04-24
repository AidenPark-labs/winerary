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

      {/* monthly story — C-tone preview */}
      <section className="mb-6">
        <div
          className="relative rounded-[16px] p-5 overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #FFF5E6 0%, #FAD4C0 60%, #E8A98A 100%)",
          }}
        >
          <div className="flex items-baseline gap-2">
            <span className="text-3xl">🍷</span>
            <h2 className="text-2xl font-extrabold text-[var(--accent)] tracking-tight">
              {userProfile.nickname}의 {monthlyStats.month}
            </h2>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <StatTile label="잔" value={`${monthlyStats.totalGlasses}`} emphasis />
            <StatTile label="평균 ⭐" value={monthlyStats.avgRating.toFixed(1)} emphasis />
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-[var(--accent)]">
            <div className="flex items-center justify-between bg-white/50 rounded-[10px] px-3 py-2">
              <span className="font-medium">최애 품종</span>
              <span className="font-semibold">{monthlyStats.topGrape}</span>
            </div>
            <div className="flex items-center justify-between bg-white/50 rounded-[10px] px-3 py-2">
              <span className="font-medium">도장 깬 와인바</span>
              <span className="font-semibold">{monthlyStats.placesCount}곳</span>
            </div>
          </div>

          {/* red/white/sparkling ratio bar */}
          <div className="mt-4">
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

          <button className="mt-5 w-full h-11 rounded-[12px] bg-[var(--accent)] text-[var(--primary-on)] font-medium inline-flex items-center justify-center gap-2 hover:bg-[var(--primary-hover)]">
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
        <div className="rounded-[12px] bg-[var(--surface-raised)] border border-[var(--border)] overflow-hidden">
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

function StatTile({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="rounded-[12px] bg-white/60 px-3 py-4 text-center">
      <div className={`${emphasis ? "text-3xl" : "text-xl"} font-extrabold text-[var(--accent)] tabular-nums`}>
        {value}
      </div>
      <div className="mt-0.5 text-xs font-medium text-[var(--accent)]/80">{label}</div>
    </div>
  );
}

function NavTile({ icon, label, hint }: { icon: React.ReactNode; label: string; hint?: string }) {
  return (
    <button className="flex flex-col items-start gap-2 p-3 bg-[var(--surface-raised)] border border-[var(--border)] rounded-[12px] text-left hover:bg-[var(--surface-alt)]">
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
