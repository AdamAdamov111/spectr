/** SPECTR mark: a hexagonal prism splitting a signal into a spectrum — the metaphor from the passport (part 0). */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <path d="M16 2.5 28 9.25v13.5L16 29.5 4 22.75V9.25L16 2.5Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 16h7M15 16l8-5M15 16l8 5M15 16h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="16" r="1.6" fill="var(--sp-accent, #4c90f0)" />
    </svg>
  )
}
