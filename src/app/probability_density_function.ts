import { Range } from "./types.ts";
import {
  float_sum,
  prefix_float_sum,
  range_intersect_length,
  range_length,
} from "./utils.ts";

export default class ProbabilityDensityFunction {
  value_start: number;
  value_end: number;
  prob: Array<number>;

  constructor(a: number, b: number, uniform = true) {
    this.value_start = Math.floor(a);
    this.value_end = Math.ceil(b);
    const range: Range = [a, b];
    const total_length = range_length(range);
    this.prob = Array(this.value_end - this.value_start);
    if (uniform) {
      for (let i = 0; i < this.prob.length; i++) {
        this.prob[i] =
          range_intersect_length(this.range_of(i), range) / total_length;
      }
    }
  }

  range_of(idx: number): Range {
    return [this.value_start + idx, this.value_start + idx + 1];
  }

  min_value() {
    return this.value_start;
  }

  max_value() {
    return this.value_end;
  }

  normalize() {
    const total_probability = float_sum(this.prob);
    for (let i = 0; i < this.prob.length; i++) {
      this.prob[i] /= total_probability;
    }
    return total_probability;
  }

  range_limit(range: Range) {
    let [start, end] = range;
    start = Math.max(start, this.min_value());
    end = Math.min(end, this.max_value());
    if (start >= end) {
      this.value_start = this.value_end = 0;
      this.prob = [];
      return 0;
    }
    start = Math.floor(start);
    end = Math.ceil(end);

    const start_idx = start - this.value_start;
    const end_idx = end - this.value_start;
    for (let i = start_idx; i < end_idx; i++) {
      this.prob[i] *= range_intersect_length(this.range_of(i), range);
    }

    this.prob = this.prob.slice(start_idx, end_idx);
    this.value_start = start;
    this.value_end = end;

    return this.normalize();
  }

  decay(rate_decay_min: number, rate_decay_max: number) {
    rate_decay_min = Math.round(rate_decay_min);
    rate_decay_max = Math.round(rate_decay_max);

    const prefix = prefix_float_sum(this.prob);
    const max_X = this.prob.length;
    const max_Y = rate_decay_max - rate_decay_min;
    const newProb = Array(this.prob.length + max_Y);
    for (let i = 0; i < newProb.length; i++) {
      const left = Math.max(0, i - max_Y);
      const right = Math.min(max_X - 1, i);
      const numbers_to_sum = [
        prefix[right + 1][0],
        prefix[right + 1][1],
        -prefix[left][0],
        -prefix[left][1],
      ];
      if (left === i - max_Y) {
        // Need to halve the left endpoint.
        numbers_to_sum.push(-this.prob[left] / 2);
      }
      if (right === i) {
        numbers_to_sum.push(-this.prob[right] / 2);
      }
      newProb[i] = float_sum(numbers_to_sum) / max_Y;
    }

    this.prob = newProb;
    this.value_start -= rate_decay_max;
    this.value_end -= rate_decay_min;
  }
}
