export function isDarkPixel(
  r: number,
  g: number,
  b: number,
  threshold = 180
) {
  return (
    r < threshold &&
    g < threshold &&
    b < threshold
  );
}
