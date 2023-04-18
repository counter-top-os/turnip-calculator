import {
  CreateAppServer,
  Short,
  Struct,
  Union,
  Literal,
  Record,
  ASCII,
  Optional,
  UTF8,
} from "../deps/counter_top.ts";
import { PATTERN } from "./app/pattern.ts";
import Predictor from "./app/predictor.ts";

type ValueKey =
  | "buy"
  | "monday_am"
  | "monday_pm"
  | "tuesday_am"
  | "tuesday_pm"
  | "wednesday_am"
  | "wednesday_pm"
  | "thursday_am"
  | "thursday_pm"
  | "friday_am"
  | "friday_pm"
  | "saturday_am"
  | "saturday_pm";

const Server = CreateAppServer(
  {
    previous_weeks: new Record(
      new ASCII(),
      new Union(
        new Literal(PATTERN.FLUCTUATING),
        new Literal(PATTERN.LARGE_SPIKE),
        new Literal(PATTERN.DECREASING),
        new Literal(PATTERN.SMALL_SPIKE)
      )
    ),
    islands: new Struct({
      week: new ASCII(),
      buy: new Optional(new Short()),
      monday_am: new Optional(new Short()),
      monday_pm: new Optional(new Short()),
      tuesday_am: new Optional(new Short()),
      tuesday_pm: new Optional(new Short()),
      wednesday_am: new Optional(new Short()),
      wednesday_pm: new Optional(new Short()),
      thursday_am: new Optional(new Short()),
      thursday_pm: new Optional(new Short()),
      friday_am: new Optional(new Short()),
      friday_pm: new Optional(new Short()),
      saturday_am: new Optional(new Short()),
      saturday_pm: new Optional(new Short()),
    }),
    island_metadata: new Struct({
      name: new UTF8(),
    }),
  },
  {},
  ({ OpenWindow, UserState, EndApp }) => {
    OpenWindow("index.html", "Turnips", {
      top: "50px",
      left: "50px",
      width: "800px",
      height: "600px",
    }).then(() => EndApp());
    function CurrentWeek() {
      const now = new Date().getTime();
      return Math.floor((now + 345_600_000) / 604_800_000);
    }

    function GetPrevious(island: string) {
      const last_week_numbers =
        UserState.Model.previous_weeks[(CurrentWeek() - 1).toString()];
      if (!last_week_numbers) return null;

      const island_data = last_week_numbers[island];
      if (island_data == null) return null;
      return island_data;
    }

    return {
      UserState,
      /** Gets the number of weeks since the epoch */
      get CurrentWeek() {
        return CurrentWeek();
      },
      GetPrevious(island: string) {
        return GetPrevious(island);
      },
      GetPrediction(island: string) {
        const value = UserState.Model.islands[island];
        const previous = GetPrevious(island);
        const predictor = new Predictor(
          [
            value.buy || NaN,
            value.buy || NaN,
            value.monday_am || NaN,
            value.monday_pm || NaN,
            value.tuesday_am || NaN,
            value.tuesday_pm || NaN,
            value.wednesday_am || NaN,
            value.wednesday_pm || NaN,
            value.thursday_am || NaN,
            value.thursday_pm || NaN,
            value.friday_am || NaN,
            value.friday_pm || NaN,
            value.saturday_am || NaN,
            value.saturday_pm || NaN,
          ],
          previous == null,
          previous
        );

        return predictor.analyze_possibilities();
      },
      GetHistory(island: string) {
        const result = [];
        for (let i = CurrentWeek() - 5; i < CurrentWeek(); i++) {
          const week = UserState.Model.previous_weeks[i.toString()];
          if (week) result.push(week[island]?.toString());
          else result.push("Unknown");
        }

        return result;
      },
    };
  }
);

Server.CreateHandler("get:previous_week", ({ UserState, CurrentWeek }) => {
  return UserState.Model.previous_weeks[(CurrentWeek - 1).toString()];
});

Server.CreateHandler(
  "get:current_values",
  ({ UserState, CurrentWeek, GetPrediction, GetHistory }) => {
    const result = [];
    for (const [id, value] of UserState.Model.islands) {
      if (value.week !== CurrentWeek.toString())
        UserState.Write({
          islands: {
            [id]: {
              week: CurrentWeek.toString(),
              buy: null,
              monday_am: null,
              monday_pm: null,
              tuesday_am: null,
              tuesday_pm: null,
              wednesday_am: null,
              wednesday_pm: null,
              thursday_am: null,
              thursday_pm: null,
              friday_am: null,
              friday_pm: null,
              saturday_am: null,
              saturday_pm: null,
            },
          },
        });
      else
        result.push({
          id,
          ...value,
          ...UserState.Model.island_metadata[id],
          predictions: GetPrediction(id),
          history: GetHistory(id),
        });
    }

    return result;
  }
);

Server.CreateHandler(
  "create:island",
  ({ UserState, CurrentWeek }, _, name: string) => {
    const id = crypto.randomUUID();

    UserState.Write({
      islands: {
        [id]: {
          week: CurrentWeek.toString(),
          buy: null,
          monday_am: null,
          monday_pm: null,
          tuesday_am: null,
          tuesday_pm: null,
          wednesday_am: null,
          wednesday_pm: null,
          thursday_am: null,
          thursday_pm: null,
          friday_am: null,
          friday_pm: null,
          saturday_am: null,
          saturday_pm: null,
        },
      },
      island_metadata: {
        [id]: { name },
      },
    });

    return id;
  }
);

Server.CreateHandler(
  "update:island_name",
  ({ UserState }, _, island: string, name: string) => {
    UserState.Write({
      island_metadata: {
        [island]: { name },
      },
    });
  }
);

Server.CreateHandler(
  "update:value_point",
  (
    { UserState, GetPrediction, CurrentWeek },
    _,
    island: string,
    key: ValueKey,
    value: number
  ) => {
    const existing = UserState.Model.islands[island];
    if (!existing) return "not found";

    const input = { ...existing, [key]: value };
    UserState.Write({ islands: { [island]: input } });

    const prediction = GetPrediction(island);
    const likelyhood = Object.keys(prediction.patterns).sort(
      (a, b) =>
        prediction.patterns[b as PATTERN].probability -
        prediction.patterns[a as PATTERN].probability
    )[0] as PATTERN;

    const existing_previous =
      UserState.Model.previous_weeks[CurrentWeek.toString()];
    UserState.Write({
      previous_weeks: {
        [CurrentWeek.toString()]: {
          ...existing_previous,
          [island]: likelyhood,
        },
      },
    });
  }
);
