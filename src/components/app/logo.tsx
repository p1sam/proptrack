export function Logo() {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight">
      <svg viewBox="0 0 24 24" className="size-5 text-primary" aria-hidden>
        <path d="M3 17l5-6 4 4 8-10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 21h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".45" />
      </svg>
      PropTrack
    </span>
  );
}
