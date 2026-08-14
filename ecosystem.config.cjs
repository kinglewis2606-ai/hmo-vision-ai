module.exports = {
  apps: [
    {
      name: "hmo-vision-ai",
      cwd: __dirname,
      script: "npm",
      args: "start -- -H 127.0.0.1 -p 3000",
      env: {
        NODE_ENV: "production",
      },
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      time: true,
    },
  ],
};
