// -*- coding: utf-8 -*-
/**
 * 生成代理服务
 * - 从管理端模型/渠道配置中选择可用渠道
 * - 在服务端完成 provider 请求适配与 API Key 注入
 * - 前端只访问本服务，不再接触第三方 API Key / Base URL
 */
import axios from 'axios';
import { Op } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';

import db from '../models/index.js';
import { redis } from '../config/redis.js';
import { safeJsonParse, sleep } from '../utils/helpers.js';
import { logger } from '../utils/logger.js';
import { decryptApiKey } from './model-management.js';

const { ModelConfig, ModelChannel, ModelChannelBinding } = db;

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
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
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

function errorMessageFromUpstream(data, fallback) {
  if (!data) return fallback;
  if (typeof data === 'string') return data.slice(0, 300) || fallback;
  return data.error?.message
    || data.message
    || data.code
    || fallback;
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
          circuitOpen: false
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
  const apiKey = decryptApiKey(channel.apiKey);

  await markAttempt(channel);

  try {
    const response = await axios({
      url,
      method,
      data,
      timeout: channel.timeoutMs || 60000,
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
      throw new GenerationError(
        response.status >= 500 ? 50201 : 40001,
        errorMessageFromUpstream(raw, `上游接口返回 ${response.status}`),
        { upstream_status: response.status, channel_id: channel.id }
      );
    }

    await markSuccess(channel);
    return response;
  } catch (err) {
    if (!(err instanceof GenerationError)) {
      await markFailure(channel);
      throw new GenerationError(50201, err.message || '上游请求失败', {
        channel_id: channel.id
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
  if (providerType === 'doubao') {
    return compactObject({
      model: params.model,
      input: (params.messages || []).map((msg) => ({
        role: msg.role,
        content: typeof msg.content === 'string'
          ? [{ type: 'input_text', text: msg.content }]
          : msg.content
      })),
      temperature: params.temperature,
      max_tokens: params.max_tokens,
      stream: params.stream,
      tools: params.tools
    });
  }

  return compactObject({
    ...params,
    model: params.model,
    messages: params.messages || []
  });
}

function adaptImagePayload(providerType, params) {
  if (providerType === 'aliyun') {
    const images = Array.isArray(params.image)
      ? params.image
      : params.image
        ? [params.image]
        : [];

    const content = [
      ...images.map((image) => ({ image })),
      { text: params.prompt || '' }
    ];

    const parameters = compactObject({
      size: params.size,
      n: params.n,
      thinking_mode: images.length ? undefined : params.thinking_mode,
      watermark: params.watermark,
      seed: params.seed
    });

    return {
      model: params.model,
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
      model: params.model,
      prompt: params.prompt,
      size: params.size,
      n: params.n,
      quality: params.quality,
      watermark: params.watermark,
      image: params.image,
      sequential_image_generation: params.sequential_image_generation || 'disabled',
      response_format: params.response_format || 'url',
      stream: false
    });
  }

  return compactObject({
    ...params,
    model: params.model,
    prompt: params.prompt
  });
}

function adaptVideoPayload(providerType, params) {
  const images = Array.isArray(params.images) ? params.images : [];
  const firstFrame = params.first_frame_image || images[0];
  const lastFrame = params.last_frame_image;

  if (providerType === 'aliyun') {
    const media = [];
    if (firstFrame) media.push({ type: 'first_frame', url: firstFrame });
    if (lastFrame) media.push({ type: 'last_frame', url: lastFrame });

    const input = compactObject({
      prompt: params.prompt || '',
      media: media.length ? media : undefined
    });

    return {
      model: params.model,
      input,
      parameters: compactObject({
        resolution: params.resolution,
        duration: params.duration || params.dur,
        prompt_extend: params.prompt_extend,
        watermark: params.watermark,
        seed: params.seed
      })
    };
  }

  return compactObject({
    model: params.model,
    prompt: params.prompt || '',
    first_frame_image: firstFrame,
    last_frame_image: lastFrame,
    image: firstFrame,
    size: params.size || params.ratio,
    seconds: params.seconds || params.duration || params.dur
  });
}

// ============================
// Provider 响应适配
// ============================

function normalizeImageItem(item) {
  return {
    url: item.url || item.image || item.b64_json || '',
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

// ============================
// 公开业务方法
// ============================

export async function generateImage(payload, userId) {
  const { model, channel } = await resolveModelAndChannel(payload.model, 'image');
  const params = mergeModelParams(model, payload);
  const providerType = normalizeProvider(channel.providerType);

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

  return {
    id: uuidv4(),
    status: 'completed',
    model: model.modelKey,
    user_id: userId,
    channel_used: channel.name,
    images
  };
}

export async function createVideoTask(payload, userId) {
  const { model, channel } = await resolveModelAndChannel(payload.model, 'video');
  const params = mergeModelParams(model, payload);
  const providerType = normalizeProvider(channel.providerType);

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
      modelId: model.id,
      modelKey: model.modelKey,
      channelId: channel.id,
      providerType
    });
  }

  return {
    id: uuidv4(),
    model: model.modelKey,
    user_id: userId,
    channel_used: channel.name,
    ...result
  };
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
    throw new GenerationError(50201, result.error || '视频生成失败');
  }

  return {
    taskId,
    model: metadata.modelKey,
    channel_used: channel.name,
    ...result
  };
}

export async function chatCompletions(payload, userId) {
  const { model, channel } = await resolveModelAndChannel(payload.model, 'chat');
  const params = mergeModelParams(model, payload);
  const providerType = normalizeProvider(channel.providerType);

  const response = await callUpstream({
    channel,
    endpointKey: 'chat',
    data: adaptChatPayload(providerType, { ...params, stream: false })
  });

  return {
    id: uuidv4(),
    model: model.modelKey,
    user_id: userId,
    channel_used: channel.name,
    response: response.data
  };
}

export async function streamChatCompletions(payload) {
  const { model, channel } = await resolveModelAndChannel(payload.model, 'chat');
  const params = mergeModelParams(model, payload);
  const providerType = normalizeProvider(channel.providerType);

  const response = await callUpstream({
    channel,
    endpointKey: 'chat',
    data: adaptChatPayload(providerType, { ...params, stream: true }),
    stream: true
  });

  return {
    model: model.modelKey,
    channel,
    stream: response.data
  };
}

export default {
  GenerationError,
  generateImage,
  createVideoTask,
  queryVideoTask,
  chatCompletions,
  streamChatCompletions
};
