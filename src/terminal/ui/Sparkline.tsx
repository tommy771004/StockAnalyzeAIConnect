interface SparklineProps {
  data: number[];
  stroke: string;
  fill?: string;
  width?: number | string;
  height?: number | string;
  className?: string;
  showArea?: boolean;
}

export function Sparkline({
  data,
  stroke,
  fill,
  width = '100%',
  height = '100%',
  className,
  showArea = true,
}: SparklineProps) {
  if (data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const W = 1000;
  const H = 300;
  const step = data.length > 1 ? W / (data.length - 1) : W;
  const points = data.map((v, i) => {
    const x = i * step;
    const y = H - ((v - min) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const linePath = `M ${points.join(' L ')}`;
  const areaPath = `${linePath} L ${W},${H} L 0,${H} Z`;
  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
    >
      {showArea && fill && <path d={areaPath} fill={fill} />}
      <path d={linePath} stroke={stroke} strokeWidth={2.2} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
