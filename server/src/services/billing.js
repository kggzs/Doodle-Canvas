// -*- coding: utf-8 -*-
/**
 * 计费服务
 * - 按模型读取 billing_rules
 * - 应用用户组 cost_multiplier
 * - 预扣生成费用，失败时退款
 */
import { Op, fn, col } from 'sequelize';

import db from '../models/index.js';
import * as CoinService from './coins.js';

const {
  BillingRule,
  CoinTransaction,
  GenerationRecord,
  ModelConfig,
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

function startOfMonth() {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
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

function amountFromParamRules(rule, payload = {}) {
  const paramRules = rule?.paramRules || {};
  if (!paramRules || typeof paramRules !== 'object') return null;

  for (const [paramName, tiers] of Object.entries(paramRules)) {
    if (!tiers || typeof tiers !== 'object' || Array.isArray(tiers)) continue;
    const rawValue = payload[paramName];
    if (rawValue === undefined || rawValue === null) continue;
    const value = String(rawValue);
    if (tiers[value] !== undefined) return toMoney(tiers[value]);
  }

  if (paramRules.default !== undefined) return toMoney(paramRules.default);
  return null;
}

function calculateBaseAmount(rule, payload = {}) {
  if (!rule || !rule.isActive) return 0;
  if (rule.ruleType === 'param_tiered') {
    const tierAmount = amountFromParamRules(rule, payload);
    if (tierAmount !== null) return tierAmount;
  }
  return toMoney(rule.fixedAmount);
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

  const baseAmount = calculateBaseAmount(rule, payload);
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
      rule_type: rule?.ruleType || 'none',
      rule_id: rule?.id || null
    }
  };
}

export async function checkQuota({ userId, group, finalCost }) {
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

  const coinLimitChecks = [
    {
      limit: Number(group.dailyCoinLimit || 0),
      since: startOfToday(),
      scope: 'daily'
    },
    {
      limit: Number(group.monthlyCoinLimit || 0),
      since: startOfMonth(),
      scope: 'monthly'
    }
  ];

  for (const check of coinLimitChecks) {
    if (check.limit <= 0) continue;
    const row = await CoinTransaction.findOne({
      where: {
        userId,
        type: 'consume',
        direction: 'out',
        createdAt: { [Op.gte]: check.since }
      },
      attributes: [[fn('SUM', col('amount')), 'amount']],
      raw: true
    });
    const consumed = Number(row?.amount || 0);
    if (toMoney(consumed + finalCost) > check.limit) {
      throw new BillingError(40202, check.scope === 'daily' ? '已达到今日金币消费上限' : '已达到本月金币消费上限', {
        limit: check.limit,
        consumed,
        required: finalCost
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
  const estimate = await estimateCost({ userId, modelId, modelKey, modelType, payload });
  await checkQuota({
    userId,
    group: estimate.group,
    finalCost: estimate.finalCost
  });

  if (estimate.finalCost <= 0) {
    return {
      ...estimate,
      transaction: null
    };
  }

  const result = await CoinService.transact({
    userId,
    type: 'consume',
    amount: estimate.finalCost,
    operatorId: userId,
    operatorType: 'user',
    refType: 'generation',
    refId: generationId,
    reasonCode: 'generation.consume',
    description: '模型生成消费',
    metadata: {
      model_id: estimate.model.id,
      model_key: estimate.model.modelKey,
      model_type: modelType
    },
    requestId: requestId || auditContext.requestId || null,
    clientIp: auditContext.ip || null,
    userAgent: auditContext.userAgent || null,
    costSnapshot: estimate.costBreakdown
  });

  return {
    ...estimate,
    transaction: result.transaction
  };
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

  const result = await CoinService.transact({
    userId,
    type: 'refund',
    amount,
    operatorType: 'system',
    refType: 'generation',
    refId: generationId,
    relatedTxId,
    reasonCode: 'generation.refund',
    description: reason,
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

export async function upsertRule(data = {}) {
  const model = await resolveModel({ modelId: data.modelId || data.model_id });
  const payload = {
    modelId: model.id,
    ruleType: data.ruleType || data.rule_type || 'fixed',
    fixedAmount: toMoney(data.fixedAmount ?? data.fixed_amount ?? 0),
    paramRules: data.paramRules ?? data.param_rules ?? null,
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
  if (data.ruleType !== undefined || data.rule_type !== undefined) payload.ruleType = data.ruleType || data.rule_type;
  if (data.fixedAmount !== undefined || data.fixed_amount !== undefined) payload.fixedAmount = toMoney(data.fixedAmount ?? data.fixed_amount);
  if (data.paramRules !== undefined || data.param_rules !== undefined) payload.paramRules = data.paramRules ?? data.param_rules;
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
  upsertRule,
  updateRule,
  deleteRule
};
