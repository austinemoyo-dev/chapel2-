'use client';

interface SparklineProps {
  data: { week: string; percentage: number }[];
  height?: number;
}

export default function Sparkline({ data, height = 80 }: SparklineProps) {
  if (data.length === 0) return null;

  const max = Math.max(...data.map(d => d.percentage), 100);
  const width = 300;
  const padX = 10;
  const padY = 10;
  const graphW = width - padX * 2;
  const graphH = height - padY * 2;

  const points = data.map((d, i) => ({
    x: padX + (i / Math.max(data.length - 1, 1)) * graphW,
    y: padY + graphH - (d.percentage / max) * graphH,
  }));

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  // Area fill
  const areaD = `${pathD} L ${points[points.length - 1].x} ${height - padY} L ${points[0].x} ${height - padY} Z`;

  return (
    <div className="w-full" style={{ height }}>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map(pct => {
          const y = padY + graphH - (pct / max) * graphH;
          return (
            <line
              key={pct}
              x1={padX} y1={y} x2={width - padX} y2={y}
              stroke="var(--color-border)"
              strokeWidth={0.5}
              opacity={0.3}
            />
          );
        })}
        {/* Area */}
        <path d={areaD} fill="var(--color-primary)" opacity={0.1} />
        {/* Line */}
        <path d={pathD} fill="none" stroke="var(--color-primary)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {/* Dots */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={4} fill="var(--color-primary)" />
            <circle cx={p.x} cy={p.y} r={2} fill="white" />
            <title>{`${data[i].week}: ${data[i].percentage}%`}</title>
          </g>
        ))}
      </svg>
    </div>
  );
}
