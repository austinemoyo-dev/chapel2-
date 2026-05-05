'use client';

interface DonutChartProps {
  data: Record<string, number>;
  size?: number;
}

const COLORS = ['#7C3AED', '#A855F7', '#C084FC', '#E9D5FF', '#6D28D9'];

export default function DonutChart({ data, size = 160 }: DonutChartProps) {
  const entries = Object.entries(data);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);

  if (total === 0) {
    return (
      <div className="flex items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-sm text-muted">No data</span>
      </div>
    );
  }

  // Build conic gradient
  let cumulative = 0;
  const stops = entries.map(([, v], i) => {
    const start = cumulative;
    const end = cumulative + (v / total) * 360;
    cumulative = end;
    return `${COLORS[i % COLORS.length]} ${start}deg ${end}deg`;
  });

  return (
    <div className="flex items-center gap-4">
      <div
        className="rounded-full relative shadow-sm"
        style={{
          width: size,
          height: size,
          background: `conic-gradient(${stops.join(', ')})`,
        }}
      >
        {/* Inner hole */}
        <div
          className="absolute bg-surface rounded-full"
          style={{
            width: size * 0.6,
            height: size * 0.6,
            top: size * 0.2,
            left: size * 0.2,
          }}
        >
          <div className="flex flex-col items-center justify-center h-full">
            <span className="text-lg font-extrabold text-foreground">{total}</span>
            <span className="text-[10px] text-muted font-medium">Total</span>
          </div>
        </div>
      </div>
      {/* Legend */}
      <div className="flex flex-col gap-1.5">
        {entries.map(([label, count], i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-sm shrink-0"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            <span className="text-xs font-medium text-foreground">{label}</span>
            <span className="text-xs text-muted">({count})</span>
          </div>
        ))}
      </div>
    </div>
  );
}
