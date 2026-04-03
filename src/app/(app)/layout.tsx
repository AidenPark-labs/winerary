import BottomNav from "./BottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col flex-1 pb-20">
      {children}
      <BottomNav />
    </div>
  );
}
