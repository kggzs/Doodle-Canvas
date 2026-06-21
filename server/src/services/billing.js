// -*- coding: utf-8 -*-
/**
 * 计费服务
 * - 按模型读取 billing_rules
 * - 应用用户组 cost_multiplier：最终费用 = 模型价格 * 倍率
 * - 预扣生成费用，失败时退款
 */
import { Op } from 'sequelize';

import db from '../models/index.js';
import * as CoinService from './coins.js';

const {
  BillingRule,
  GenerationRecord,
  ModelChannel,
  ModelConfig,
  Project,
  UserGroup,
  UserGroupMember
} = db;

export class BillingError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}

function toMoney(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

async function withUserBillingLock(userId, fn) {
  const lockKey = `billing:${userId}`.slice(0, 64);
  const timeoutSeconds = Math.min(Math.max(parseInt(process.env.BILLING_LOCK_TIMEOUT_SECONDS || '5', 10), 1), 30);

  return db.sequelize.transaction(async (transaction) => {
    const [rows] = await db.sequelize.query('SELECT GET_LOCK(?, ?) AS locked', {
      replacements: [lockKey, timeoutSeconds],
      transaction
    });
    if (Number(rows?.[0]?.locked || 0) !== 1) {
      throw new BillingError(40901, '用户计费处理中，请稍后再试');
    }

    try {
      return await fn();
    } finally {
      await db.sequelize.query('SELECT RELEASE_LOCK(?)', {
        replacements: [lockKey],
        transaction
      });
    }
  });
}

async function resolveModel({ modelId, modelKey, modelType }) {
  const where = {};
  if (modelId) {
    where[Op.or] = [{ id: modelId }, { modelKey: modelId }];
  } else if (modelKey) {
    where.modelKey = modelKey;
  } else {
    throw new BillingError(42201, 'model 不能为空');
  }
  if (modelType) where.modelType = modelType;

  const model = await ModelConfig.findOne({ where });
  if (!model) {
    throw new BillingError(40402, '模型不存在');
  }
  return model;
}

function defaultAmountForModelType(modelType) {
  const envKey = `DEFAULT_${String(modelType || '').toUpperCase()}_COST`;
  const configured = process.env[envKey] ?? process.env.DEFAULT_GENERATION_COST;
  if (configured !== undefined) return toMoney(configured);
  return modelType === 'image' ? 1 : 0;
}

function calculateBaseAmount(rule, payload = {}, modelType = null) {
  if (!rule || !rule.isActive) return defaultAmountForModelType(modelType);
  const amount = toMoney(rule.fixedAmount);
  const minimumAmount = defaultAmountForModelType(modelType);
  return modelType === 'image' && amount <= 0 ? minimumAmount : amount;
}

function modelTypeLabel(modelType) {
  const labels = {
    image: '图片生成',
    video: '视频生成',
    chat: '问答生成'
  };
  return labels[modelType] || '模型生成';
}

function promptSnippet(payload = {}) {
  const prompt = payload.prompt
    || (Array.isArray(payload.messages)
      ? payload.messages
          .filter((item) => item?.role === 'user')
          .map((item) => (typeof item.content === 'string' ? item.content : JSON.stringify(item.content)))
          .join('\n')
      : '');
  return prompt ? String(prompt).slice(0, 300) : null;
}

async function projectContext(userId, projectId) {
  if (!projectId) return null;
  return Project.findOne({
    where: { id: projectId, userId },
    attributes: ['id', 'name']
  });
}

function generationDescription({ action, modelType, model, project }) {
  const parts = [action || modelTypeLabel(modelType)];
  if (project?.name) parts.push(`项目「${project.name}」`);
  const modelName = model?.displayName || model?.modelKey;
  if (modelName) parts.push(`模型「${modelName}」`);
  return parts.join(' / ');
}

export async function getEffectiveGroup(userId) {
  const memberships = await UserGroupMember.findAll({
    where: {
      userId,
      [Op.or]: [
        { expiresAt: null },
        { expiresAt: { [Op.gt]: new Date() } }
      ]
    },
    include: [
      {
        model: UserGroup,
        as: 'group',
        where: { isActive: true },
        required: true
      }
    ],
    order: [
      [{ model: UserGroup, as: 'group' }, 'priority', 'DESC'],
      [{ model: UserGroup, as: 'group' }, 'costMultiplier', 'ASC'],
      ['joinedAt', 'ASC']
    ]
  });

  if (memberships.length) return memberships[0].group;

  return UserGroup.findOne({
    where: { isDefault: true, isActive: true },
    order: [['priority', 'DESC']]
  });
}

export async function estimateCost({ userId, modelId, modelKey, modelType, payload = {} }) {
  const model = await resolveModel({ modelId, modelKey, modelType });
  const [rule, group] = await Promise.all([
    BillingRule.findOne({ where: { modelId: model.id, isActive: true } }),
    getEffectiveGroup(userId)
  ]);

  const baseAmount = calculateBaseAmount(rule, payload, model.modelType);
  const multiplier = Number(group?.costMultiplier || 1);
  const finalCost = toMoney(baseAmount * multiplier);
  const groupSnapshot = group
    ? {
        id: group.id,
        code: group.code,
        name: group.name,
        cost_multiplier: multiplier
      }
    : null;

  return {
    model,
    rule,
    group,
    baseAmount,
    multiplier,
    finalCost,
    costBreakdown: {
      model_price: baseAmount,
      cost_multiplier: multiplier,
      group: groupSnapshot?.code || null,
      final_cost: finalCost,
      rule_type: rule ? 'fixed' : 'default',
      rule_id: rule?.id || null
    }
  };
}

export async function checkQuota({ userId, group }) {
  if (!group) return;

  if (Number(group.dailyGenerateLimit || 0) > 0) {
    const count = await GenerationRecord.count({
      where: {
        userId,
        createdAt: { [Op.gte]: startOfToday() },
        status: { [Op.ne]: 'failed' }
      }
    });
    if (count >= Number(group.dailyGenerateLimit)) {
      throw new BillingError(40202, '已达到今日生成次数上限', {
        limit: Number(group.dailyGenerateLimit)
      });
    }
  }
}

export async function chargeForGeneration({
  userId,
  generationId,
  modelId,
  modelKey,
  modelType,
  payload = {},
  auditContext = {},
  requestId = null
}) {
  return withUserBillingLock(userId, async () => {
    const estimate = await estimateCost({ userId, modelId, modelKey, modelType, payload });
    await checkQuota({
      userId,
      group: estimate.group
    });

    if (estimate.finalCost <= 0) {
      return {
        ...estimate,
        transaction: null
      };
    }

    const projectId = payload.project_id || payload.projectId || null;
    const project = await projectContext(userId, projectId);
    const contextMetadata = {
      generation_id: generationId,
      project_id: project?.id || null,
      project_name: project?.name || null,
      model_id: estimate.model.id,
      model_key: estimate.model.modelKey,
      model_display_name: estimate.model.displayName,
      model_type: modelType,
      prompt: promptSnippet(payload)
    };

    const result = await CoinService.transact({
      userId,
      type: 'consume',
      amount: estimate.finalCost,
      operatorId: userId,
      operatorType: 'user',
      refType: 'generation',
      refId: generationId,
      reasonCode: 'generation.consume',
      description: generationDescription({
        action: `${modelTypeLabel(modelType)}消费`,
        modelType,
        model: estimate.model,
        project
      }),
      metadata: {
        ...contextMetadata
      },
      requestId: requestId || auditContext.requestId || null,
      clientIp: auditContext.ip || null,
      userAgent: auditContext.userAgent || null,
      costSnapshot: {
        ...estimate.costBreakdown,
        project: project ? { id: project.id, name: project.name } : null,
        model: {
          id: estimate.model.id,
          key: estimate.model.modelKey,
          name: estimate.model.displayName,
          type: estimate.model.modelType
        }
      }
    });

    return {
      ...estimate,
      transaction: result.transaction
    };
  });
}

export async function refundGeneration({
  userId,
  generationId,
  amount,
  relatedTxId = null,
  auditContext = {},
  requestId = null,
  reason = '生成失败自动退款'
}) {
  if (toMoney(amount) <= 0) return null;

  const record = await GenerationRecord.findByPk(generationId, {
    include: [
      { model: Project, as: 'project', attributes: ['id', 'name'], required: false },
      { model: ModelConfig, as: 'model', attributes: ['id', 'modelKey', 'displayName', 'modelType'], required: false }
    ]
  });
  const metadata = {
    generation_id: generationId,
    project_id: record?.project?.id || record?.projectId || null,
    project_name: record?.project?.name || null,
    model_id: record?.model?.id || record?.modelId || null,
    model_key: record?.model?.modelKey || null,
    model_display_name: record?.model?.displayName || null,
    model_type: record?.type || null
  };

  const result = await CoinService.transact({
    userId,
    type: 'refund',
    amount,
    operatorType: 'system',
    refType: 'generation',
    refId: generationId,
    relatedTxId,
    reasonCode: 'generation.refund',
    description: generationDescription({
      action: reason,
      modelType: record?.type,
      model: record?.model,
      project: record?.project
    }),
    metadata,
    requestId: requestId || auditContext.requestId || null,
    clientIp: auditContext.ip || null,
    userAgent: auditContext.userAgent || null
  });

  return result.transaction;
}

export async function listRules(params = {}) {
  const pageSize = Math.min(Math.max(parseInt(params.pageSize, 10) || 20, 1), 100);
  const page = Math.max(parseInt(params.page, 10) || 1, 1);
  const where = {};
  if (params.modelId) where.modelId = params.modelId;
  if (params.isActive !== undefined) where.isActive = params.isActive;

  const { rows, count } = await BillingRule.findAndCountAll({
    where,
    include: [{ model: ModelConfig, as: 'model' }],
    order: [['updatedAt', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize
  });

  return { items: rows, total: count, page, pageSize };
}

export async function listPublicPricing(userId) {
  const group = userId ? await getEffectiveGroup(userId) : null;
  const multiplier = Number(group?.costMultiplier || 1);
  const rows = await ModelConfig.findAll({
    where: { isActive: true },
    include: [
      {
        model: BillingRule,
        as: 'billingRule',
        where: { isActive: true },
        required: false
      },
      {
        model: ModelChannel,
        as: 'channels',
        attributes: ['id'],
        through: { attributes: [], where: { isActive: true } },
        where: { isActive: true, circuitOpen: false },
        required: false
      }
    ],
    order: [
      ['modelType', 'ASC'],
      ['sortOrder', 'ASC'],
      ['displayName', 'ASC']
    ]
  });

  const items = rows.map((model) => {
    const rule = model.billingRule || null;
    const baseAmount = calculateBaseAmount(rule, {}, model.modelType);
    return {
      id: model.id,
      model_key: model.modelKey,
      display_name: model.displayName,
      model_type: model.modelType,
      description: model.description,
      available_channels: Array.isArray(model.channels) ? model.channels.length : 0,
      rule: rule ? {
        id: rule.id,
        rule_type: rule.ruleType,
        fixed_amount: Number(rule.fixedAmount || 0)
      } : null,
      base_amount: baseAmount,
      cost_multiplier: multiplier,
      final_cost: toMoney(baseAmount * multiplier)
    };
  });

  return {
    items,
    total: items.length,
    group: group ? {
      id: group.id,
      code: group.code,
      name: group.name,
      cost_multiplier: multiplier
    } : null
  };
}

export async function upsertRule(data = {}) {
  const model = await resolveModel({ modelId: data.modelId || data.model_id });
  const payload = {
    modelId: model.id,
    ruleType: 'fixed',
    fixedAmount: toMoney(data.fixedAmount ?? data.fixed_amount ?? 0),
    paramRules: null,
    isActive: data.isActive ?? data.is_active ?? true
  };

  const existing = await BillingRule.findOne({ where: { modelId: model.id } });
  if (existing) {
    await existing.update(payload);
    return existing.reload({ include: [{ model: ModelConfig, as: 'model' }] });
  }

  return BillingRule.create(payload);
}

export async function updateRule(id, data = {}) {
  const rule = await BillingRule.findByPk(id);
  if (!rule) throw new BillingError(40402, '计费规则不存在');

  const payload = {};
  payload.ruleType = 'fixed';
  payload.paramRules = null;
  if (data.fixedAmount !== undefined || data.fixed_amount !== undefined) payload.fixedAmount = toMoney(data.fixedAmount ?? data.fixed_amount);
  if (data.isActive !== undefined || data.is_active !== undefined) payload.isActive = data.isActive ?? data.is_active;

  await rule.update(payload);
  return rule.reload({ include: [{ model: ModelConfig, as: 'model' }] });
}

export async function deleteRule(id) {
  const rule = await BillingRule.findByPk(id);
  if (!rule) throw new BillingError(40402, '计费规则不存在');
  await rule.destroy();
  return { deleted: true };
}

export default {
  BillingError,
  estimateCost,
  getEffectiveGroup,
  checkQuota,
  chargeForGeneration,
  refundGeneration,
  listRules,
  listPublicPricing,
  upsertRule,
  updateRule,
  deleteRule
};
