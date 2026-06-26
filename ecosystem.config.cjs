module.exports = {
  apps: [
    {
      name: "safe-ai-session-backend",
      script: "dist/src/cluster.js",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        CLUSTER_ENABLED: "true",
        CLUSTER_WORKERS: "2",
      },
      exp_backoff_restart_delay: 100,
      kill_timeout: 5000,
      listen_timeout: 8000,
    },
    {
      name: "vidgen-landing",
      cwd: "./landing",
      script: ".next/standalone/server.js",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        HOSTNAME: "127.0.0.1",
        PORT: "3001",
      },
      exp_backoff_restart_delay: 100,
      kill_timeout: 5000,
      listen_timeout: 8000,
    },
  ],
};
