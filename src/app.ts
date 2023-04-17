import { CreateAppServer } from "../deps/counter_top.ts";

const _Server = CreateAppServer({}, {}, (c) => {
  c.OpenWindow("index.html", "Turnips", {
    top: "50px",
    left: "50px",
    width: "800px",
    height: "600px",
  }).then(() => c.EndApp());
  return c;
});
