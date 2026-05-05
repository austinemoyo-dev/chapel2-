'use client';

interface BarChartProps {
  data: { date: string; count: number }[];
  height?: number;
}

export default function BarChart({ data, height = 200 }: BarChartProps) {
  const max = Math.max(...data.map(d => d.count), 1);
  const barWidth = 100 / data.length;

  return (
    <div className="w-full" style={{ height }}>
      <svg viewBox={`0 0 ${data.length * 32} ${height}`} className="w-full h-full" preserveAspectRatio="none">
        {data.map((d, i) => {
          const barH = (d.count / max) * (height - 30);
          const x = i * 32 + 4;
          const y = height - barH - 20;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={24}
                height={barH}
                rx={4}
                fill="var(--color-primary)"
                opacity={0.8}
                className="transition-all duration-500"
              >
                <title>{`${d.date}: ${d.count}`}</title>
              </rect>
              {/* Date label */}
              <text
                x={x + 12}
                y={height - 4}
                textAnchor="middle"
                className="text-[7px] fill-muted"
                style={{ fill: 'var(--color-muted)' }}
              >
                {new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric' })}
              </text>
              {/* Count label */}
              {d.count > 0 && (
                <text
                  x={x + 12}
                  y={y - 4}
                  textAnchor="middle"
                  className="text-[7px] font-bold"
                  style={{ fill: 'var(--color-primary)' }}
                >
                  {d.count}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
