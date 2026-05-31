// Utility functions that won't be overwritten by auto-generation

// White (#ffffff) is always rendered after every other swatch.
export function sortColorsWhiteLast(colors: readonly string[]): string[] {
  return [...colors].sort((a, b) => {
    const aw = a.toLowerCase() === "#ffffff" ? 1 : 0;
    const bw = b.toLowerCase() === "#ffffff" ? 1 : 0;
    return aw - bw;
  });
}

export function expandSizes(sizes: string): string[] {
  if (sizes === "One Size") return ["One Size"];
  const order = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL", "7XL"];
  const tallOrder = ["LT", "XLT", "2XLT", "3XLT", "4XLT", "5XLT"];
  const expandRange = (range: string): string[] => {
    const m = range.trim().match(/^(\w+)\s*-\s*(\w+)$/);
    if (!m) return [range.trim()];
    const inReg = order.indexOf(m[1]) !== -1 && order.indexOf(m[2]) !== -1;
    const inTall = tallOrder.indexOf(m[1]) !== -1 && tallOrder.indexOf(m[2]) !== -1;
    const arr = inReg ? order : inTall ? tallOrder : null;
    if (!arr) return [range.trim()];
    return arr.slice(arr.indexOf(m[1]), arr.indexOf(m[2]) + 1);
  };
  return sizes.split("/").flatMap(expandRange);
}
