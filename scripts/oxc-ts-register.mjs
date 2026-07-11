import { register } from "node:module";

register(new URL("./oxc-ts-loader.mjs", import.meta.url), import.meta.url);
