// -*- coding: utf-8 -*-
/**
 * 创建或更新管理员账号
 *
 * 用法：
 *   npm run create-admin -- --email admin@example.com --username admin --password Admin123456
 *
 * 也支持环境变量：
 *   ADMIN_EMAIL / ADMIN_USERNAME / ADMIN_PASSWORD
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';

import { sequelize } from '../config/database.js';
import User from '../models/User.js';

function getArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

const email = getArg('email') || process.env.ADMIN_EMAIL;
const username = getArg('username') || process.env.ADMIN_USERNAME || 'admin';
const password = getArg('password') || process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error('缺少参数：--email 与 --password 必填');
  console.error('示例：npm run create-admin -- --email admin@example.com --username admin --password Admin123456');
  process.exit(1);
}

if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
  console.error('密码至少 8 位，且需同时包含字母和数字');
  process.exit(1);
}

try {
  await sequelize.authenticate();
  const passwordHash = await bcrypt.hash(password, 12);
  let user = await User.findByEmail(email);

  if (user) {
    await user.update({
      username,
      passwordHash,
      role: 'admin',
      status: 'active',
      emailVerifiedAt: user.emailVerifiedAt || new Date()
    });
    console.log(`管理员账号已更新：${email}`);
  } else {
    user = await User.create({
      username,
      email,
      passwordHash,
      role: 'admin',
      status: 'active',
      emailVerifiedAt: new Date(),
      registerSource: 'create-admin-script'
    });
    console.log(`管理员账号已创建：${email}`);
  }
} finally {
  await sequelize.close();
}
