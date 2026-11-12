import { cn } from '../../lib/utils';

interface PathDiagramProps {
  className?: string;
}

/**
 * Two lanes, one diagram: the muted dashed lane is the handshake the server
 * relays, the solid amber lane is the file data that never touches it.
 *
 * Flat SVG — no gradient, no blur, no glow.
 */
export function PathDiagram({ className }: PathDiagramProps) {
  return (
    <svg
      viewBox="0 0 520 210"
      className={cn('w-full', className)}
      role="img"
      aria-label="A dashed lane shows the handshake relayed through the server; a solid lane shows file data travelling directly between the two devices."
    >
      {/* Endpoints */}
      <g className="fill-raised stroke-border-strong" strokeWidth={1.5}>
        <rect x={10} y={80} width={52} height={48} rx={4} />
        <rect x={458} y={80} width={52} height={48} rx={4} />
      </g>
      <g className="fill-text-3 font-mono text-xs">
        <text x={36} y={150} textAnchor="middle">
          A
        </text>
        <text x={484} y={150} textAnchor="middle">
          B
        </text>
      </g>

      {/* Lane 1 — handshake relay (dashed, muted) */}
      <g className="stroke-text-3" strokeWidth={1.5} strokeDasharray="3 5">
        <line x1={62} y1={48} x2={228} y2={48} />
        <line x1={292} y1={48} x2={458} y2={48} />
        <rect x={228} y={30} width={64} height={36} rx={4} className="fill-canvas" />
      </g>
      <text
        x={260}
        y={53}
        textAnchor="middle"
        className="fill-text-3 font-mono text-xs"
      >
        relay
      </text>

      {/* Lane 2 — file data, direct (solid, accent) */}
      <g className="stroke-accent" strokeWidth={2}>
        <line x1={62} y1={168} x2={236} y2={168} />
        <line x1={284} y1={168} x2={458} y2={168} />
      </g>
      <rect x={234} y={154} width={52} height={28} className="fill-canvas" />
      <text
        x={260}
        y={173}
        textAnchor="middle"
        className="fill-accent font-mono text-xs"
      >
        data
      </text>
    </svg>
  );
}
