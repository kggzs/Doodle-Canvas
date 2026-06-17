// -*- coding: utf-8 -*-
/**
 * AES-256-GCM 加解密工具
 * 用于 API Key 等敏感信息的加密存储
 * - 密钥与初始向量从环境变量读取
 * - encrypt 返回 { encrypted, authTag }（base64 编码）
 * - decrypt 接收密文与 authTag，返回原文
 */
import crypto from 'crypto';

// 从环境变量读取密钥（32 字节）与初始向量（16 字节）
const SECRET_KEY = process.env.AES_SECRET_KEY || 'dev_aes_secret_key_32bytes_change_me';
const IV = process.env.AES_IV || 'dev_aes_iv_16byte';

/**
 * 校验密钥与 IV 长度是否符合要求
 * @returns {{key: Buffer, iv: Buffer}} 规范化后的密钥与 IV
 */
function getKeyAndIv() {
  // 密钥必须为 32 字节（AES-256）
  const key = Buffer.from(SECRET_KEY, 'utf8');
  if (key.length !== 32) {
    // 长度不足时用 0 填充，超长时截断（仅开发环境容错，生产环境应严格配置）
    const padded = Buffer.alloc(32);
    key.copy(padded, 0, 0, Math.min(key.length, 32));
    return { key: padded, iv: getIv() };
  }
  return { key, iv: getIv() };
}

/**
 * 获取规范化后的 IV（16 字节）
 * @returns {Buffer} 16 字节初始向量
 */
function getIv() {
  const iv = Buffer.from(IV, 'utf8');
  if (iv.length === 16) return iv;
  // 长度不足时用 0 填充，超长时截断
  const padded = Buffer.alloc(16);
  iv.copy(padded, 0, 0, Math.min(iv.length, 16));
  return padded;
}

/**
 * AES-256-GCM 加密
 * @param {string} plaintext 待加密明文
 * @returns {{encrypted: string, authTag: string}} base64 编码的密文与认证标签
 */
export function encrypt(plaintext) {
  const { key, iv } = getKeyAndIv();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();
  return {
    encrypted: encrypted.toString('base64'),
    authTag: authTag.toString('base64')
  };
}

/**
 * AES-256-GCM 解密
 * @param {string} encrypted base64 编码的密文
 * @param {string} authTag base64 编码的认证标签
 * @returns {string} 解密后的原文
 */
export function decrypt(encrypted, authTag) {
  const { key, iv } = getKeyAndIv();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final()
  ]);
  return decrypted.toString('utf8');
}

export default { encrypt, decrypt };
