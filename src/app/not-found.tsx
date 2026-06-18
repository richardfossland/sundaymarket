import Link from 'next/link'

// 404 — keep players oriented with a branded screen and a way back, in case a
// stale session link is opened.
export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="w-full max-w-sm space-y-5 animate-fade-in">
        <h1 className="text-2xl font-bold text-[#EBB84B]">SundayMarket</h1>
        <div className="text-5xl">🗺️</div>
        <h2 className="text-xl font-semibold text-[#F0EEE9]">Fant ikke siden</h2>
        <p className="text-[#8A9BB0] text-sm">
          Lenken kan være utløpt, eller spillet er avsluttet.
        </p>
        <Link
          href="/"
          className="inline-block bg-[#EBB84B] text-[#0D1B2A] font-bold px-6 py-3 rounded-xl"
        >
          Til forsiden
        </Link>
      </div>
    </main>
  )
}
