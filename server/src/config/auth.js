// -*- coding: utf-8 -*-
/**
 * JWT 认证配置
 * 从环境变量读取密钥与过期时间；缺少密钥时由 runtime-env 自动生成并持久化。
 */
import './runtime-env.js';

function resolveJwtSecret() {
  const secret = process.env.JWT_SECRET || '';
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('JWT_SECRET 为空或长度不足，自动生成失败');
  }
  return secret;
}

/**
 * JWT 配置对象
 * - secret：签名密钥
 * - accessExpires：Access Token 过期时间，默认 15 分钟
 * - refreshExpires：Refresh Token 过期时间，默认 7 天
 */
export const jwtConfig = {
  secret: resolveJwtSecret(),
  accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
  refreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d'
};

export default jwtConfig;
