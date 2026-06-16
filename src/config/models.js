/**
 * Models Configuration | 模型配置
 * Centralized model configuration | 集中模型配置
 */

// Seedream image size options | 豆包图片尺寸选项
export const SEEDREAM_SIZE_OPTIONS = [
    { label: '21:9', key: '3024x1296' },
    { label: '16:9', key: '2560x1440' },
    { label: '4:3', key: '2304x1728' },
    { label: '3:2', key: '2496x1664' },
    { label: '1:1', key: '2048x2048' },
    { label: '2:3', key: '1664x2496' },
    { label: '3:4', key: '1728x2304' },
    { label: '9:16', key: '1440x2560' },
    { label: '9:21', key: '1296x3024' }
]

// Seedream 4K image size options | 豆包4K图片尺寸选项
export const SEEDREAM_4K_SIZE_OPTIONS = [
    { label: '21:9', key: '6198x2656' },
    { label: '16:9', key: '5404x3040' },
    { label: '4:3', key: '4694x3520' },
    { label: '3:2', key: '4992x3328' },
    { label: '1:1', key: '4096x4096' },
    { label: '2:3', key: '3328x4992' },
    { label: '3:4', key: '3520x4694' },
    { label: '9:16', key: '3040x5404' },
    { label: '9:21', key: '2656x6198' }
]

// Seedream quality options | 豆包画质选项
export const SEEDREAM_QUALITY_OPTIONS = [
    { label: '标准画质', key: 'standard' },
    { label: '4K 高清', key: '4k' }
]

export const BANANA_SIZE_OPTIONS = [
    { label: '16:9', key: '16x9' },
    { label: '4:3', key: '4x3' },
    { label: '3:2', key: '3x2' },
    { label: '1:1', key: '1x1' },
    { label: '2:3', key: '2x3' },
    { label: '3:4', key: '3x4' },
    { label: '9:16', key: '9x16' },
]

// Wan (阿里云万相) image size options | 万相图片尺寸选项
// wan2.7 使用分辨率规格(1K/2K/4K),不再使用像素值
export const WAN_SIZE_OPTIONS = [
    { label: '1K', key: '1K' },
    { label: '2K (推荐)', key: '2K' },
]

export const WAN_PRO_SIZE_OPTIONS = [
    { label: '1K', key: '1K' },
    { label: '2K (推荐)', key: '2K' },
    { label: '4K 高清', key: '4K' },
]

// Image generation models | 图片生成模型
export const IMAGE_MODELS = [
    {
        label: '豆包 Seedream 5.0 (推荐)',
        key: 'doubao-seedream-5-0-260128',
        provider: ['doubao'],
        sizes: SEEDREAM_SIZE_OPTIONS.map(s => s.key),
        qualities: SEEDREAM_QUALITY_OPTIONS,
        // 根据画质返回对应的尺寸选项
        getSizesByQuality: (quality) => {
            return quality === '4k' ? SEEDREAM_4K_SIZE_OPTIONS : SEEDREAM_SIZE_OPTIONS
        },
        defaultParams: {
            size: '2048x2048',
            quality: 'standard',
            n: 1,
            watermark: true
        }
    },
    {
        label: '万相 2.7 Pro (推荐)',
        key: 'wan2.7-image-pro',
        provider: ['aliyun'],
        sizes: WAN_PRO_SIZE_OPTIONS.map(s => s.key),
        defaultParams: {
            size: '2K',
            n: 1,
            thinking_mode: true,
            watermark: false
        }
    },
    {
        label: '万相 2.7',
        key: 'wan2.7-image',
        provider: ['aliyun'],
        sizes: WAN_SIZE_OPTIONS.map(s => s.key),
        defaultParams: {
            size: '2K',
            n: 1,
            thinking_mode: true,
            watermark: false
        }
    },
]

// Video ratio options | 视频比例选项
export const VIDEO_RATIO_LIST = [
    { label: '16:9 (横版)', key: '16x9' },
    { label: '4:3', key: '4x3' },
    { label: '1:1 (方形)', key: '1x1' },
    { label: '3:4', key: '3x4' },
    { label: '9:16 (竖版)', key: '9x16' }
]

// Video resolution options for Seedance | Seedance 分辨率选项
export const SEEDANCE_RESOLUTION_OPTIONS = [
    { label: '480p', key: '480p' },
    { label: '720p', key: '720p' },
    { label: '1080p', key: '1080p' }
]

// Wan (阿里云万相) 视频分辨率选项 | 万相视频分辨率选项
export const WAN_VIDEO_RESOLUTION_OPTIONS = [
    { label: '720P', key: '720P' },
    { label: '1080P', key: '1080P' }
]

// Wan (阿里云万相) 视频时长选项 | 万相视频时长选项
export const WAN_VIDEO_DURATION_OPTIONS = [
    { label: '2 秒', key: 2 },
    { label: '3 秒', key: 3 },
    { label: '4 秒', key: 4 },
    { label: '5 秒', key: 5 },
    { label: '6 秒', key: 6 },
    { label: '7 秒', key: 7 },
    { label: '8 秒', key: 8 },
    { label: '9 秒', key: 9 },
    { label: '10 秒', key: 10 },
    { label: '11 秒', key: 11 },
    { label: '12 秒', key: 12 },
    { label: '13 秒', key: 13 },
    { label: '14 秒', key: 14 },
    { label: '15 秒', key: 15 }
]

// Video generation models | 视频生成模型
export const VIDEO_MODELS = [
    {
        label: '万相 2.7 图生视频 (推荐)',
        key: 'wan2.7-i2v-2026-04-25',
        provider: ['aliyun'],
        type: 'i2v',  // 图生视频
        resolutions: WAN_VIDEO_RESOLUTION_OPTIONS.map(r => r.key),
        durs: WAN_VIDEO_DURATION_OPTIONS,
        defaultParams: {
            resolution: '720P',
            duration: 5,
            watermark: true,
            prompt_extend: true
        }
    },
    {
        label: '万相 2.7 图生视频',
        key: 'wan2.7-i2v',
        provider: ['aliyun'],
        type: 'i2v',
        resolutions: WAN_VIDEO_RESOLUTION_OPTIONS.map(r => r.key),
        durs: WAN_VIDEO_DURATION_OPTIONS,
        defaultParams: {
            resolution: '720P',
            duration: 5,
            watermark: true,
            prompt_extend: true
        }
    },
    {
        label: '万相 2.7 文生视频 (推荐)',
        key: 'wan2.7-t2v-2026-04-25',
        provider: ['aliyun'],
        type: 't2v',  // 文生视频
        resolutions: WAN_VIDEO_RESOLUTION_OPTIONS.map(r => r.key),
        durs: WAN_VIDEO_DURATION_OPTIONS,
        defaultParams: {
            resolution: '720P',
            duration: 5,
            watermark: true,
            prompt_extend: true
        }
    },
    {
        label: '万相 2.7 文生视频',
        key: 'wan2.7-t2v',
        provider: ['aliyun'],
        type: 't2v',
        resolutions: WAN_VIDEO_RESOLUTION_OPTIONS.map(r => r.key),
        durs: WAN_VIDEO_DURATION_OPTIONS,
        defaultParams: {
            resolution: '720P',
            duration: 5,
            watermark: true,
            prompt_extend: true
        }
    }
]

// Chat/LLM models | 对话模型
export const CHAT_MODELS = [
    { label: 'GPT-4o Mini', key: 'gpt-4o-mini', provider: ['openai'] },
    { label: 'GPT-4o', key: 'gpt-4o', provider: ['openai'] },
    { label: 'GPT-5.2', key: 'gpt-5.2', provider: ['openai'] },
    { label: 'DeepSeek Chat', key: 'deepseek-chat', provider: ['openai'] },
    { label: 'Gemini 3 Pro', key: 'gemini-3-pro', provider: ['openai'] },
    { label: 'DeepSeek V4 Flash (豆包)', key: 'deepseek-v4-flash-260425', provider: ['doubao'] }
]

// Image size options | 图片尺寸选项
export const IMAGE_SIZE_OPTIONS = [
    { label: '2048x2048', key: '2048x2048' },
    { label: '1792x1024 (横版)', key: '1792x1024' },
    { label: '1024x1792 (竖版)', key: '1024x1792' }
]

// Image quality options | 图片质量选项
export const IMAGE_QUALITY_OPTIONS = [
    { label: '标准', key: 'standard' },
    { label: '高清', key: 'hd' }
]

// Image style options | 图片风格选项
export const IMAGE_STYLE_OPTIONS = [
    { label: '生动', key: 'vivid' },
    { label: '自然', key: 'natural' }
]

// Video ratio options | 视频比例选项
export const VIDEO_RATIO_OPTIONS = VIDEO_RATIO_LIST

// Video duration options | 视频时长选项
export const VIDEO_DURATION_OPTIONS = [
    { label: '5 秒', key: 5 },
    { label: '10 秒', key: 10 }
]

// Default values | 默认值
export const DEFAULT_IMAGE_MODEL = 'wan2.7-image-pro'
export const DEFAULT_VIDEO_MODEL = 'wan2.7-i2v-2026-04-25'
export const DEFAULT_CHAT_MODEL = 'gpt-4o-mini'
export const DEFAULT_IMAGE_SIZE = '2048x2048'
export const DEFAULT_VIDEO_RATIO = '16:9'
export const DEFAULT_VIDEO_DURATION = 5

// Get model by key | 根据 key 获取模型
export const getModelByName = (key) => {
    const allModels = [...IMAGE_MODELS, ...VIDEO_MODELS, ...CHAT_MODELS]
    return allModels.find(m => m.key === key)
}
