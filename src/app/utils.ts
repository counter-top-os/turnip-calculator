import { Range } from "./types.ts";

export function range_length(range: Range): number {
  return range[1] - range[0];
}

export function clamp(x: number, min: number, max: number): number {
  return Math.min(Math.max(x, min), max);
}

export function range_intersect(range1: Range, range2: Range): Range | null {
  if (range1[0] > range2[1] || range1[1] < range2[0]) {
    return null;
  }
  return [Math.max(range1[0], range2[0]), Math.min(range1[1], range2[1])];
}

export function range_intersect_length(range1: Range, range2: Range): number {
  if (range1[0] > range2[1] || range1[1] < range2[0]) return 0;
  const intersection = range_intersect(range1, range2);
  if (!intersection) return 0;
  return range_length(intersection);
}

export function float_sum(input: Array<number>): number {
  let sum = 0;
  let c = 0;
  for (let i = 0; i < input.length; i++) {
    const cur = input[i];
    const t = sum + cur;
    if (Math.abs(sum) >= Math.abs(cur)) {
      c += sum - t + cur;
    } else {
      c += cur - t + sum;
    }
    sum = t;
  }
  return sum + c;
}

export function prefix_float_sum(input: Array<number>): Array<Range> {
  const prefix_sum: Array<Range> = [[0, 0]];
  let sum = 0;
  let c = 0;
  for (let i = 0; i < input.length; i++) {
    const cur = input[i];
    const t = sum + cur;
    if (Math.abs(sum) >= Math.abs(cur)) {
      c += sum - t + cur;
    } else {
      c += cur - t + sum;
    }
    sum = t;
    prefix_sum.push([sum, c]);
  }
  return prefix_sum;
}
