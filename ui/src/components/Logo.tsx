/** SPECTR mark: a hexagonal prism splitting a signal into a spectrum — the metaphor from the passport (part 0). */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="spg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse"><stop stopColor="#22d3ee" /><stop offset="0.55" stopColor="#3b82f6" /><stop offset="1" stopColor="#8b5cf6" /></linearGradient>
      </defs>
      <path d="M16 2.5 28 9.25v13.5L16 29.5 4 22.75V9.25L16 2.5Z" stroke="url(#spg)" strokeWidth="1.6" fill="rgba(34,211,238,0.06)" />
      <path d="M9 16h6M15 16l7-4.5M15 16l7 4.5M15 16l7 0" stroke="url(#spg)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="9" cy="16" r="1.6" fill="#22d3ee" />
    </svg>
  )
}
