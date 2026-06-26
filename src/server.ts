import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.js";
import { buildApp } from "./app.js";

export async function startServer() {
  const app = await buildApp();

  await app.listen({
    port: env.PORT,
    host: env.HOST,
  });

  return app;
}

const isDirectRun = process.argv[1]
  ? path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])
  : false;

if (isDirectRun) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
