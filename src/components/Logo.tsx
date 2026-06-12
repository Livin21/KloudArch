/**
 * KloudArch mark — a drafted hexagon that reads as both an isometric block
 * and a node graph: three terminal pads, one amber hub at the drafting point.
 *
 * Geometry: pointy-top hexagon, center (32,32), radius 26.
 * Vertices: top (32,6) · UR (54.5,19) · LR (54.5,45) · bottom (32,58) ·
 *           LL (9.5,45) · UL (9.5,19). Hub spokes run to UL, UR and bottom,
 *           so the silhouette also resolves as a cube seen from above.
 */
export function LogoMark({
  size = 24,
  detail = false,
}: {
  size?: number;
  /** Adds faint dashed construction circle + ticks for large lockups. */
  detail?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {detail && (
        <>
          <circle
            cx="32"
            cy="32"
            r="30"
            stroke="#53c7ff"
            strokeOpacity="0.22"
            strokeWidth="1"
            strokeDasharray="2.5 4.5"
          />
          <path
            d="M32 0v3.5M32 60.5V64M0 32h3.5M60.5 32H64"
            stroke="#53c7ff"
            strokeOpacity="0.4"
            strokeWidth="1"
          />
        </>
      )}
      <path
        d="M32 6 54.5 19v26L32 58 9.5 45V19L32 6Z"
        stroke="#53c7ff"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M32 32 9.5 19M32 32l22.5-13M32 32v26"
        stroke="#53c7ff"
        strokeWidth="1.6"
        strokeOpacity="0.7"
      />
      <rect x="6.6" y="16.1" width="5.8" height="5.8" rx="1" fill="#53c7ff" />
      <rect x="51.6" y="16.1" width="5.8" height="5.8" rx="1" fill="#53c7ff" />
      <rect x="29.1" y="55.1" width="5.8" height="5.8" rx="1" fill="#53c7ff" />
      <rect
        x="28.2"
        y="28.2"
        width="7.6"
        height="7.6"
        rx="1.2"
        fill="#ffb224"
        transform="rotate(45 32 32)"
      />
    </svg>
  );
}

export function LogoLockup({
  markSize = 24,
  className = "",
  tag,
}: {
  markSize?: number;
  className?: string;
  /** Optional mono chip after the wordmark, e.g. "STUDIO 0.1". */
  tag?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={markSize} />
      <span className="text-[13px] font-bold tracking-[0.22em] text-fg">
        KLOUDARCH
      </span>
      {tag && (
        <span className="rounded-[2px] border border-line px-1.5 py-0.5 font-mono text-[8.5px] tracking-[0.14em] text-fg-faint">
          {tag}
        </span>
      )}
    </span>
  );
}
