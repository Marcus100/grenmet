import { qrMatrix } from "@/lib/qr";

/**
 * A ticket's QR code as inline SVG. Dark modules are drawn in black on white
 * (with a quiet zone) at every theme so door scanners can read it.
 */
export function QrCode({
  className,
  label,
  value,
}: {
  className?: string;
  label: string;
  value: string;
}) {
  const { path, size } = qrMatrix(value);
  const quiet = 2;
  const span = size + quiet * 2;
  return (
    <svg
      aria-label={label}
      className={className}
      role="img"
      viewBox={`${-quiet} ${-quiet} ${span} ${span}`}
    >
      <title>{label}</title>
      <rect fill="#fff" height={span} width={span} x={-quiet} y={-quiet} />
      <path d={path} fill="#000" shapeRendering="crispEdges" />
    </svg>
  );
}
