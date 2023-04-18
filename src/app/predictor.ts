import { PATTERN, PROBABILITY_MATRIX } from "./pattern.ts";
import ProbabilityDensityFunction from "./probability_density_function.ts";
import { Range } from "./types.ts";
import {
  clamp,
  range_intersect_length,
  range_length,
  range_intersect,
} from "./utils.ts";

const RATE_MULTIPLIER = 10000;

type Prediction = { min: number; max: number };

type Probability = {
  pattern: PATTERN;
  prices: Array<Prediction>;
  probability: number;
};

type ExpandedProbability = Probability & {
  week_min: number;
  week_max: number;
};

export default class Predictor {
  fudge_factor: number;
  prices: Array<number>;
  first_buy: boolean;
  previous_pattern: PATTERN | null;

  constructor(
    prices: Array<number>,
    first_buy: boolean,
    previous_pattern: PATTERN | null
  ) {
    this.fudge_factor = 0;
    this.prices = prices;
    this.first_buy = first_buy;
    this.previous_pattern = previous_pattern;
  }

  intceil(val: number) {
    return Math.trunc(val + 0.99999);
  }

  minimum_rate_from_given_and_base(given_price: number, buy_price: number) {
    return (RATE_MULTIPLIER * (given_price - 0.99999)) / buy_price;
  }

  maximum_rate_from_given_and_base(given_price: number, buy_price: number) {
    return (RATE_MULTIPLIER * (given_price + 0.00001)) / buy_price;
  }

  rate_range_from_given_and_base(
    given_price: number,
    buy_price: number
  ): Range {
    return [
      this.minimum_rate_from_given_and_base(given_price, buy_price),
      this.maximum_rate_from_given_and_base(given_price, buy_price),
    ];
  }

  get_price(rate: number, basePrice: number) {
    return this.intceil((rate * basePrice) / RATE_MULTIPLIER);
  }

  *multiply_generator_probability(
    generator: Iterable<Probability>,
    probability: number
  ) {
    for (const it of generator) {
      yield { ...it, probability: it.probability * probability };
    }
  }

  generate_individual_random_price(
    given_prices: Array<number>,
    predicted_prices: Array<Prediction>,
    start: number,
    length: number,
    rate_min: number,
    rate_max: number
  ) {
    rate_min *= RATE_MULTIPLIER;
    rate_max *= RATE_MULTIPLIER;

    const buy_price = given_prices[0];
    const rate_range: Range = [rate_min, rate_max];
    let prob = 1;

    for (let i = start; i < start + length; i++) {
      let min_pred = this.get_price(rate_min, buy_price);
      let max_pred = this.get_price(rate_max, buy_price);
      if (!isNaN(given_prices[i])) {
        if (
          given_prices[i] < min_pred - this.fudge_factor ||
          given_prices[i] > max_pred + this.fudge_factor
        ) {
          return 0;
        }

        const real_rate_range = this.rate_range_from_given_and_base(
          clamp(given_prices[i], min_pred, max_pred),
          buy_price
        );
        prob *=
          range_intersect_length(rate_range, real_rate_range) /
          range_length(rate_range);
        min_pred = given_prices[i];
        max_pred = given_prices[i];
      }

      predicted_prices.push({
        min: min_pred,
        max: max_pred,
      });
    }
    return prob;
  }

  generate_decreasing_random_price(
    given_prices: Array<number>,
    predicted_prices: Array<Prediction>,
    start: number,
    length: number,
    start_rate_min: number,
    start_rate_max: number,
    rate_decay_min: number,
    rate_decay_max: number
  ) {
    start_rate_min *= RATE_MULTIPLIER;
    start_rate_max *= RATE_MULTIPLIER;
    rate_decay_min *= RATE_MULTIPLIER;
    rate_decay_max *= RATE_MULTIPLIER;

    const buy_price = given_prices[0];
    const rate_pdf = new ProbabilityDensityFunction(
      start_rate_min,
      start_rate_max
    );
    let prob = 1;

    for (let i = start; i < start + length; i++) {
      let min_pred = this.get_price(rate_pdf.min_value(), buy_price);
      let max_pred = this.get_price(rate_pdf.max_value(), buy_price);
      if (!isNaN(given_prices[i])) {
        if (
          given_prices[i] < min_pred - this.fudge_factor ||
          given_prices[i] > max_pred + this.fudge_factor
        ) {
          return 0;
        }
        const real_rate_range = this.rate_range_from_given_and_base(
          clamp(given_prices[i], min_pred, max_pred),
          buy_price
        );
        prob *= rate_pdf.range_limit(real_rate_range);
        if (prob == 0) {
          return 0;
        }
        min_pred = given_prices[i];
        max_pred = given_prices[i];
      }

      predicted_prices.push({
        min: min_pred,
        max: max_pred,
      });

      rate_pdf.decay(rate_decay_min, rate_decay_max);
    }
    return prob;
  }

  generate_peak_price(
    given_prices: Array<number>,
    predicted_prices: Array<Prediction>,
    start: number,
    rate_min: number,
    rate_max: number
  ) {
    rate_min *= RATE_MULTIPLIER;
    rate_max *= RATE_MULTIPLIER;

    const buy_price = given_prices[0];
    let prob = 1;
    let rate_range: Range = [rate_min, rate_max];

    const middle_price = given_prices[start + 1];
    if (!isNaN(middle_price)) {
      const min_pred = this.get_price(rate_min, buy_price);
      const max_pred = this.get_price(rate_max, buy_price);
      if (
        middle_price < min_pred - this.fudge_factor ||
        middle_price > max_pred + this.fudge_factor
      ) {
        return 0;
      }
      const real_rate_range = this.rate_range_from_given_and_base(
        clamp(middle_price, min_pred, max_pred),
        buy_price
      );
      prob *=
        range_intersect_length(rate_range, real_rate_range) /
        range_length(rate_range);
      if (prob == 0) {
        return 0;
      }

      const input = range_intersect(rate_range, real_rate_range);
      if (!input) throw new Error("Invalid ranges");
      rate_range = input;
    }

    const left_price = given_prices[start];
    const right_price = given_prices[start + 2];
    for (const price of [left_price, right_price]) {
      if (isNaN(price)) {
        continue;
      }
      const min_pred = this.get_price(rate_min, buy_price) - 1;
      const max_pred = this.get_price(rate_range[1], buy_price) - 1;
      if (
        price < min_pred - this.fudge_factor ||
        price > max_pred + this.fudge_factor
      ) {
        return 0;
      }

      const rate2_range = this.rate_range_from_given_and_base(
        clamp(price, min_pred, max_pred) + 1,
        buy_price
      );
      const F = (t: number, ZZ: number) => {
        if (t <= 0) {
          return 0;
        }
        return ZZ < t ? ZZ : t - t * (Math.log(t) - Math.log(ZZ));
      };
      const [A, B] = rate_range;
      const C = rate_min;
      const Z1 = A - C;
      const Z2 = B - C;
      const PY = (t: number) => (F(t - C, Z2) - F(t - C, Z1)) / (Z2 - Z1);
      prob *= PY(rate2_range[1]) - PY(rate2_range[0]);
      if (prob == 0) {
        return 0;
      }
    }

    let min_pred = this.get_price(rate_min, buy_price) - 1;
    let max_pred = this.get_price(rate_max, buy_price) - 1;
    if (!isNaN(given_prices[start])) {
      min_pred = given_prices[start];
      max_pred = given_prices[start];
    }
    predicted_prices.push({
      min: min_pred,
      max: max_pred,
    });

    // Main spike 2
    min_pred = predicted_prices[start].min;
    max_pred = this.get_price(rate_max, buy_price);
    if (!isNaN(given_prices[start + 1])) {
      min_pred = given_prices[start + 1];
      max_pred = given_prices[start + 1];
    }
    predicted_prices.push({
      min: min_pred,
      max: max_pred,
    });

    // Main spike 3
    min_pred = this.get_price(rate_min, buy_price) - 1;
    max_pred = predicted_prices[start + 1].max - 1;
    if (!isNaN(given_prices[start + 2])) {
      min_pred = given_prices[start + 2];
      max_pred = given_prices[start + 2];
    }
    predicted_prices.push({
      min: min_pred,
      max: max_pred,
    });

    return prob;
  }

  *generate_pattern_0_with_lengths(
    given_prices: Array<number>,
    high_phase_1_len: number,
    dec_phase_1_len: number,
    high_phase_2_len: number,
    dec_phase_2_len: number,
    high_phase_3_len: number
  ) {
    const buy_price = given_prices[0];
    const predicted_prices = [
      {
        min: buy_price,
        max: buy_price,
      },
      {
        min: buy_price,
        max: buy_price,
      },
    ];
    let probability = 1;

    probability *= this.generate_individual_random_price(
      given_prices,
      predicted_prices,
      2,
      high_phase_1_len,
      0.9,
      1.4
    );
    if (probability == 0) {
      return;
    }

    probability *= this.generate_decreasing_random_price(
      given_prices,
      predicted_prices,
      2 + high_phase_1_len,
      dec_phase_1_len,
      0.6,
      0.8,
      0.04,
      0.1
    );
    if (probability == 0) {
      return;
    }

    probability *= this.generate_individual_random_price(
      given_prices,
      predicted_prices,
      2 + high_phase_1_len + dec_phase_1_len,
      high_phase_2_len,
      0.9,
      1.4
    );
    if (probability == 0) {
      return;
    }

    probability *= this.generate_decreasing_random_price(
      given_prices,
      predicted_prices,
      2 + high_phase_1_len + dec_phase_1_len + high_phase_2_len,
      dec_phase_2_len,
      0.6,
      0.8,
      0.04,
      0.1
    );
    if (probability == 0) {
      return;
    }

    if (
      2 +
        high_phase_1_len +
        dec_phase_1_len +
        high_phase_2_len +
        dec_phase_2_len +
        high_phase_3_len !=
      14
    ) {
      throw new Error("Phase lengths don't add up");
    }

    const prev_length =
      2 +
      high_phase_1_len +
      dec_phase_1_len +
      high_phase_2_len +
      dec_phase_2_len;
    probability *= this.generate_individual_random_price(
      given_prices,
      predicted_prices,
      prev_length,
      14 - prev_length,
      0.9,
      1.4
    );
    if (probability == 0) {
      return;
    }

    yield {
      pattern: PATTERN.FLUCTUATING,
      prices: predicted_prices,
      probability,
    };
  }

  *generate_pattern_0(given_prices: Array<number>) {
    for (let dec_phase_1_len = 2; dec_phase_1_len < 4; dec_phase_1_len++) {
      for (let high_phase_1_len = 0; high_phase_1_len < 7; high_phase_1_len++) {
        for (
          let high_phase_3_len = 0;
          high_phase_3_len < 7 - high_phase_1_len - 1 + 1;
          high_phase_3_len++
        ) {
          yield* this.multiply_generator_probability(
            this.generate_pattern_0_with_lengths(
              given_prices,
              high_phase_1_len,
              dec_phase_1_len,
              7 - high_phase_1_len - high_phase_3_len,
              5 - dec_phase_1_len,
              high_phase_3_len
            ),
            1 / (4 - 2) / 7 / (7 - high_phase_1_len)
          );
        }
      }
    }
  }

  *generate_pattern_1_with_peak(
    given_prices: Array<number>,
    peak_start: number
  ) {
    const buy_price = given_prices[0];
    const predicted_prices = [
      {
        min: buy_price,
        max: buy_price,
      },
      {
        min: buy_price,
        max: buy_price,
      },
    ];
    let probability = 1;

    probability *= this.generate_decreasing_random_price(
      given_prices,
      predicted_prices,
      2,
      peak_start - 2,
      0.85,
      0.9,
      0.03,
      0.05
    );
    if (probability == 0) {
      return;
    }

    const min_randoms = [0.9, 1.4, 2.0, 1.4, 0.9, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4];
    const max_randoms = [1.4, 2.0, 6.0, 2.0, 1.4, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9];
    for (let i = peak_start; i < 14; i++) {
      probability *= this.generate_individual_random_price(
        given_prices,
        predicted_prices,
        i,
        1,
        min_randoms[i - peak_start],
        max_randoms[i - peak_start]
      );
      if (probability == 0) {
        return;
      }
    }
    yield {
      pattern: PATTERN.LARGE_SPIKE,
      prices: predicted_prices,
      probability,
    };
  }

  *generate_pattern_1(given_prices: Array<number>) {
    for (let peak_start = 3; peak_start < 10; peak_start++) {
      yield* this.multiply_generator_probability(
        this.generate_pattern_1_with_peak(given_prices, peak_start),
        1 / (10 - 3)
      );
    }
  }

  *generate_pattern_2(given_prices: Array<number>) {
    const buy_price = given_prices[0];
    const predicted_prices = [
      {
        min: buy_price,
        max: buy_price,
      },
      {
        min: buy_price,
        max: buy_price,
      },
    ];
    let probability = 1;

    probability *= this.generate_decreasing_random_price(
      given_prices,
      predicted_prices,
      2,
      14 - 2,
      0.85,
      0.9,
      0.03,
      0.05
    );
    if (probability == 0) {
      return;
    }

    yield {
      pattern: PATTERN.DECREASING,
      prices: predicted_prices,
      probability,
    };
  }

  *generate_pattern_3_with_peak(
    given_prices: Array<number>,
    peak_start: number
  ) {
    const buy_price = given_prices[0];
    const predicted_prices = [
      {
        min: buy_price,
        max: buy_price,
      },
      {
        min: buy_price,
        max: buy_price,
      },
    ];
    let probability = 1;

    probability *= this.generate_decreasing_random_price(
      given_prices,
      predicted_prices,
      2,
      peak_start - 2,
      0.4,
      0.9,
      0.03,
      0.05
    );
    if (probability == 0) {
      return;
    }

    // The peak
    probability *= this.generate_individual_random_price(
      given_prices,
      predicted_prices,
      peak_start,
      2,
      0.9,
      1.4
    );
    if (probability == 0) {
      return;
    }

    probability *= this.generate_peak_price(
      given_prices,
      predicted_prices,
      peak_start + 2,
      1.4,
      2.0
    );
    if (probability == 0) {
      return;
    }

    if (peak_start + 5 < 14) {
      probability *= this.generate_decreasing_random_price(
        given_prices,
        predicted_prices,
        peak_start + 5,
        14 - (peak_start + 5),
        0.4,
        0.9,
        0.03,
        0.05
      );
      if (probability == 0) {
        return;
      }
    }

    yield {
      pattern: PATTERN.SMALL_SPIKE,
      prices: predicted_prices,
      probability,
    };
  }

  *generate_pattern_3(given_prices: Array<number>) {
    for (let peak_start = 2; peak_start < 10; peak_start++) {
      yield* this.multiply_generator_probability(
        this.generate_pattern_3_with_peak(given_prices, peak_start),
        1 / (10 - 2)
      );
    }
  }

  get_transition_probability(previous_pattern: PATTERN | null) {
    if (!previous_pattern) {
      return {
        [PATTERN.FLUCTUATING]: 4530 / 13082,
        [PATTERN.LARGE_SPIKE]: 3236 / 13082,
        [PATTERN.DECREASING]: 1931 / 13082,
        [PATTERN.SMALL_SPIKE]: 3385 / 13082,
      };
    }

    return PROBABILITY_MATRIX[previous_pattern];
  }

  *generate_all_patterns(
    sell_prices: Array<number>,
    previous_pattern: PATTERN | null
  ) {
    const transition_probability =
      this.get_transition_probability(previous_pattern);

    yield* this.multiply_generator_probability(
      this.generate_pattern_0(sell_prices),
      transition_probability[PATTERN.FLUCTUATING]
    );
    yield* this.multiply_generator_probability(
      this.generate_pattern_1(sell_prices),
      transition_probability[PATTERN.LARGE_SPIKE]
    );
    yield* this.multiply_generator_probability(
      this.generate_pattern_2(sell_prices),
      transition_probability[PATTERN.DECREASING]
    );
    yield* this.multiply_generator_probability(
      this.generate_pattern_3(sell_prices),
      transition_probability[PATTERN.SMALL_SPIKE]
    );
  }

  *generate_possibilities(
    sell_prices: Array<number>,
    first_buy: boolean,
    previous_pattern: PATTERN | null
  ) {
    if (first_buy || isNaN(sell_prices[0]))
      for (let buy_price = 90; buy_price <= 110; buy_price++) {
        const temp_sell_prices = sell_prices.slice();
        temp_sell_prices[0] = temp_sell_prices[1] = buy_price;
        if (first_buy) yield* this.generate_pattern_3(temp_sell_prices);
        else
          yield* this.generate_all_patterns(temp_sell_prices, previous_pattern);
      }
    else yield* this.generate_all_patterns(sell_prices, previous_pattern);
  }

  get_global(posibilities: Array<ExpandedProbability>) {
    const global_min_max = [];
    for (let day = 0; day < 14; day++) {
      const prices = {
        min: 999,
        max: 0,
      };
      for (const poss of posibilities) {
        if (poss.prices[day].min < prices.min) {
          prices.min = poss.prices[day].min;
        }
        if (poss.prices[day].max > prices.max) {
          prices.max = poss.prices[day].max;
        }
      }
      global_min_max.push(prices);
    }

    return global_min_max;
  }

  get_pattern(posibilities: Array<ExpandedProbability>, pattern: PATTERN) {
    const filtered = posibilities.filter(
      (value) => value.pattern == pattern
    );

    return {
      options: filtered,
      probability: filtered
        .map((value) => value.probability)
        .reduce((previous, current) => previous + current, 0),
      week_min: Math.min(
        ...posibilities.map((poss) => poss.week_min ?? Number.MAX_SAFE_INTEGER)
      ),
      week_max: Math.max(...posibilities.map((poss) => poss.week_max ?? -1)),
      prices: this.get_global(filtered),
    };
  }

  analyze_possibilities() {
    const sell_prices = this.prices;
    const first_buy = this.first_buy;
    const previous_pattern = this.previous_pattern;
    let possibilities: Array<ExpandedProbability> = [];
    for (let i = 0; i < 6; i++) {
      this.fudge_factor = i;
      possibilities = Array.from(
        this.generate_possibilities(sell_prices, first_buy, previous_pattern)
      ) as Array<ExpandedProbability>;
      if (possibilities.length > 0) break;
    }

    const total_probability = possibilities.reduce(
      (acc, it) => acc + it.probability,
      0
    );
    for (const it of possibilities) {
      it.probability /= total_probability;
    }

    for (const poss of possibilities) {
      let weekMins = [];
      let weekMaxes = [];
      for (const day of poss.prices.slice(2)) {
        // Check for a future date by checking for a range of prices
        if (day.min !== day.max) {
          weekMins.push(day.min);
          weekMaxes.push(day.max);
        } else {
          weekMins = [];
          weekMaxes = [];
        }
      }
      if (!weekMins.length && !weekMaxes.length) {
        weekMins.push(poss.prices[poss.prices.length - 1].min);
        weekMaxes.push(poss.prices[poss.prices.length - 1].max);
      }
      poss.week_min = Math.max(...weekMins);
      poss.week_max = Math.max(...weekMaxes);
    }

    return {
      patterns: {
        [PATTERN.FLUCTUATING]: this.get_pattern(
          possibilities,
          PATTERN.FLUCTUATING
        ),
        [PATTERN.LARGE_SPIKE]: this.get_pattern(
          possibilities,
          PATTERN.LARGE_SPIKE
        ),
        [PATTERN.DECREASING]: this.get_pattern(
          possibilities,
          PATTERN.DECREASING
        ),
        [PATTERN.SMALL_SPIKE]: this.get_pattern(
          possibilities,
          PATTERN.SMALL_SPIKE
        ),
      },
      totals: {
        prices: this.get_global(possibilities),
        week_min: Math.min(
          ...possibilities.map(
            (poss) => poss.week_min ?? Number.MAX_SAFE_INTEGER
          )
        ),
        week_max: Math.max(...possibilities.map((poss) => poss.week_max ?? -1)),
      },
    };
  }
}
