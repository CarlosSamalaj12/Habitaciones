module.exports = {
  apps: [
    {
      name: "hk-sync",
      script: "server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
