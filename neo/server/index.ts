import { start } from "./app.js";

start().catch((error) => {
  console.error("AIDC Neo failed to start", error);
  process.exitCode = 1;
});
