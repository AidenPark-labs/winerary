export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-4xl">🍷</span>
          <h1 className="text-2xl font-bold mt-2">Winerary</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
