'use client'

// Route-level error boundary — a transient render/runtime error shows a
// friendly recovery screen instead of a blank, unrecoverable page.
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="w-full max-w-sm space-y-5 animate-fade-in">
        <h1 className="text-2xl font-bold text-[#EBB84B]">SundayMarket</h1>
        <div className="text-5xl">⚠️</div>
        <h2 className="text-xl font-semibold text-[#F0EEE9]">Noe gikk galt</h2>
        <p className="text-[#8A9BB0] text-sm">
          Prøv på nytt — framgangen din er trygt lagret på serveren.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => reset()}
            className="flex-1 bg-[#EBB84B] text-[#0D1B2A] font-bold py-3 rounded-xl"
          >
            Prøv igjen
          </button>
          <button
            onClick={() => { window.location.href = '/' }}
            className="flex-1 bg-[#1A2D42] border border-[#243D57] text-[#F0EEE9] font-semibold py-3 rounded-xl"
          >
            Til forsiden
          </button>
        </div>
      </div>
    </main>
  )
}
