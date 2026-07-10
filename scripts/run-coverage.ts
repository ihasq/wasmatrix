async function run(command: string, args: string[]) {
  const result = await new Deno.Command(command, {
    args,
    stdout: "inherit",
    stderr: "inherit",
  }).output();

  if (!result.success) {
    throw new Error(`${command} ${args.join(" ")} failed with ${result.code}`);
  }
}

await Deno.remove("coverage/tmp", { recursive: true }).catch((error) => {
  if (!(error instanceof Deno.errors.NotFound)) throw error;
});
await Deno.mkdir("coverage", { recursive: true });

const testFiles: string[] = [];
for await (const entry of Deno.readDir("test")) {
  if (entry.isFile && entry.name.endsWith(".test.ts")) {
    testFiles.push(`test/${entry.name}`);
  }
}
testFiles.sort();

await run(Deno.execPath(), [
  "test",
  "-A",
  "--coverage=coverage/tmp",
  ...testFiles,
]);

const coverage = await new Deno.Command(Deno.execPath(), {
  args: ["coverage", "--lcov", "coverage/tmp"],
  stdout: "piped",
  stderr: "inherit",
}).output();

if (!coverage.success) {
  throw new Error(`deno coverage failed with ${coverage.code}`);
}

await Deno.writeFile("coverage/lcov.info", coverage.stdout);
