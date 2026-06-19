// -*- coding: utf-8 -*-
/**
 * 生成代理服务
 * - 从管理端模型/渠道配置中选择可用渠道
 * - 在服务端完成 provider 请求适配与 API Key 注入
 * - 前端只访问本服务，不再接触第三方 API Key / Base URL
 */
import axios from 'axios';
import http from 'http';
import https from 'https';
import { Op } from 'sequelize';

import db from '../models/index.js';
import { redis } from '../config/redis.js';
import { safeJsonParse, sleep } from '../utils/helpers.js';
import { logger } from '../utils/logger.js';
import { decryptApiKey } from './model-management.js';
import * as BillingService from './billing.js';
import * as StorageService from './storage.js';
import { recordError } from './error-logs.js';

const { GenerationRecord, ModelConfig, ModelChannel, ModelChannelBinding } = db;

const DEFAULT_ENDPOINTS = {
  openai: {
    chat: '/v1/chat/completions',
    image: '/v1/images/generations',
    video: '/v1/videos',
    videoQuery: '/v1/videos/{taskId}'
  },
  aliyun: {
    chat: '/v1/chat/completions',
    image: '/services/aigc/multimodal-generation/generation',
    imageAsync: '/services/aigc/image-generation/generation',
    imageQuery: '/tasks/{taskId}',
    video: '/services/aigc/video-generation/video-synthesis',
    videoQuery: '/tasks/{taskId}'
  },
  doubao: {
    chat: '/api/v3/responses',
    image: '/api/v3/images/generations'
  },
  custom: {
    chat: '/v1/chat/completions',
    image: '/v1/images/generations',
    video: '/v1/videos',
    videoQuery: '/v1/videos/{taskId}'
  }
};

const VIDEO_TASK_TTL_SECONDS = 2 * 24 * 60 * 60;
const IMAGE_MAX_POLLS = 60;
const IMAGE_POLL_INTERVAL_MS = 3000;
const HTTP_AGENT = new http.Agent({ family: 4 });
const HTTPS_AGENT = new https.Agent({ family: 4 });
const DEFAULT_UPSTREAM_TIMEOUT_MS = 60000;

export class GenerationError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}

function normalizeProvider(providerType) {
  return DEFAULT_ENDPOINTS[providerType] ? providerType : 'custom';
}

function channelConfig(channel) {
  if (!channel?.config) return {};
  return typeof channel.config === 'string'
    ? safeJsonParse(channel.config, {})
    : channel.config;
}

function endpointFor(channel, endpointKey) {
  const providerType = normalizeProvider(channel.providerType);
  const config = channelConfig(channel);
  const endpoints = {
    ...DEFAULT_ENDPOINTS[providerType],
    ...(config.endpoints || {})
  };
  const endpoint = endpoints[endpointKey];

  if (!endpoint || endpoint === '暂不支持') {
    throw new GenerationError(50301, `渠道 ${channel.name} 未配置 ${endpointKey} 端点`);
  }
  return endpoint;
}

function buildUrl(channel, endpoint) {
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  const baseUrl = String(channel.apiBaseUrl || '').replace(/\/+$/, '');
  let path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const lastBaseSegment = baseUrl.split('/').filter(Boolean).pop();
  const firstPathSegment = path.split('/').filter(Boolean)[0];
  if (lastBaseSegment && firstPathSegment && lastBaseSegment === firstPathSegment) {
    path = `/${path.split('/').filter(Boolean).slice(1).join('/')}`;
  }
  return `${baseUrl}${path}`;
}

function withTaskId(endpoint, taskId) {
  return endpoint.includes('{taskId}')
    ? endpoint.replace('{taskId}', encodeURIComponent(taskId))
    : `${endpoint.replace(/\/+$/, '')}/${encodeURIComponent(taskId)}`;
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );
}

function mergeModelParams(model, payload = {}) {
  return {
    ...(model.defaultParams || {}),
    ...payload,
    model: model.modelKey
  };
}

function stripInternalParams(params = {}) {
  const { project_id: _projectIdSnake, projectId: _projectIdCamel, ...rest } = params;
  return rest;
}

function errorMessageFromUpstream(data, fallback) {
  if (!data) return fallback;
  if (typeof data === 'string') return data.slice(0, 300) || fallback;
  return data.error?.message
    || data.message
    || data.code
    || fallback;
}

function upstreamPublicMessage(err) {
  if (err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message || '')) {
    return '上游服务响应超时，请稍后再试';
  }
  if (err?.code === 'ENOTFOUND' || err?.code === 'ECONNREFUSED' || err?.code === 'ECONNRESET') {
    return '上游服务连接失败，请稍后再试';
  }
  return '上游请求失败，请稍后再试';
}

function upstreamErrorDetails(err, channel, url, endpointKey, timeoutMs) {
  return {
    channel_id: channel.id,
    channel_name: channel.name,
    provider_type: channel.providerType,
    model_type: channel.modelType,
    endpoint_key: endpointKey,
    url,
    timeout_ms: timeoutMs,
    error_code: err?.code || null,
    original_message: err?.message || null
  };
}

async function streamToText(stream) {
  return new Promise((resolve) => {
    let raw = '';
    stream.on('data', (chunk) => {
      raw += chunk.toString('utf8');
      if (raw.length > 500) {
        stream.destroy();
      }
    });
    stream.on('end', () => resolve(raw));
    stream.on('error', () => resolve(raw));
    stream.on('close', () => resolve(raw));
  });
}

async function markAttempt(channel) {
  await channel.increment('totalRequests');
  await channel.update({ lastUsedAt: new Date() });
}

async function markSuccess(channel) {
  await channel.increment('successCount');
}

async function markFailure(channel) {
  await channel.increment('failCount');
  await channel.update({ lastFailAt: new Date() });
}

async function selectBinding(bindings, modelId) {
  if (bindings.length === 1) return bindings[0];

  const strategy = bindings[0].rotationStrategy || 'round_robin';

  if (strategy === 'weighted_random') {
    const totalWeight = bindings.reduce((sum, item) => sum + Math.max(item.rotationWeight || 1, 1), 0);
    let cursor = Math.random() * totalWeight;
    for (const binding of bindings) {
      cursor -= Math.max(binding.rotationWeight || 1, 1);
      if (cursor <= 0) return binding;
    }
    return bindings[0];
  }

  if (strategy === 'priority' || strategy === 'failover') {
    return bindings[0];
  }

  try {
    const counter = await redis.incr(`model:round-robin:${modelId}`);
    await redis.expire(`model:round-robin:${modelId}`, 86400);
    return bindings[(counter - 1) % bindings.length];
  } catch (err) {
    logger.warn(`Redis 轮询计数失败，退回本地随机：${err.message}`);
    return bindings[Math.floor(Math.random() * bindings.length)];
  }
}

async function resolveModelAndChannel(modelKey, modelType) {
  if (!modelKey) {
    throw new GenerationError(42201, 'model 不能为空');
  }

  const model = await ModelConfig.findOne({
    where: {
      isActive: true,
      modelType,
      [Op.or]: [
        { id: modelKey },
        { modelKey }
      ]
    }
  });

  if (!model) {
    throw new GenerationError(50301, '模型未启用或不存在');
  }

  const bindings = await ModelChannelBinding.findAll({
    where: {
      modelId: model.id,
      isActive: true
    },
    include: [
      {
        model: ModelChannel,
        as: 'channel',
        where: {
          isActive: true,
          circuitOpen: false,
          modelType
        },
        required: true
      }
    ],
    order: [
      [{ model: ModelChannel, as: 'channel' }, 'priority', 'ASC'],
      [{ model: ModelChannel, as: 'channel' }, 'weight', 'DESC'],
      ['createdAt', 'ASC']
    ]
  });

  if (!bindings.length) {
    throw new GenerationError(50301, '模型暂无可用渠道，请先在管理端绑定启用的渠道');
  }

  const binding = await selectBinding(bindings, model.id);
  return {
    model,
    binding,
    channel: binding.channel
  };
}

function customHeaders(channel) {
  const config = channelConfig(channel);
  return config.custom_headers || config.customHeaders || {};
}

async function callUpstream({ channel, endpointKey, method = 'post', data, headers = {}, stream = false, taskId = null }) {
  const endpoint = taskId
    ? withTaskId(endpointFor(channel, endpointKey), taskId)
    : endpointFor(channel, endpointKey);
  const url = buildUrl(channel, endpoint);
  const timeoutMs = channel.timeoutMs || DEFAULT_UPSTREAM_TIMEOUT_MS;
  let apiKey;
  try {
    apiKey = decryptApiKey(channel.apiKey);
  } catch (err) {
    await markFailure(channel);
    throw new GenerationError(50301, `渠道 ${channel.name} API Key 配置无效，请在后台重新保存渠道密钥`, {
      channel_id: channel.id
    });
  }

  await markAttempt(channel);

  try {
    const response = await axios({
      url,
      method,
      data,
      httpAgent: HTTP_AGENT,
      httpsAgent: HTTPS_AGENT,
      timeout: timeoutMs,
      responseType: stream ? 'stream' : 'json',
      validateStatus: () => true,
      headers: compactObject({
        Accept: stream ? 'text/event-stream' : 'application/json',
        ...(method.toLowerCase() !== 'get' ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${apiKey}`,
        ...customHeaders(channel),
        ...headers
      })
    });

    if (response.status >= 400) {
      const raw = stream ? await streamToText(response.data) : response.data;
      const upstreamMessage = errorMessageFromUpstream(raw, `上游接口返回 ${response.status}`);
      recordError({
        scope: 'upstream',
        level: response.status >= 500 ? 'error' : 'warn',
        code: response.status >= 500 ? 50201 : 40001,
        httpStatus: response.status,
        message: upstreamMessage,
        publicMessage: response.status === 401 || response.status === 403
          ? '渠道认证失败，请检查后台配置'
          : '上游接口请求失败',
        details: {
          channel_id: channel.id,
          channel_name: channel.name,
          provider_type: channel.providerType,
          model_type: channel.modelType,
          endpoint_key: endpointKey,
          url,
          upstream_status: response.status,
          upstream_body: raw
        }
      });
      if (response.status === 401 || response.status === 403) {
        throw new GenerationError(
          50301,
          `渠道 ${channel.name} 上游认证失败，请检查 API Key 是否正确`,
          { upstream_status: response.status, channel_id: channel.id }
        );
      }
      throw new GenerationError(
        response.status >= 500 ? 50201 : 40001,
        upstreamMessage,
        { upstream_status: response.status, channel_id: channel.id }
      );
    }

    await markSuccess(channel);
    return response;
  } catch (err) {
    if (!(err instanceof GenerationError)) {
      await markFailure(channel);
      const publicMessage = upstreamPublicMessage(err);
      recordError({
        scope: 'upstream',
        level: 'error',
        code: err?.code === 'ECONNABORTED' ? 50401 : 50201,
        httpStatus: err?.code === 'ECONNABORTED' ? 504 : 502,
        message: err.message || '上游请求失败',
        publicMessage,
        stack: err.stack || null,
        details: upstreamErrorDetails(err, channel, url, endpointKey, timeoutMs)
      });
      throw new GenerationError(err?.code === 'ECONNABORTED' ? 50401 : 50201, publicMessage, {
        channel_id: channel.id,
        original_message: err.message || null,
        error_code: err?.code || null
      });
    }
    await markFailure(channel);
    throw err;
  }
}

// ============================
// Provider 请求适配
// ============================

function adaptChatPayload(providerType, params) {
  const upstreamParams = stripInternalParams(params);
  if (providerType === 'doubao') {
    return compactObject({
      model: upstreamParams.model,
      input: (upstreamParams.messages || []).map((msg) => ({
        role: msg.role,
        content: typeof msg.content === 'string'
          ? [{ type: 'input_text', text: msg.content }]
          : msg.content
      })),
      temperature: upstreamParams.temperature,
      max_tokens: upstreamParams.max_tokens,
      stream: upstreamParams.stream,
      tools: upstreamParams.tools
    });
  }

  return compactObject({
    ...upstreamParams,
    model: upstreamParams.model,
    messages: upstreamParams.messages || []
  });
}

function adaptImagePayload(providerType, params) {
  const upstreamParams = stripInternalParams(params);
  if (providerType === 'aliyun') {
    const images = Array.isArray(upstreamParams.image)
      ? upstreamParams.image
      : upstreamParams.image
        ? [upstreamParams.image]
        : [];

    const content = [
      ...images.map((image) => ({ image })),
      { text: upstreamParams.prompt || '' }
    ];

    const parameters = compactObject({
      size: upstreamParams.size,
      n: upstreamParams.n,
      thinking_mode: images.length ? undefined : upstreamParams.thinking_mode,
      watermark: upstreamParams.watermark,
      seed: upstreamParams.seed
    });

    return {
      model: upstreamParams.model,
      input: {
        messages: [
          {
            role: 'user',
            content
          }
        ]
      },
      parameters
    };
  }

  if (providerType === 'doubao') {
    return compactObject({
      model: upstreamParams.model,
      prompt: upstreamParams.prompt,
      size: upstreamParams.size,
      n: upstreamParams.n,
      quality: upstreamParams.quality,
      watermark: upstreamParams.watermark,
      image: upstreamParams.image,
      sequential_image_generation: upstreamParams.sequential_image_generation || 'disabled',
      response_format: upstreamParams.response_format || 'url',
      stream: false
    });
  }

  return compactObject({
    ...upstreamParams,
    model: upstreamParams.model,
    prompt: upstreamParams.prompt
  });
}

function adaptVideoPayload(providerType, params) {
  const upstreamParams = stripInternalParams(params);
  const images = Array.isArray(upstreamParams.images) ? upstreamParams.images : [];
  const firstFrame = upstreamParams.first_frame_image || images[0];
  const lastFrame = upstreamParams.last_frame_image;

  if (providerType === 'aliyun') {
    const media = [];
    if (firstFrame) media.push({ type: 'first_frame', url: firstFrame });
    if (lastFrame) media.push({ type: 'last_frame', url: lastFrame });

    const input = compactObject({
      prompt: upstreamParams.prompt || '',
      media: media.length ? media : undefined
    });

    return {
      model: upstreamParams.model,
      input,
      parameters: compactObject({
        resolution: upstreamParams.resolution,
        duration: upstreamParams.duration || upstreamParams.dur,
        prompt_extend: upstreamParams.prompt_extend,
        watermark: upstreamParams.watermark,
        seed: upstreamParams.seed
      })
    };
  }

  return compactObject({
    model: upstreamParams.model,
    prompt: upstreamParams.prompt || '',
    first_frame_image: firstFrame,
    last_frame_image: lastFrame,
    image: firstFrame,
    size: upstreamParams.size || upstreamParams.ratio,
    seconds: upstreamParams.seconds || upstreamParams.duration || upstreamParams.dur
  });
}

// ============================
// Provider 响应适配
// ============================

function normalizeImageItem(item) {
  const base64Image = item.b64_json || item.b64Json;
  if (base64Image) {
    const value = String(base64Image);
    return {
      url: value.startsWith('data:') ? value : `data:image/png;base64,${value}`,
      revisedPrompt: item.revised_prompt || item.revisedPrompt || ''
    };
  }

  const rawUrl = item.url || item.image || '';
  const url = typeof rawUrl === 'string'
    && !/^(https?:|data:|\/)/i.test(rawUrl)
    && rawUrl.length > 100
    ? `data:image/png;base64,${rawUrl}`
    : rawUrl;

  return {
    url,
    revisedPrompt: item.revised_prompt || item.revisedPrompt || ''
  };
}

function adaptImageResponse(providerType, responseData) {
  if (responseData?.code && responseData.code !== '200' && responseData.code !== '') {
    throw new GenerationError(50201, responseData.message || `上游接口错误：${responseData.code}`);
  }

  if (providerType === 'aliyun') {
    if (responseData.output?.task_id && responseData.output?.task_status !== 'SUCCEEDED') {
      return {
        asyncTaskId: responseData.output.task_id,
        taskStatus: responseData.output.task_status || 'PENDING'
      };
    }

    const choices = responseData.output?.choices || [];
    const fromChoices = choices.flatMap((choice) =>
      (choice.message?.content || [])
        .filter((item) => item.type === 'image' && item.image)
        .map((item) => normalizeImageItem(item))
    );

    const results = responseData.output?.results || responseData.output?.images || [];
    const fromResults = (Array.isArray(results) ? results : [results])
      .filter(Boolean)
      .map((item) => normalizeImageItem(item));

    const directUrl = responseData.output?.image_url || responseData.output?.url;
    const fromDirect = directUrl ? [{ url: directUrl, revisedPrompt: '' }] : [];

    return {
      images: [...fromChoices, ...fromResults, ...fromDirect].filter((item) => item.url)
    };
  }

  const data = responseData.data || responseData;
  return {
    images: (Array.isArray(data) ? data : [data])
      .filter(Boolean)
      .map((item) => normalizeImageItem(item))
      .filter((item) => item.url)
  };
}

function adaptVideoCreateResponse(providerType, responseData) {
  if (providerType === 'aliyun') {
    const taskId = responseData.output?.task_id;
    const videoUrl = responseData.output?.video_url || responseData.output?.url;
    if (videoUrl) {
      return { status: 'completed', url: videoUrl, taskId: null };
    }
    if (taskId) {
      return { status: 'pending', taskId };
    }
  }

  const url = responseData.data?.url
    || responseData.data?.[0]?.url
    || responseData.url
    || responseData.content?.video_url
    || responseData.video_url;
  if (url) return { status: 'completed', url, taskId: null };

  const taskId = responseData.id || responseData.task_id || responseData.taskId;
  if (taskId) return { status: 'pending', taskId };

  throw new GenerationError(50201, '上游未返回视频任务 ID 或视频 URL');
}

function adaptVideoStatusResponse(providerType, responseData) {
  if (providerType === 'aliyun') {
    const taskStatus = responseData.output?.task_status;
    if (taskStatus === 'SUCCEEDED') {
      return {
        status: 'completed',
        url: responseData.output?.video_url || responseData.output?.url || ''
      };
    }
    if (taskStatus === 'FAILED' || taskStatus === 'UNKNOWN') {
      return {
        status: 'failed',
        error: responseData.output?.message || responseData.message || '视频生成失败'
      };
    }
    return {
      status: taskStatus === 'RUNNING' ? 'running' : 'pending',
      taskStatus
    };
  }

  if (responseData.status === 'failed' || responseData.status === 'error') {
    return {
      status: 'failed',
      error: responseData.error?.message || responseData.message || '视频生成失败'
    };
  }

  const url = responseData.data?.url
    || responseData.data?.[0]?.url
    || responseData.url
    || responseData.content?.video_url
    || responseData.video_url;
  if (responseData.status === 'completed' || responseData.status === 'succeeded' || url) {
    return {
      status: 'completed',
      url
    };
  }

  return {
    status: responseData.status || 'pending'
  };
}

async function waitForImageTask(channel, taskId) {
  for (let i = 0; i < IMAGE_MAX_POLLS; i += 1) {
    await sleep(IMAGE_POLL_INTERVAL_MS);
    const response = await callUpstream({
      channel,
      endpointKey: 'imageQuery',
      method: 'get',
      taskId
    });
    const adapted = adaptImageResponse(channel.providerType, response.data);
    if (adapted.images?.length) return adapted.images;
    if (adapted.taskStatus === 'FAILED') {
      throw new GenerationError(50201, response.data?.message || '图片生成失败');
    }
  }
  throw new GenerationError(50401, '图片生成超时');
}

async function storeVideoTask(taskId, metadata) {
  try {
    await redis.setex(`generation:video-task:${taskId}`, VIDEO_TASK_TTL_SECONDS, JSON.stringify(metadata));
  } catch (err) {
    logger.warn(`保存视频任务元数据失败：${err.message}`, { taskId });
  }
}

async function readVideoTask(taskId) {
  try {
    const raw = await redis.get(`generation:video-task:${taskId}`);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    logger.warn(`读取视频任务元数据失败：${err.message}`, { taskId });
    return null;
  }
}

function extractPromptText(payload = {}, type = 'image') {
  if (payload.prompt) return String(payload.prompt);
  if (type === 'chat' && Array.isArray(payload.messages)) {
    return payload.messages
      .filter((item) => item?.role === 'user')
      .map((item) => (typeof item.content === 'string' ? item.content : JSON.stringify(item.content)))
      .join('\n')
      .slice(0, 5000);
  }
  return null;
}

async function createGenerationRecord({ userId, model, channel, type, payload, auditContext = {} }) {
  return GenerationRecord.create({
    userId,
    modelId: model.id,
    channelId: channel?.id || null,
    type,
    status: 'processing',
    inputParams: payload,
    promptText: extractPromptText(payload, type),
    clientIp: auditContext.ip || null,
    userAgent: auditContext.userAgent || null,
    uaBrowser: auditContext.uaBrowser || null,
    uaOs: auditContext.uaOs || null,
    uaDevice: auditContext.uaDevice || null,
    deviceFingerprint: auditContext.deviceFingerprint || null,
    projectId: payload.project_id || payload.projectId || null
  });
}

async function markRecordCompleted(record, result, { costInfo = null, durationMs = null, files = [] } = {}) {
  await record.update({
    status: 'completed',
    result,
    costAmount: costInfo?.finalCost || record.costAmount || 0,
    costBreakdown: costInfo?.costBreakdown || record.costBreakdown || null,
    coinTxId: costInfo?.transaction?.id || record.coinTxId || null,
    userGroupSnapshot: costInfo?.costBreakdown?.group || record.userGroupSnapshot || null,
    durationMs,
    completedAt: new Date()
  });

  return {
    ...result,
    record_id: record.id,
    cost: {
      amount: Number(costInfo?.finalCost || 0),
      coin_tx_id: costInfo?.transaction?.id || null,
      breakdown: costInfo?.costBreakdown || null
    },
    files
  };
}

async function markRecordFailed(record, err, { costInfo = null, refundTx = null, durationMs = null } = {}) {
  await record.update({
    status: 'failed',
    errorMessage: err.message || '生成失败',
    costAmount: costInfo?.finalCost || record.costAmount || 0,
    costBreakdown: costInfo?.costBreakdown || record.costBreakdown || null,
    coinTxId: costInfo?.transaction?.id || record.coinTxId || null,
    refundTxId: refundTx?.id || record.refundTxId || null,
    userGroupSnapshot: costInfo?.costBreakdown?.group || record.userGroupSnapshot || null,
    durationMs,
    completedAt: new Date()
  });
}

async function charge(record, { userId, model, payload, type, auditContext }) {
  const costInfo = await BillingService.chargeForGeneration({
    userId,
    generationId: record.id,
    modelId: model.id,
    modelType: type,
    payload,
    auditContext
  });

  await record.update({
    costAmount: costInfo.finalCost,
    costBreakdown: costInfo.costBreakdown,
    coinTxId: costInfo.transaction?.id || null,
    userGroupSnapshot: costInfo.costBreakdown?.group || null
  });

  return costInfo;
}

async function refundOnFailure(record, costInfo, { userId, auditContext }) {
  if (!costInfo?.transaction || Number(costInfo.finalCost || 0) <= 0) return null;
  return BillingService.refundGeneration({
    userId,
    generationId: record.id,
    amount: costInfo.finalCost,
    relatedTxId: costInfo.transaction.id,
    auditContext
  });
}

async function persistGeneratedFiles(items = [], { userId, generationId, type }) {
  const files = [];
  const normalized = [];
  const isImage = type === 'generated_image';
  const publicMessage = isImage
    ? '生成图片保存失败，请稍后再试'
    : '生成视频保存失败，请稍后再试';

  for (const item of items) {
    if (!item?.url) continue;
    try {
      const file = await StorageService.persistRemoteFile({
        url: item.url,
        userId,
        generationId,
        type
      });
      files.push(file);
      normalized.push({
        ...item,
        ...(String(item.url).startsWith('data:') ? {} : { originalUrl: item.url }),
        url: file.fileUrl,
        file_id: file.id
      });
    } catch (err) {
      logger.error(`生成结果转存失败：${err.message}`, {
        generation_id: generationId,
        type,
        url: item.url,
        stack: err.stack
      });
      await recordError({
        scope: 'storage',
        level: 'error',
        code: 50201,
        httpStatus: 502,
        message: err.message || publicMessage,
        publicMessage,
        stack: err.stack || null,
        userId,
        details: {
          generation_id: generationId,
          file_type: type,
          original_url: item.url,
          storage_error_code: err.code || null,
          storage_error_extra: err.extra || null
        }
      });
      throw new GenerationError(50201, publicMessage, {
        generation_id: generationId,
        file_type: type
      });
    }
  }

  return { items: normalized, files };
}

// ============================
// 公开业务方法
// ============================

export async function generateImage(payload, userId, auditContext = {}) {
  const startedAt = Date.now();
  const { model, channel } = await resolveModelAndChannel(payload.model, 'image');
  const params = mergeModelParams(model, payload);
  const providerType = normalizeProvider(channel.providerType);
  const record = await createGenerationRecord({
    userId,
    model,
    channel,
    type: 'image',
    payload: params,
    auditContext
  });
  let costInfo = null;

  try {
    costInfo = await charge(record, { userId, model, payload: params, type: 'image', auditContext });

    const response = await callUpstream({
      channel,
      endpointKey: 'image',
      data: adaptImagePayload(providerType, params),
      headers: providerType === 'aliyun' && params.async ? { 'X-DashScope-Async': 'enable' } : {}
    });

    const adapted = adaptImageResponse(providerType, response.data);
    const images = adapted.images?.length
      ? adapted.images
      : adapted.asyncTaskId
        ? await waitForImageTask(channel, adapted.asyncTaskId)
        : [];

    if (!images.length) {
      throw new GenerationError(50201, '上游未返回图片结果');
    }

    const persisted = await persistGeneratedFiles(images, {
      userId,
      generationId: record.id,
      type: 'generated_image'
    });

    return markRecordCompleted(record, {
      id: record.id,
      status: 'completed',
      model: model.modelKey,
      user_id: userId,
      channel_used: channel.name,
      images: persisted.items
    }, {
      costInfo,
      durationMs: Date.now() - startedAt,
      files: persisted.files
    });
  } catch (err) {
    const refundTx = await refundOnFailure(record, costInfo, { userId, auditContext });
    await markRecordFailed(record, err, {
      costInfo,
      refundTx,
      durationMs: Date.now() - startedAt
    });
    throw err;
  }
}

export async function createVideoTask(payload, userId, auditContext = {}) {
  const startedAt = Date.now();
  const { model, channel } = await resolveModelAndChannel(payload.model, 'video');
  const params = mergeModelParams(model, payload);
  const providerType = normalizeProvider(channel.providerType);
  const record = await createGenerationRecord({
    userId,
    model,
    channel,
    type: 'video',
    payload: params,
    auditContext
  });
  let costInfo = null;

  try {
    costInfo = await charge(record, { userId, model, payload: params, type: 'video', auditContext });
    const response = await callUpstream({
      channel,
      endpointKey: 'video',
      data: adaptVideoPayload(providerType, params),
      headers: providerType === 'aliyun' ? { 'X-DashScope-Async': 'enable' } : {}
    });

    const result = adaptVideoCreateResponse(providerType, response.data);
    if (result.taskId) {
      await storeVideoTask(result.taskId, {
        userId,
        generationId: record.id,
        modelId: model.id,
        modelKey: model.modelKey,
        channelId: channel.id,
        providerType,
        costInfo: {
          finalCost: costInfo.finalCost,
          transactionId: costInfo.transaction?.id || null,
          costBreakdown: costInfo.costBreakdown
        }
      });

      await record.update({
        result,
        costAmount: costInfo.finalCost,
        costBreakdown: costInfo.costBreakdown,
        coinTxId: costInfo.transaction?.id || null,
        userGroupSnapshot: costInfo.costBreakdown?.group || null,
        durationMs: Date.now() - startedAt
      });

      return {
        id: record.id,
        record_id: record.id,
        model: model.modelKey,
        user_id: userId,
        channel_used: channel.name,
        cost: {
          amount: Number(costInfo.finalCost || 0),
          coin_tx_id: costInfo.transaction?.id || null,
          breakdown: costInfo.costBreakdown
        },
        ...result
      };
    }

    let completedResult = {
      id: record.id,
      model: model.modelKey,
      user_id: userId,
      channel_used: channel.name,
      ...result
    };
    let files = [];
    if (result.url) {
      const persisted = await persistGeneratedFiles([{ url: result.url }], {
        userId,
        generationId: record.id,
        type: 'generated_video'
      });
      files = persisted.files;
      completedResult = {
        ...completedResult,
        url: persisted.items[0]?.url || result.url,
        originalUrl: persisted.items[0]?.originalUrl || undefined,
        file_id: persisted.items[0]?.file_id || undefined
      };
    }

    return markRecordCompleted(record, completedResult, {
      costInfo,
      durationMs: Date.now() - startedAt,
      files
    });
  } catch (err) {
    const refundTx = await refundOnFailure(record, costInfo, { userId, auditContext });
    await markRecordFailed(record, err, {
      costInfo,
      refundTx,
      durationMs: Date.now() - startedAt
    });
    throw err;
  }
}

export async function queryVideoTask(taskId, userId) {
  const metadata = await readVideoTask(taskId);
  if (!metadata) {
    throw new GenerationError(40402, '视频任务不存在或已过期');
  }
  if (metadata.userId && metadata.userId !== userId) {
    throw new GenerationError(40301, '无权查看该视频任务');
  }

  const channel = await ModelChannel.findByPk(metadata.channelId);
  if (!channel) {
    throw new GenerationError(40402, '视频任务关联渠道不存在');
  }

  const response = await callUpstream({
    channel,
    endpointKey: 'videoQuery',
    method: 'get',
    taskId
  });

  const result = adaptVideoStatusResponse(metadata.providerType || channel.providerType, response.data);
  if (result.status === 'failed') {
    const record = metadata.generationId ? await GenerationRecord.findByPk(metadata.generationId) : null;
    if (record && record.status !== 'failed') {
      const refundTx = metadata.costInfo?.transactionId
        ? await BillingService.refundGeneration({
            userId,
            generationId: record.id,
            amount: metadata.costInfo.finalCost || 0,
            relatedTxId: metadata.costInfo.transactionId
          })
        : null;
      await markRecordFailed(record, new Error(result.error || '视频生成失败'), {
        costInfo: {
          finalCost: metadata.costInfo?.finalCost || 0,
          costBreakdown: metadata.costInfo?.costBreakdown || null,
          transaction: metadata.costInfo?.transactionId ? { id: metadata.costInfo.transactionId } : null
        },
        refundTx
      });
    }
    throw new GenerationError(50201, result.error || '视频生成失败');
  }

  let finalResult = result;
  let files = [];
  if (result.status === 'completed' && metadata.generationId) {
    const record = await GenerationRecord.findByPk(metadata.generationId);
    if (record && record.status !== 'completed') {
      if (result.url) {
        const persisted = await persistGeneratedFiles([{ url: result.url }], {
          userId,
          generationId: record.id,
          type: 'generated_video'
        });
        files = persisted.files;
        finalResult = {
          ...result,
          url: persisted.items[0]?.url || result.url,
          originalUrl: persisted.items[0]?.originalUrl || undefined,
          file_id: persisted.items[0]?.file_id || undefined
        };
      }
      await markRecordCompleted(record, finalResult, {
        costInfo: {
          finalCost: metadata.costInfo?.finalCost || 0,
          costBreakdown: metadata.costInfo?.costBreakdown || null,
          transaction: metadata.costInfo?.transactionId ? { id: metadata.costInfo.transactionId } : null
        },
        files
      });
    }
  }

  return {
    taskId,
    record_id: metadata.generationId || null,
    model: metadata.modelKey,
    channel_used: channel.name,
    ...finalResult
  };
}

export async function chatCompletions(payload, userId, auditContext = {}) {
  const startedAt = Date.now();
  const { model, channel } = await resolveModelAndChannel(payload.model, 'chat');
  const params = mergeModelParams(model, payload);
  const providerType = normalizeProvider(channel.providerType);
  const record = await createGenerationRecord({
    userId,
    model,
    channel,
    type: 'chat',
    payload: params,
    auditContext
  });
  let costInfo = null;

  try {
    costInfo = await charge(record, { userId, model, payload: params, type: 'chat', auditContext });
    const response = await callUpstream({
      channel,
      endpointKey: 'chat',
      data: adaptChatPayload(providerType, { ...params, stream: false })
    });

    return markRecordCompleted(record, {
      id: record.id,
      status: 'completed',
      model: model.modelKey,
      user_id: userId,
      channel_used: channel.name,
      response: response.data
    }, {
      costInfo,
      durationMs: Date.now() - startedAt
    });
  } catch (err) {
    const refundTx = await refundOnFailure(record, costInfo, { userId, auditContext });
    await markRecordFailed(record, err, {
      costInfo,
      refundTx,
      durationMs: Date.now() - startedAt
    });
    throw err;
  }
}

export async function streamChatCompletions(payload, userId = null, auditContext = {}) {
  const { model, channel } = await resolveModelAndChannel(payload.model, 'chat');
  const params = mergeModelParams(model, payload);
  const providerType = normalizeProvider(channel.providerType);
  const record = userId
    ? await createGenerationRecord({
        userId,
        model,
        channel,
        type: 'chat',
        payload: params,
        auditContext
      })
    : null;
  let costInfo = null;

  try {
    costInfo = record
      ? await charge(record, { userId, model, payload: params, type: 'chat', auditContext })
      : null;

    const response = await callUpstream({
      channel,
      endpointKey: 'chat',
      data: adaptChatPayload(providerType, { ...params, stream: true }),
      stream: true
    });

    if (record) {
      response.data.on('end', () => {
        markRecordCompleted(record, {
          id: record.id,
          status: 'completed',
          model: model.modelKey,
          user_id: userId,
          channel_used: channel.name,
          response: { stream: true }
        }, { costInfo }).catch((err) => {
          logger.warn(`流式对话记录完成状态更新失败：${err.message}`, { generation_id: record.id });
        });
      });
      response.data.on('error', async (err) => {
        const refundTx = await refundOnFailure(record, costInfo, { userId, auditContext });
        await markRecordFailed(record, err, { costInfo, refundTx });
      });
    }

    return {
      model: model.modelKey,
      channel,
      record,
      costInfo,
      stream: response.data
    };
  } catch (err) {
    if (record) {
      const refundTx = await refundOnFailure(record, costInfo, { userId, auditContext });
      await markRecordFailed(record, err, { costInfo, refundTx });
    }
    throw err;
  }
}

export default {
  GenerationError,
  generateImage,
  createVideoTask,
  queryVideoTask,
  chatCompletions,
  streamChatCompletions
};
