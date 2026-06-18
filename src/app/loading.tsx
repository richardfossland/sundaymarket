// Route-level loading fallback — a calm branded splash while a segment streams
// in, instead of a blank flash.
export default function Loading() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="text-4xl animate-pulse-gold">⚖️</div>
      <p className="text-[#8A9BB0] text-sm">Laster…</p>
    </main>
  )
}
