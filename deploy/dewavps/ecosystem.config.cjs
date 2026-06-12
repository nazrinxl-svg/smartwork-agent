module.exports = {
  apps: [
    {
      name: "smartwork-control-server",
      cwd: "/opt/smartwork-agent",
      script: "app/smartwork-control-server.mjs",
      env_file: "/opt/smartwork-agent/.env.production",
      autorestart: true,
      max_restarts: 20
    },
    {
      name: "smartwork-production-worker",
      cwd: "/opt/smartwork-agent",
      script: "scripts/smartwork-production-worker.mjs",
      env_file: "/opt/smartwork-agent/.env.production",
      autorestart: true,
      max_restarts: 20
    }
  ]
};
