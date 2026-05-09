module.exports = {
  apps: [
    {
      name: "planote",
      script: "./server.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3002,
      },
      env_file: ".env.production",
      max_memory_restart: "300M",
      restart_delay: 2000,
      autorestart: true,
      watch: false,
    },
  ],
};
