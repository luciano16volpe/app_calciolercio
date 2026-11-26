/** Il simbolo dei dollalerci: la faccia di un maialino con due barrette verticali, come nel segno del dollaro. */
export function Dollalercio({ size = 20, title = 'Dollalerci' }: { size?: number; title?: string }) {
  return <svg className="dollalercio-icon" width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={title}>
    <title>{title}</title>
    <path d="M9 17 L6 4 L19 10 Z" fill="#f08aa6" stroke="#b5476a" strokeWidth="2" strokeLinejoin="round" />
    <path d="M39 17 L42 4 L29 10 Z" fill="#f08aa6" stroke="#b5476a" strokeWidth="2" strokeLinejoin="round" />
    <circle cx="24" cy="26" r="18" fill="#f9b4c8" stroke="#b5476a" strokeWidth="2" />
    <ellipse cx="24" cy="31" rx="10.5" ry="6.5" fill="#f08aa6" stroke="#b5476a" strokeWidth="2" />
    <ellipse cx="17.8" cy="31" rx="1.7" ry="2.4" fill="#8a2f4d" />
    <ellipse cx="30.2" cy="31" rx="1.7" ry="2.4" fill="#8a2f4d" />
    <circle cx="16.5" cy="22" r="2.2" fill="#3b1a26" />
    <circle cx="31.5" cy="22" r="2.2" fill="#3b1a26" />
    <rect x="20.2" y="1.5" width="2.6" height="45" rx="1.3" fill="#1f8a4c" />
    <rect x="25.2" y="1.5" width="2.6" height="45" rx="1.3" fill="#1f8a4c" />
  </svg>;
}
