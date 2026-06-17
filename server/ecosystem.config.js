// PM2 进程管理配置
// 启动：pm2 start ecosystem.config.js --env production
export default {
  apps: [
    {
      name: 'doodle-canvas-server',
      script: 'src/app.js',
      cwd: './',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      merge_logs: true
    }
  ]
};
