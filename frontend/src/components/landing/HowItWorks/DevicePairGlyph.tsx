import type { DeviceKind } from '../../../lib/landingCopy';

interface DevicePairGlyphProps {
  from: DeviceKind;
  to: DeviceKind;
}

/**
 * A compact two-device glyph: source, arrow, destination. Flat stroke, no
 * fill, no animation — it marks a row, it does not perform.
 */
export function DevicePairGlyph({ from, to }: DevicePairGlyphProps) {
  return (
    <svg
      viewBox="0 0 104 24"
      className="h-6 w-[104px]"
      role="img"
      aria-label={`${from} to ${to}`}
    >
      {from === 'phone' ? (
        <rect
          x={1}
          y={2}
          width={13}
          height={20}
          rx={2}
          className="fill-raised stroke-border-strong"
          strokeWidth={1.5}
        />
      ) : (
        <g className="stroke-border-strong" strokeWidth={1.5} fill="none">
          <rect x={0} y={4} width={20} height={13} rx={2} className="fill-raised" />
          <line x1={-2} y1={20} x2={22} y2={20} />
        </g>
      )}

      <g className="stroke-text-3" strokeWidth={1.5} fill="none">
        <line x1={32} y1={12} x2={64} y2={12} />
        <path d="M58 8 L64 12 L58 16" />
      </g>

      {to === 'phone' ? (
        <rect
          x={90}
          y={2}
          width={13}
          height={20}
          rx={2}
          className="fill-raised stroke-border-strong"
          strokeWidth={1.5}
        />
      ) : (
        <g className="stroke-border-strong" strokeWidth={1.5} fill="none">
          <rect x={83} y={4} width={20} height={13} rx={2} className="fill-raised" />
          <line x1={81} y1={20} x2={105} y2={20} />
        </g>
      )}
    </svg>
  );
}
