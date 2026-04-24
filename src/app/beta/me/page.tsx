import Image from "next/image";
import Link from "next/link";
import { Map, BarChart3, Settings, ChevronRight, Share2 } from "lucide-react";
import { monthlyStats, userProfile } from "../_mock/profile";
import Button from "../_components/Button";

export default function MePage() {
  return (
    <div className="max-w-[640px] mx-auto px-3">
      {/* header profile */}
      <header className="pt-6 pb-5">
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
            <div
              className="text-[19px] text-[var(--foreground)]"
              style={{ fontFamily: "var(--font-serif-ko)", fontWeight: 700, letterSpacing: "-0.01em" }}
            >
              {userProfile.nickname}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-0.5">{userProfile.userCode}</div>
          </div>
          <Button variant="ghost" size="sm">
            다듬기
          </Button>
        </div>
        <p className="mt-3 text-sm text-[var(--text-muted)]">{userProfile.bio}</p>
      </header>

      {/* monthly story */}
      <section className="mb-8">
        <div className="rounded-[14px] p-5 bg-[var(--surface-raised)] border border-[var(--border)]">
          <div className="flex items-baseline gap-2 mb-5">
            <h2
              className="text-[20px] text-[var(--foreground)]"
              style={{
                fontFamily: "var(--font-serif-ko)",
                fontWeight: 700,
                letterSpacing: "-0.01em",
              }}
            >
              {userProfile.nickname}의 {monthlyStats.month}
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatTile label="잔" value={`${monthlyStats.totalGlasses}`} />
            <StatTile label="평균 ⭐" value={monthlyStats.avgRating.toFixed(1)} />
          </div>

          <div className="mt-4 flex flex-col divide-y divide-[var(--border)] border border-[var(--border)] rounded-[10px] overflow-hidden">
            <InfoRow label="최애 품종" value={monthlyStats.topGrape} />
            <InfoRow label="도장 깬 와인바" value={`${monthlyStats.placesCount}곳`} />
          </div>

          {/* ratio bar */}
          <div className="mt-5">
            <div className="flex text-xs font-medium text-[var(--text-muted)] mb-1.5 justify-between">
              <span>레드</span>
              <span>화이트</span>
              <span>스파클링</span>
            </div>
            <div className="flex h-1.5 rounded-full overflow-hidden bg-[var(--surface-alt)]">
              <div style={{ width: `${monthlyStats.ratioRed * 100}%` }} className="bg-[var(--accent)]" />
              <div style={{ width: `${monthlyStats.ratioWhite * 100}%` }} className="bg-[var(--accent-strong)]" />
              <div style={{ width: `${monthlyStats.ratioSparkling * 100}%` }} className="bg-[var(--accent-soft)]" />
            </div>
          </div>

          <button className="mt-5 w-full h-11 rounded-[10px] bg-[var(--accent)] text-[var(--primary-on)] text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-[var(--primary-hover)] transition-colors">
            <Share2 size={15} />
            이번 달 이야기 나누기
          </button>
        </div>
      </section>

      {/* navigation tiles */}
      <section className="grid grid-cols-2 gap-3 mb-8">
        <NavTile icon={<Map size={20} />} label="내가 다녀간 자리" hint="4곳" />
        <NavTile icon={<BarChart3 size={20} />} label="지나온 한 잔들" hint="32잔" />
      </section>

      {/* settings */}
      <section className="mb-8">
        <div className="rounded-[12px] overflow-hidden bg-[var(--surface-raised)] border border-[var(--border)]">
          <SettingRow icon={<Settings size={18} />} label="설정" />
          <div className="border-t border-[var(--border)]" />
          <Link
            href="/diary"
            className="flex items-center justify-between px-3 py-3 hover:bg-[var(--surface-alt)] transition-colors"
          >
            <span className="text-[15px] text-[var(--foreground)]">기존 버전으로 돌아가기</span>
            <ChevronRight size={18} className="text-[var(--text-muted)]" />
          </Link>
          <div className="border-t border-[var(--border)]" />
          <SettingRow label="다음에 또 올게요" valueClass="text-[var(--text-muted)]" />
        </div>
      </section>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] px-3 py-4 text-center bg-[var(--surface-alt)] border border-[var(--border)]">
      <div
        className="text-[36px] text-[var(--accent)] tabular-nums leading-none"
        style={{ fontFamily: "var(--font-serif-ko)", fontWeight: 700 }}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[11px] font-medium text-[var(--text-muted)]">{label}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 text-sm bg-[var(--surface)]">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="text-[var(--foreground)] font-semibold">{value}</span>
    </div>
  );
}

function NavTile({ icon, label, hint }: { icon: React.ReactNode; label: string; hint?: string }) {
  return (
    <button className="flex flex-col items-start gap-2 p-3 rounded-[12px] text-left bg-[var(--surface-raised)] border border-[var(--border)] hover:bg-[var(--surface-alt)] transition-colors">
      <span className="text-[var(--accent)]">{icon}</span>
      <div>
        <div
          className="text-[15px] text-[var(--foreground)]"
          style={{ fontFamily: "var(--font-serif-ko)", fontWeight: 600 }}
        >
          {label}
        </div>
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
    <button className="w-full flex items-center gap-3 px-3 py-3 hover:bg-[var(--surface-alt)] text-left transition-colors">
      {icon ? <span className="text-[var(--text-muted)]">{icon}</span> : null}
      <span className={`flex-1 text-[15px] ${valueClass ?? "text-[var(--foreground)]"}`}>{label}</span>
      <ChevronRight size={18} className="text-[var(--text-muted)]" />
    </button>
  );
}
