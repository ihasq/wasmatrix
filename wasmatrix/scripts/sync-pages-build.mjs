import { cp, rm } from "node:fs/promises";

await rm("docs/build", { recursive: true, force: true });
await cp("wasmatrix/docs/build", "docs/build", { recursive: true });
