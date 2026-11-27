/** Il simbolo dei dollalerci: maialino e doppia barretta, disegnati solo a contorno. */
export function Dollalercio({ size = 20, title = 'Dollalerci' }: { size?: number; title?: string }) {
  return <svg className="dollalercio-icon" width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={title}
    fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <title>{title}</title>
    <path d="M20 9V2 M28 9V2 M20 44v2 M28 44v2" />
    <path d="M12 16 9 6l10 5 M36 16l3-10-10 5" />
    <circle cx="24" cy="27" r="17" />
    <circle cx="17" cy="23" r="1.2" />
    <circle cx="31" cy="23" r="1.2" />
    <ellipse cx="24" cy="31" rx="9" ry="6" />
    <path d="M20.5 30v2 M27.5 30v2" />
  </svg>;
}
