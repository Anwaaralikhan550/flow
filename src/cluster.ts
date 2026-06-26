import cluster from "node:cluster";
import os from "node:os";
import { env } from "./config/env.js";
import { startServer } from "./server.js";

if (!env.CLUSTER_ENABLED || process.env.NODE_ENV !== "production") {
  await startServer();
} else if (cluster.isPrimary) {
  const workerCount = Math.max(1, env.CLUSTER_WORKERS || os.cpus().length);
  console.log(`Primary ${process.pid} starting ${workerCount} workers`);

  for (let index = 0; index < workerCount; index += 1) {
    cluster.fork();
  }

  cluster.on("exit", (worker) => {
    console.warn(`Worker ${worker.process.pid} exited. Restarting.`);
    cluster.fork();
  });
} else {
  await startServer();
}
