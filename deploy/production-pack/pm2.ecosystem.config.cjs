module.exports = {
  apps: [
    {
      name: "smartwork-control-server",
      script: "app/smartwork-control-server.mjs",
      cwd: "/opt/smartwork-agent",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: "3107",
        SMARTWORK_DRY_RUN: "true",
        SMARTWORK_NO_SIAGA_INPUT: "true",
        SMARTWORK_NO_BROWSER_OPEN: "true",
        SMARTWORK_NO_REAL_SAVE: "true",
        SMARTWORK_NO_REAL_SEND: "true",
        SMARTWORK_REAL_SAVE_ENABLED: "false"
      }
    },
    {
      name: "smartwork-production-worker",
      script: "scripts/smartwork-production-worker.mjs",
      args: "--daemon --dry-run",
      cwd: "/opt/smartwork-agent",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        SMARTWORK_DRY_RUN: "true",
        SMARTWORK_NO_SIAGA_INPUT: "true",
        SMARTWORK_NO_BROWSER_OPEN: "true",
        SMARTWORK_NO_REAL_SAVE: "true",
        SMARTWORK_NO_REAL_SEND: "true",
        SMARTWORK_REAL_SAVE_ENABLED: "false",
        SMARTWORK_WORKER_INTERVAL_MS: "1000"
      }
    }
  ]
};

