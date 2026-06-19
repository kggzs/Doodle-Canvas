// -*- coding: utf-8 -*-
/**
 * JWT 认证配置
 * 从环境变量读取密钥与过期时间
 */

const DEFAULT_JWT_SECRET = 'dev_jwt_secret_change_me_in_production';

function resolveJwtSecret() {
  const secret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET || secret === DEFAULT_JWT_SECRET || Buffer.byteLength(secret, 'utf8') < 32) {
      throw new Error('生产环境必须配置长度不少于 32 字节的 JWT_SECRET');
    }
  }
  return secret;
}

/**
 * JWT 配置对象
 * - secret：签名密钥（生产环境必须从环境变量注入）
 * - accessExpires：Access Token 过期时间，默认 15 分钟
 * - refreshExpires：Refresh Token 过期时间，默认 7 天
 */
export const jwtConfig = {
  secret: resolveJwtSecret(),
  accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
  refreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d'
};

export default jwtConfig;
