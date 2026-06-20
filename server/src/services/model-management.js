// -*- coding: utf-8 -*-
/**
 * 模型与渠道管理服务
 * - 管理 model_channels / models / model_channel_bindings
 * - API Key 仅加密存储，接口响应不返回明文或密文
 * - 用户侧模型列表只返回已启用且至少存在一个可用渠道的模型
 */
import axios from 'axios';
import { Op, Sequelize } from 'sequelize';

import db from '../models/index.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { safeJsonParse } from '../utils/helpers.js';
import { logger } from '../utils/logger.js';

const { GenerationRecord, ModelChannel, ModelConfig, ModelChannelBinding } = db;

const PROVIDER_TYPES = ['openai', 'aliyun', 'doubao', 'stepfun', 'agnes', 'custom'];
const MODEL_TYPES = ['image', 'video', 'chat'];
const ROTATION_STRATEGIES = ['round_robin', 'weighted_random', 'priority', 'failover'];

export class ModelManagementError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}

function normalizePage(page = 1, pageSize = 20) {
  const limit = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 100);
  const currentPage = Math.max(parseInt(page, 10) || 1, 1);
  return {
    page: currentPage,
    pageSize: limit,
    offset: (currentPage - 1) * limit
  };
}

function normalizeBoolean(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
}

function encryptApiKey(apiKey) {
  const payload = encrypt(String(apiKey || ''));
  return JSON.stringify(payload);
}

export function decryptApiKey(encryptedApiKey) {
  const payload = safeJsonParse(encryptedApiKey, null);
  if (!payload?.encrypted || !payload?.authTag) {
    throw new ModelManagementError(50001, '渠道 API Key 加密数据格式无效');
  }
  return decrypt(payload.encrypted, payload.authTag, payload.iv || null);
}

function ensureProviderType(providerType) {
  if (!PROVIDER_TYPES.includes(providerType)) {
    throw new ModelManagementError(42201, '不支持的 provider_type');
  }
}

function ensureModelType(modelType) {
  if (!MODEL_TYPES.includes(modelType)) {
    throw new ModelManagementError(42201, '不支持的 model_type');
  }
}

function ensureRotationStrategy(rotationStrategy) {
  if (!ROTATION_STRATEGIES.includes(rotationStrategy)) {
    throw new ModelManagementError(42201, '不支持的 rotation_strategy');
  }
}

function sanitizeChannel(channel) {
  if (!channel) return null;
  const plain = typeof channel.toJSON === 'function' ? channel.toJSON() : { ...channel };
  const encryptedApiKey = plain.apiKey || plain.api_key || channel.apiKey;
  delete plain.apiKey;
  delete plain.api_key;
  plain.apiKeyConfigured = Boolean(encryptedApiKey);
  plain.apiKeyValid = false;
  if (encryptedApiKey) {
    try {
      plain.apiKeyValid = Boolean(decryptApiKey(encryptedApiKey));
    } catch {
      plain.apiKeyValid = false;
    }
  }
  return plain;
}

function sanitizeBinding(binding) {
  const plain = typeof binding.toJSON === 'function' ? binding.toJSON() : { ...binding };
  if (plain.channel) {
    plain.channel = sanitizeChannel(plain.channel);
  }
  return plain;
}

function publicModel(model) {
  const plain = typeof model.toJSON === 'function' ? model.toJSON() : { ...model };
  const channels = plain.channels || [];
  const matchingChannels = channels.filter((channel) => channel.modelType === plain.modelType);
  const providers = [...new Set(matchingChannels
    .map((channel) => channel.providerType)
    .filter(Boolean))];
  delete plain.channels;
  return {
    ...plain,
    providers,
    availableChannels: matchingChannels.length
  };
}

async function requireModel(id) {
  const model = await ModelConfig.findByPk(id);
  if (!model) {
    throw new ModelManagementError(40402, '模型不存在');
  }
  return model;
}

async function requireChannel(id) {
  const channel = await ModelChannel.findByPk(id);
  if (!channel) {
    throw new ModelManagementError(40402, '渠道不存在');
  }
  return channel;
}

// ============================
// 渠道管理
// ============================

export async function listChannels(params = {}) {
  const { page, pageSize, offset } = normalizePage(params.page, params.pageSize);
  const where = {};

  if (params.providerType) {
    ensureProviderType(params.providerType);
    where.providerType = params.providerType;
  }
  if (params.modelType) {
    ensureModelType(params.modelType);
    where.modelType = params.modelType;
  }
  const active = normalizeBoolean(params.isActive);
  if (active !== undefined) {
    where.isActive = active;
  }
  if (params.keyword) {
    where.name = { [Op.like]: `%${params.keyword}%` };
  }

  const { rows, count } = await ModelChannel.findAndCountAll({
    where,
    order: [
      ['priority', 'ASC'],
      ['createdAt', 'DESC']
    ],
    limit: pageSize,
    offset
  });

  return {
    items: rows.map(sanitizeChannel),
    total: count,
    page,
    pageSize
  };
}

export async function createChannel(data) {
  ensureProviderType(data.providerType);
  ensureModelType(data.modelType);
  if (!data.apiKey) {
    throw new ModelManagementError(42201, 'api_key 不能为空');
  }

  const channel = await ModelChannel.create({
    name: data.name,
    providerType: data.providerType,
    modelType: data.modelType,
    apiBaseUrl: data.apiBaseUrl,
    apiKey: encryptApiKey(data.apiKey),
    isActive: normalizeBoolean(data.isActive) ?? true,
    priority: data.priority ?? 0,
    weight: data.weight ?? 1,
    maxConcurrent: data.maxConcurrent ?? 10,
    timeoutMs: data.timeoutMs ?? 60000,
    config: data.config ?? null
  });

  return sanitizeChannel(channel);
}

export async function updateChannel(id, data) {
  const channel = await requireChannel(id);
  const payload = {};

  if (data.name !== undefined) payload.name = data.name;
  if (data.providerType !== undefined) {
    ensureProviderType(data.providerType);
    payload.providerType = data.providerType;
  }
  if (data.modelType !== undefined) {
    ensureModelType(data.modelType);
    payload.modelType = data.modelType;
  }
  if (data.apiBaseUrl !== undefined) payload.apiBaseUrl = data.apiBaseUrl;
  if (data.apiKey !== undefined && data.apiKey !== '') payload.apiKey = encryptApiKey(data.apiKey);
  if (data.isActive !== undefined) payload.isActive = normalizeBoolean(data.isActive);
  if (data.priority !== undefined) payload.priority = data.priority;
  if (data.weight !== undefined) payload.weight = data.weight;
  if (data.maxConcurrent !== undefined) payload.maxConcurrent = data.maxConcurrent;
  if (data.timeoutMs !== undefined) payload.timeoutMs = data.timeoutMs;
  if (data.config !== undefined) payload.config = data.config;

  if (payload.modelType && payload.modelType !== channel.modelType) {
    const bindings = await ModelChannelBinding.findAll({
      where: { channelId: id },
      include: [{ model: ModelConfig, as: 'model' }]
    });
    if (bindings.some((binding) => binding.model?.modelType !== payload.modelType)) {
      throw new ModelManagementError(42201, '渠道已绑定其他类型模型，不能直接切换用途');
    }
  }

  await channel.update(payload);
  return sanitizeChannel(channel);
}

export async function deleteChannel(id) {
  const channel = await requireChannel(id);
  const generationCount = await GenerationRecord.count({ where: { channelId: id } });
  await db.sequelize.transaction(async (transaction) => {
    await ModelChannelBinding.destroy({ where: { channelId: id }, transaction });
    if (generationCount > 0) {
      await channel.update({ isActive: false }, { transaction });
    } else {
      await channel.destroy({ transaction });
    }
  });
  return generationCount > 0 ? { deleted: false, disabled: true } : { deleted: true };
}

export async function getChannelStats(id) {
  const channel = await requireChannel(id);
  return {
    id: channel.id,
    name: channel.name,
    providerType: channel.providerType,
    totalRequests: channel.totalRequests,
    successCount: channel.successCount,
    failCount: channel.failCount,
    lastUsedAt: channel.lastUsedAt,
    lastFailAt: channel.lastFailAt,
    circuitOpen: channel.circuitOpen,
    circuitOpenAt: channel.circuitOpenAt
  };
}

export async function resetChannelCircuit(id) {
  const channel = await requireChannel(id);
  await channel.update({
    circuitOpen: false,
    circuitOpenAt: null
  });
  return sanitizeChannel(channel);
}

export async function testChannel(id) {
  const channel = await requireChannel(id);
  const startedAt = Date.now();

  try {
    const apiKey = decryptApiKey(channel.apiKey);
    const response = await axios.get(channel.apiBaseUrl, {
      timeout: Math.min(channel.timeoutMs || 10000, 10000),
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      validateStatus: () => true
    });

    return {
      ok: response.status < 500,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      message: response.status < 500 ? '渠道地址可访问' : '渠道地址返回服务端错误'
    };
  } catch (err) {
    logger.warn(`渠道连通性测试失败：${err.message}`, { channelId: id });
    return {
      ok: false,
      status: null,
      latencyMs: Date.now() - startedAt,
      message: err.message
    };
  }
}

// ============================
// 模型管理
// ============================

export async function listModelConfigs(params = {}) {
  const { page, pageSize, offset } = normalizePage(params.page, params.pageSize);
  const where = {};

  if (params.modelType) {
    ensureModelType(params.modelType);
    where.modelType = params.modelType;
  }
  const active = normalizeBoolean(params.isActive);
  if (active !== undefined) {
    where.isActive = active;
  }
  if (params.keyword) {
    where[Op.or] = [
      { modelKey: { [Op.like]: `%${params.keyword}%` } },
      { displayName: { [Op.like]: `%${params.keyword}%` } }
    ];
  }

  const { rows, count } = await ModelConfig.findAndCountAll({
    where,
    order: [
      ['modelType', 'ASC'],
      ['sortOrder', 'ASC'],
      ['createdAt', 'DESC']
    ],
    limit: pageSize,
    offset
  });

  return {
    items: rows,
    total: count,
    page,
    pageSize
  };
}

export async function createModelConfig(data) {
  ensureModelType(data.modelType);
  if (data.channelId) {
    const channel = await requireChannel(data.channelId);
    if (channel.modelType !== data.modelType) {
      throw new ModelManagementError(42201, '模型只能绑定同类型渠道');
    }
  }
  if (data.rotationStrategy !== undefined) {
    ensureRotationStrategy(data.rotationStrategy);
  }

  try {
    return await db.sequelize.transaction(async (transaction) => {
      const model = await ModelConfig.create({
        modelKey: data.modelKey,
        displayName: data.displayName,
        modelType: data.modelType,
        isActive: normalizeBoolean(data.isActive) ?? true,
        defaultParams: data.defaultParams ?? null,
        maxParams: data.maxParams ?? null,
        sortOrder: data.sortOrder ?? 0,
        description: data.description ?? null
      }, { transaction });

      if (data.channelId) {
        await ModelChannelBinding.create({
          modelId: model.id,
          channelId: data.channelId,
          rotationWeight: data.rotationWeight ?? 1,
          rotationStrategy: data.rotationStrategy ?? 'round_robin',
          isActive: true
        }, { transaction });
      }

      return model;
    });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw new ModelManagementError(40931, '模型标识已存在');
    }
    throw err;
  }
}

export async function updateModelConfig(id, data) {
  const model = await requireModel(id);
  const payload = {};

  if (data.modelKey !== undefined) payload.modelKey = data.modelKey;
  if (data.displayName !== undefined) payload.displayName = data.displayName;
  if (data.modelType !== undefined) {
    ensureModelType(data.modelType);
    payload.modelType = data.modelType;
  }
  if (data.isActive !== undefined) payload.isActive = normalizeBoolean(data.isActive);
  if (data.defaultParams !== undefined) payload.defaultParams = data.defaultParams;
  if (data.maxParams !== undefined) payload.maxParams = data.maxParams;
  if (data.sortOrder !== undefined) payload.sortOrder = data.sortOrder;
  if (data.description !== undefined) payload.description = data.description;

  try {
    if (payload.modelType && payload.modelType !== model.modelType) {
      const bindings = await ModelChannelBinding.findAll({
        where: { modelId: id },
        include: [{ model: ModelChannel, as: 'channel' }]
      });
      if (bindings.some((binding) => binding.channel?.modelType !== payload.modelType)) {
        throw new ModelManagementError(42201, '模型已绑定其他类型渠道，不能直接切换类型');
      }
    }
    await model.update(payload);
    return model;
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw new ModelManagementError(40931, '模型标识已存在');
    }
    throw err;
  }
}

export async function deleteModelConfig(id) {
  const model = await requireModel(id);
  const generationCount = await GenerationRecord.count({ where: { modelId: id } });
  await db.sequelize.transaction(async (transaction) => {
    await ModelChannelBinding.destroy({ where: { modelId: id }, transaction });
    if (generationCount > 0) {
      await model.update({ isActive: false }, { transaction });
    } else {
      await model.destroy({ transaction });
    }
  });
  return generationCount > 0 ? { deleted: false, disabled: true } : { deleted: true };
}

export async function setModelStatus(id, isActive) {
  const model = await requireModel(id);
  await model.update({ isActive: normalizeBoolean(isActive) });
  return model;
}

export async function getModelConfig(id) {
  const model = await ModelConfig.findByPk(id, {
    include: [
      {
        model: ModelChannel,
        as: 'channels',
        attributes: { exclude: ['apiKey', 'api_key'] },
        through: {
          attributes: ['id', 'rotationWeight', 'rotationStrategy', 'isActive', 'lastUsedIndex', 'createdAt']
        }
      }
    ]
  });
  if (!model) {
    throw new ModelManagementError(40402, '模型不存在');
  }
  return model;
}

// ============================
// 绑定管理
// ============================

export async function listModelBindings(modelId) {
  await requireModel(modelId);
  const bindings = await ModelChannelBinding.findAll({
    where: { modelId },
    include: [
      {
        model: ModelChannel,
        as: 'channel'
      }
    ],
    order: [
      [Sequelize.literal('`channel`.`priority`'), 'ASC'],
      ['createdAt', 'DESC']
    ]
  });

  return bindings.map(sanitizeBinding);
}

export async function addModelBinding(modelId, data) {
  const model = await requireModel(modelId);
  const channel = await requireChannel(data.channelId);
  if (model.modelType !== channel.modelType) {
    throw new ModelManagementError(42201, '模型只能绑定同类型渠道');
  }

  if (data.rotationStrategy !== undefined) {
    ensureRotationStrategy(data.rotationStrategy);
  }

  try {
    const binding = await ModelChannelBinding.create({
      modelId,
      channelId: data.channelId,
      rotationWeight: data.rotationWeight ?? 1,
      rotationStrategy: data.rotationStrategy ?? 'round_robin',
      isActive: normalizeBoolean(data.isActive) ?? true
    });
    return binding;
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw new ModelManagementError(40932, '该模型已绑定此渠道');
    }
    throw err;
  }
}

export async function updateModelBinding(modelId, bindingId, data) {
  await requireModel(modelId);
  const binding = await ModelChannelBinding.findOne({
    where: { id: bindingId, modelId }
  });
  if (!binding) {
    throw new ModelManagementError(40402, '绑定关系不存在');
  }

  const payload = {};
  if (data.rotationWeight !== undefined) payload.rotationWeight = data.rotationWeight;
  if (data.rotationStrategy !== undefined) {
    ensureRotationStrategy(data.rotationStrategy);
    payload.rotationStrategy = data.rotationStrategy;
  }
  if (data.isActive !== undefined) payload.isActive = normalizeBoolean(data.isActive);
  if (data.lastUsedIndex !== undefined) payload.lastUsedIndex = data.lastUsedIndex;

  await binding.update(payload);
  return binding;
}

export async function removeModelBinding(modelId, bindingId) {
  await requireModel(modelId);
  const binding = await ModelChannelBinding.findOne({
    where: { id: bindingId, modelId }
  });
  if (!binding) {
    throw new ModelManagementError(40402, '绑定关系不存在');
  }
  await binding.destroy();
  return { deleted: true };
}

// ============================
// 用户侧模型列表
// ============================

export async function listPublicModels(type = null) {
  const where = { isActive: true };
  if (type) {
    ensureModelType(type);
    where.modelType = type;
  }

  const rows = await ModelConfig.findAll({
    where,
    include: [
      {
        model: ModelChannel,
        as: 'channels',
        attributes: ['id', 'providerType', 'modelType'],
        where: {
          isActive: true,
          circuitOpen: false,
          [Op.and]: Sequelize.where(
            Sequelize.col('channels.model_type'),
            Sequelize.col('ModelConfig.model_type')
          )
        },
        through: {
          attributes: ['id', 'rotationWeight', 'rotationStrategy'],
          where: { isActive: true }
        },
        required: true
      }
    ],
    order: [
      ['modelType', 'ASC'],
      ['sortOrder', 'ASC'],
      ['displayName', 'ASC']
    ]
  });

  const items = rows.map(publicModel);
  if (type) {
    return { items, total: items.length };
  }

  return items.reduce((grouped, item) => {
    if (!grouped[item.modelType]) grouped[item.modelType] = [];
    grouped[item.modelType].push(item);
    return grouped;
  }, { image: [], video: [], chat: [] });
}

export async function getPublicModel(idOrKey) {
  const model = await ModelConfig.findOne({
    where: {
      isActive: true,
      [Op.or]: [
        { id: idOrKey },
        { modelKey: idOrKey }
      ]
    },
    include: [
      {
        model: ModelChannel,
        as: 'channels',
        attributes: ['id', 'providerType', 'modelType'],
        where: {
          isActive: true,
          circuitOpen: false,
          [Op.and]: Sequelize.where(
            Sequelize.col('channels.model_type'),
            Sequelize.col('ModelConfig.model_type')
          )
        },
        through: {
          attributes: ['id', 'rotationWeight', 'rotationStrategy'],
          where: { isActive: true }
        },
        required: true
      }
    ]
  });

  if (!model) {
    throw new ModelManagementError(40402, '模型不存在或暂不可用');
  }
  return publicModel(model);
}

export default {
  ModelManagementError,
  listChannels,
  createChannel,
  updateChannel,
  deleteChannel,
  getChannelStats,
  resetChannelCircuit,
  testChannel,
  listModelConfigs,
  createModelConfig,
  updateModelConfig,
  deleteModelConfig,
  setModelStatus,
  getModelConfig,
  listModelBindings,
  addModelBinding,
  updateModelBinding,
  removeModelBinding,
  listPublicModels,
  getPublicModel,
  decryptApiKey
};
