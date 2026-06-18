/**
 * Small, consistent inline error/notice used across the app instead of bare
 * <p> tags or alert(). Amber accent on a faint surface, centred, with an
 * optional dismiss button. Matches the suite's gold/amber state language.
 */
export default function InlineError({
  children,
  onDismiss,
}: {
  children: React.ReactNode
  onDismiss?: () => void
}) {
  return (
    <div
      role="alert"
      className="flex items-center justify-center gap-2 rounded-xl border border-[#E07B39]/40 bg-[#E07B39]/10 px-4 py-3 text-sm text-[#E07B39] text-center"
    >
      <span className="leading-snug">{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Lukk"
          className="ml-1 shrink-0 text-[#E07B39]/70 hover:text-[#E07B39]"
        >
          ✕
        </button>
      )}
    </div>
  )
}
