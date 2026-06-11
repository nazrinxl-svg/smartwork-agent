module.exports = {
  apps: [
    {
      name: "smartwork-production-worker",
      script: "scripts/smartwork-production-worker.mjs",
      args: "--daemon",
      cwd: "/opt/smartwork-agent",
      interpreter: "node",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "700M",
      env: {
        SMARTWORK_RUNTIME: "production-worker",
        SMARTWORK_NODE_ENV: "production",
        SMARTWORK_DRY_RUN: "true",
        SMARTWORK_REAL_SAVE_ENABLED: "false",
        SMARTWORK_REAL_SEND_ENABLED: "false"
      }
    }
  ]
};
