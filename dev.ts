#!/usr/bin/env -S deno run -A --watch
import "https://deno.land/x/dotenv@v3.2.2/load.ts";

if (Deno.args.includes("build")) {
  Deno.exit(0);
}
