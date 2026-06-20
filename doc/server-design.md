# Doodle-Canvas 服务端架构设计方案

> 版本：v3.1\
> 日期：2026-06-17\
> 状态：设计阶段（不涉及代码开发）\
> 变更：MySQL + 宝塔部署 + 模型分类独立配置 + 多地址轮换\
> v3.0 变更：新增**用户账号控制与风控模块**（计费分组 / 邮箱认证 / 登录日志 / 违规封禁 / 充值订单 / 审计日志 / 内容审核 / 风控规则）、**公告与站内消息系统**；统一\*\*金币（Coin）\*\*作为唯一计费单位并记录全量金币流水；强化用户生成内容（UGC）审核与查看能力。
> v3.2 变更：金币精度统一为 `DECIMAL(12,2)`（精确到分，2 位小数）；移除 OSS 对象存储，改为本地磁盘存储 + Nginx 静态分发；文件删除改为软删除（用户侧不可见、管理员可见可溯源）。
> v3.1 变更：文档完善。澄清用户组关系（`user_group_id` 为冗余字段）；新增 `system_settings` 表；补全 SMTP/金币/OSS/限流/内容审核环境变量；新增附录 A（统一响应格式与错误码）、附录 B（request\_id 链路追踪）、附录 C（localStorage 数据迁移）、附录 D（变更历史）；修正实施计划表名并细化阶段。
>
> 本文档由 **v2.0**（`项目文档.md`）与 **v3.0**（`doc/server-design.md`）合并而成，以 v3.0 为最终内容标准，v3.1 在此基础上完善。

***

## 变更摘要（v3.0）

| 维度         | 变更内容                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| **金币体系**   | 余额单位统一为「金币」（Coin），1 金币 = 1 元（可配置汇率）；所有金币变动走 `coin_transactions` 单一流水表，覆盖充值、赠送、消费、退款、管理员调整、过期失效、封禁冻结等**全部场景** |
| **账号生命周期** | 注册邮箱强制认证、登录全量日志、注册 IP/UA 记录、登录异常检测、账号封禁/解封/冻结金币                                                              |
| **计费分组**   | 用户可归入多个「用户组」（User Group），不同组享受不同折扣/赠送/费率/配额                                                                  |
| **风控**     | 频次限制、异常行为检测、敏感词过滤、违规内容举报、自动/人工封禁流水线                                                                          |
| **内容审核**   | 用户生成的图片/视频/对话文本落库，支持人工复审、违规标记、隐藏/删除、追溯用户                                                                     |
| **公告**     | 全站公告、定向公告、弹窗公告、用户端确认已读、站内消息、系统通知                                                                             |
| **充值**     | 兑换码 / 卡密 / 在线支付（预留），充值订单独立成表，与金币流水联动                                                                         |

***

## 一、项目背景与现状分析

### 1.1 现有架构

Doodle-Canvas 当前是一个**纯前端 SPA 应用**（Vue 3 + Vite），核心功能包括：

- **文生图**：支持豆包 Seedream、阿里云万相等模型
- **文生视频 / 图生视频**：支持阿里云万相视频模型
- **大语言模型对话**：支持 OpenAI、DeepSeek、Gemini 等模型
- **节点式画布编排**：基于 Vue Flow 的可视化工作流
- **工作流模板**：5 种预设模板（多角度分镜、电商产品图、短剧角色、场景背景、绘本生成）

### 1.2 现有模型配置体系分析

当前前端通过 `src/config/providers.js` 定义了 3 个渠道适配器：

| 渠道         | 默认地址                                    | 格式                | 能力                   |
| ---------- | --------------------------------------- | ----------------- | -------------------- |
| **OpenAI** | `https://ai.kggzs.cn`                   | 标准 OpenAI 格式      | chat + image + video |
| **阿里云万相**  | `https://dashscope.aliyuncs.com/api/v1` | 非标格式（messages 嵌套） | chat + image + video |
| **豆包**     | `https://ark.cn-beijing.volces.com`     | Responses API 格式  | chat + image         |
| **阶跃星辰**   | `https://api.stepfun.com/step_plan`     | OpenAI Chat + 图片生成/编辑 | chat + image         |

前端通过 `serviceProviders` / `serviceApiKeys` / `serviceBaseUrls` 实现了 chat/image/video 三类服务的独立配置，但：

- API Key 暴露在浏览器端
- 无轮换/负载均衡能力
- 无额度控制

### 1.3 当前痛点

| 问题             | 说明                                 |
| -------------- | ---------------------------------- |
| **无用户体系**      | 没有账号系统，任何人打开即可使用                   |
| **API Key 暴露** | API Key 存储在前端 localStorage，用户可直接查看 |
| **无地址轮换**      | 单个模型只能绑定一个 API 地址，无法多地址负载均衡        |
| **图片本地存储**     | 生成图片缓存在浏览器 IndexedDB（500MB），清理后丢失  |
| **无额度控制**      | 无法限制单个用户的调用次数和消费金额                 |

### 1.4 改造目标

1. 建立完整的**账号体系**（注册 / 登录 / 鉴权）
2. **模型调用由后台统一管理**，图片/视频/回答三类模型可独立配置
3. 每个模型支持配置**多个 API 地址，自动轮换使用**
4. **图片/视频改为服务端存储**（对象存储），持久可靠
5. 后台可设置**用户额度**与**单次生成计费金额**
6. 使用 **MySQL** 数据库，通过 **宝塔面板** 部署

***

## 二、整体架构设计

### 2.1 架构总览

```
┌─────────────────────────────────────────────────────────┐
│                        客户端 (前端)                       │
│              Vue 3 + Vite + Naive UI                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │
│  │ 登录/注册 │ │ 画布工作区│ │ 图片/视频 │ │ 用户中心    │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬──────┘  │
│       └────────────┴────────────┴─────────────┘          │
│                         │ HTTP / SSE                      │
└─────────────────────────┼───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  服务端 (Node.js)                          │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │                  API Gateway                      │    │
│  │         JWT 鉴权 · 速率限制 · 请求路由             │    │
│  └──────────┬──────────────────────────────┬────────┘    │
│             │                              │             │
│  ┌──────────▼──────────┐    ┌──────────────▼──────────┐ │
│  │   用户认证模块       │    │    业务 API 模块         │ │
│  │ · 注册/登录         │    │ · 图片生成 (多地址轮换)   │ │
│  │ · JWT Token 管理     │    │ · 视频生成 (多地址轮换)   │ │
│  │ · 会话管理           │    │ · 对话聊天 SSE (多地址轮换)│ │
│  └──────────┬──────────┘    │ · 模型列表 API          │ │
│             │               │ · 工作流模板 API        │ │
│  ┌──────────▼──────────┐    │ · 项目保存/加载 API      │ │
│  │   额度与计费模块     │    │ · 图片/文件上传 API     │ │
│  │ · 额度查询/扣减     │    └──────────────┬──────────┘ │
│  │ · 计费规则配置       │                   │             │
│  │ · 消费记录           │    ┌──────────────▼──────────┐ │
│  └──────────┬──────────┘    │    管理 API 模块         │ │
│             │               │ · 用户管理               │ │
│  ┌──────────▼──────────┐    │ · 图片模型配置 (多地址)  │ │
│  │   模型调度模块        │    │ · 视频模型配置 (多地址)  │ │
│  │ · 多地址轮换策略     │    │ · 回答模型配置 (多地址)  │ │
│  │ · 故障自动切换       │    │ · 额度/计费规则管理       │ │
│  │ · 请求适配器         │    │ · 消费记录查看           │ │
│  └──────────┬──────────┘    │ · 数据统计/报表         │ │
│             │               └────────────────────────┘ │
│  ┌──────────▼──────────┐                                │
│  │   文件存储模块       │                                │
│  │ · 上传/下载/删除     │                                │
│  │ · 缩略图生成         │                                │
│  │ · CDN 分发           │                                │
│  └─────────────────────┘                                │
└──────────────────────────────────────────────────────────┘
              │
    ┌─────────┼──────────┐
    │         │          │
    ▼         ▼          ▼
┌───────┐ ┌───────┐ ┌─────────┐
│ MySQL │ │ 本地存储 │ │  Redis  │
│ 8.0+  │ │ 磁盘  │ │  缓存   │
└───────┘ └───────┘ └─────────┘
```

### 2.2 技术选型

| 层级        | 推荐方案                   | 备选方案                   | 说明                            |
| --------- | ---------------------- | ---------------------- | ----------------------------- |
| **服务端框架** | Express.js             | Koa / Fastify          | 成熟稳定，生态丰富                     |
| **数据库**   | **MySQL 8.0+**         | —                      | 宝塔原生支持，管理方便                   |
| **ORM**   | Sequelize              | Prisma / Knex          | MySQL 生态最成熟的 Node.js ORM      |
| **缓存**    | Redis                  | —                      | 宝塔一键安装，用于 Token 黑名单、轮换计数、速率限制 |
| **认证**    | JWT (Access + Refresh) | Session-based          | 无状态，适合 SPA                    |
| **密码加密**  | bcrypt (cost=12)       | argon2                 | 行业标准                          |
| **文件存储**  | **本地磁盘 + Nginx 静态分发** | —                          | v3.2：不依赖对象存储，按年月分目录，软删除可溯源 |
| **管理后台**  | 独立 Vue 3 页面            | Naive Admin 模板         | 可复用现有 UI 组件库 (Naive UI)       |
| **部署**    | **宝塔面板**               | —                      | 用户指定                          |

***

## 三、用户认证模块设计

### 3.1 功能概述

| 功能       | 说明                                        |
| -------- | ----------------------------------------- |
| 用户注册     | 邮箱 + 用户名 + 密码；**邮箱必须认证**才能完成注册（见 3.6）     |
| 邮箱认证     | 注册时发送验证链接/验证码，点击或输入后激活账号                  |
| 用户登录     | 邮箱/用户名 + 密码，返回 JWT；**记录登录日志（IP、UA、地理位置）** |
| Token 刷新 | Access Token 过期后自动刷新                      |
| 退出登录     | 使 Token 失效（加入 Redis 黑名单）                  |
| 异常登录提醒   | 异地/新设备登录时发送邮件提醒                           |
| 找回密码     | 通过邮箱重置密码                                  |
| 改密二次验证   | 修改密码需验证原密码或邮箱验证码                          |

### 3.2 认证流程

```
注册流程:
用户填写用户名/密码
        │
        ▼
  前端校验（用户名规则、密码强度）
        │
        ▼
  POST /api/auth/register
        │
        ▼
  后端：校验唯一性 → bcrypt 加密 → 写入 MySQL
        │
        ▼
  返回用户信息（不含密码）

登录流程:
用户填写用户名/密码
        │
        ▼
  POST /api/auth/login
        │
        ▼
  后端：验证 → bcrypt 比对 → 生成 JWT (Access 15min + Refresh 7d)
        │
        ▼
  返回 { accessToken, refreshToken, user }

请求鉴权:
  请求头: Authorization: Bearer <accessToken>
        │
        ▼
  中间件: 验证 JWT → 提取 userId → 注入 request
        │
        ▼
  401 时自动用 refreshToken 换新 accessToken
```

### 3.3 数据库表设计

> 以下所有表均为 **MySQL InnoDB** 引擎，字符集 `utf8mb4`，排序规则 `utf8mb4_unicode_ci`。

#### users 用户表

> v3.0 增强：邮箱认证状态、注册来源信息（IP/UA）、封禁关联、风控标记字段。

```sql
CREATE TABLE users (
    id                  CHAR(36)     PRIMARY KEY,          -- UUID
    username            VARCHAR(50)  NOT NULL UNIQUE,      -- 用户名
    email               VARCHAR(255) NOT NULL UNIQUE,      -- 邮箱（必填，且需认证）
    email_verified_at   DATETIME     DEFAULT NULL,         -- 邮箱认证时间（NULL=未认证）
    password_hash       VARCHAR(255) NOT NULL,              -- bcrypt 加密
    role                ENUM('user','admin') DEFAULT 'user',
    status              ENUM('active','disabled','banned','pending_email') DEFAULT 'pending_email',
                    -- pending_email=待邮箱认证；active=正常；disabled=管理员禁用；banned=风控封禁
    avatar_url          TEXT         DEFAULT NULL,

    -- ★ 计费分组（用户组）
    user_group_id       CHAR(36)     DEFAULT NULL,         -- 主组（冗余字段，仅为快速展示用户徽章；用户可属多组，权威关系见 user_group_members）

    -- ★ 风控与封禁信息
    ban_reason          VARCHAR(500) DEFAULT NULL,         -- 封禁原因
    banned_at           DATETIME     DEFAULT NULL,         -- 封禁时间
    banned_until        DATETIME     DEFAULT NULL,         -- 临时封禁截止时间（NULL=永久）
    banned_by           CHAR(36)     DEFAULT NULL,         -- 封禁操作人（admin user_id）
    unban_at            DATETIME     DEFAULT NULL,         -- 解封时间
    risk_level          ENUM('low','medium','high') DEFAULT 'low', -- 风险等级
    risk_tags           JSON         DEFAULT NULL,         -- 风险标签数组（如 ["刷量","异地登录"]）
    violation_count     INT          DEFAULT 0,            -- 累计违规次数
    coins_frozen        DECIMAL(12,2) DEFAULT 0,           -- 被冻结的金币（封禁时锁定）

    -- ★ 来源与登录信息（注册时记录）
    register_ip         VARCHAR(45)  DEFAULT NULL,         -- 注册 IP（兼容 IPv6）
    register_user_agent TEXT         DEFAULT NULL,         -- 注册时浏览器 UA
    register_referer    VARCHAR(500) DEFAULT NULL,         -- 注册来源页
    register_source     VARCHAR(50)  DEFAULT NULL,         -- 注册渠道（web/invite/oauth...）

    last_login_at       DATETIME     DEFAULT NULL,
    last_login_ip       VARCHAR(45)  DEFAULT NULL,
    last_login_user_agent TEXT       DEFAULT NULL,

    created_at          DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at          DATETIME     DEFAULT NULL,         -- 软删除（保留审计）

    INDEX idx_email (email),
    INDEX idx_status (status),
    INDEX idx_user_group (user_group_id),
    INDEX idx_register_ip (register_ip),
    INDEX idx_risk (risk_level, violation_count)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

> **字段说明**：
>
> - `status='pending_email'` 的账号**不能登录、不能生成内容**，仅能查看公开页面；完成邮箱认证后自动转为 `active`。
> - `coins_frozen` 在封禁时由系统把当前余额转入冻结字段，解封后可退还；永久封禁可由管理员决定是否清零或转出。
> - `risk_tags` 由风控引擎写入，供管理后台高亮显示。
> - **用户组关系**：`user_group_id` 仅为**冗余展示字段**（存"主组"用于徽章/列表快速渲染），**不参与计费**。用户实际可属多个组，权威多对多关系与计费生效逻辑见 `user_group_members`（4.2）与「用户计费分组机制」（4.3）。费率计算时**忽略** `users.user_group_id`，一律以 `user_group_members` 中有效期内 active 的成员关系为准。

#### refresh\_tokens 刷新令牌表

```sql
CREATE TABLE refresh_tokens (
    id              CHAR(36)     PRIMARY KEY,
    user_id         CHAR(36)     NOT NULL,
    token_hash      VARCHAR(255) NOT NULL UNIQUE,
    device_info     TEXT         DEFAULT NULL,
    expires_at      DATETIME     NOT NULL,
    revoked_at      DATETIME     DEFAULT NULL,
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_user (user_id),
    INDEX idx_hash (token_hash),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### email\_verifications 邮箱认证表

> 支持两种认证方式：**验证码**（6 位，邮件正文）和**验证链接**（一次性 Token）。同一邮箱同一用途的旧记录在新记录生成时失效。

```sql
CREATE TABLE email_verifications (
    id              CHAR(36)     PRIMARY KEY,
    user_id         CHAR(36)     DEFAULT NULL,             -- 已注册但未认证的用户（pending_email）
    email           VARCHAR(255) NOT NULL,                 -- 待认证邮箱（也用于注册前预校验）
    code            VARCHAR(10)  DEFAULT NULL,             -- 6 位验证码（bcrypt 存储，code 模式）
    token_hash      VARCHAR(255) DEFAULT NULL,             -- 验证链接 Token 哈希（链接模式）
    purpose         ENUM('register','reset_password','change_email','login') NOT NULL,
    expires_at      DATETIME     NOT NULL,                 -- 过期时间（默认 30 分钟）
    consumed_at     DATETIME     DEFAULT NULL,             -- 已使用时间
    attempts        INT          DEFAULT 0,                -- 尝试次数（防爆破，上限 5）
    request_ip      VARCHAR(45)  DEFAULT NULL,
    request_user_agent TEXT      DEFAULT NULL,
    sent_at         DATETIME     DEFAULT NULL,             -- 邮件实际发送时间
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_email_purpose (email, purpose),
    INDEX idx_user (user_id),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### login\_logs 登录日志表（全量记录）

> **每一次登录尝试**（无论成功失败）都落库，是风控和账号安全审计的核心数据源。失败原因、IP、设备、地理位置均需记录。

```sql
CREATE TABLE login_logs (
    id              BIGINT       AUTO_INCREMENT PRIMARY KEY,
    user_id         CHAR(36)     DEFAULT NULL,             -- 失败时若能识别用户则记录
    email_or_username VARCHAR(255) DEFAULT NULL,           -- 登录账号输入值（脱敏存储）
    login_type      ENUM('password','email_code','oauth','refresh') DEFAULT 'password',
    status          ENUM('success','failed','locked','disabled','banned','pending_email') NOT NULL,
    fail_reason     VARCHAR(100) DEFAULT NULL,             -- WRONG_PASSWORD / NOT_FOUND / LOCKED / BANNED...
    ip              VARCHAR(45)  NOT NULL,
    ip_country      VARCHAR(50)  DEFAULT NULL,             -- 解析后的国家
    ip_region       VARCHAR(50)  DEFAULT NULL,             -- 省/州
    ip_city         VARCHAR(50)  DEFAULT NULL,             -- 城市
    ip_isp          VARCHAR(100) DEFAULT NULL,             -- 运营商
    user_agent      TEXT         DEFAULT NULL,
    ua_browser      VARCHAR(50)  DEFAULT NULL,             -- 解析后的浏览器
    ua_os           VARCHAR(50)  DEFAULT NULL,             -- 解析后的操作系统
    ua_device       VARCHAR(50)  DEFAULT NULL,             -- 解析后的设备类型（PC/Mobile/Tablet/Bot）
    ua_is_bot       TINYINT(1)   DEFAULT 0,
    device_fingerprint VARCHAR(64) DEFAULT NULL,           -- 前端指纹（可选）
    refresh_token_id CHAR(36)    DEFAULT NULL,             -- 成功登录对应的会话
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_user_time (user_id, created_at),
    INDEX idx_ip_time (ip, created_at),
    INDEX idx_status_time (status, created_at),
    INDEX idx_email (email_or_username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

> **IP / UA 解析**：服务端通过 `x-forwarded-for`（Nginx 已设置）取真实 IP，配合 IP 库（如 MaxMind GeoIP2 / ip2region）解析地理位置，配合 `ua-parser-js` 解析 UA。所有需记录 IP 的场景（注册、登录、生成、充值）走同一套中间件 `audit-context.js`。

### 3.4 邮箱认证流程

```
注册流程（强制邮箱认证）:
用户填写邮箱/用户名/密码
        │
        ▼
  前端校验（邮箱格式、用户名规则、密码强度）
        │
        ▼
  POST /api/auth/register
        │
        ▼
  后端：
    1. 校验邮箱/用户名唯一性
    2. 记录注册 IP / UA / Referer / Source
    3. bcrypt 加密密码
    4. 写入 users (status='pending_email')
    5. 生成 6 位验证码 → 写入 email_verifications (purpose='register')
    6. 发送认证邮件（SMTP / 阿里云邮件推送）
        │
        ▼
  返回 { message: '验证码已发送至邮箱', resend_available_in: 60 }

        │  用户在邮箱输入验证码
        ▼
  POST /api/auth/verify-email  { email, code }
        │
        ▼
  后端：
    1. 校验验证码正确性 + 未过期 + 未消耗
    2. 更新 users: status='active', email_verified_at=NOW()
    3. 标记 email_verifications.consumed_at
    4. 初始化用户余额、分配默认用户组、赠送注册金币
    5. 返回登录 Token（用户无需再次登录）

重发验证码: POST /api/auth/resend-verification （60s 节流，限频 5次/小时）
注册超时未认证: pending_email 账号 24 小时未认证 → 定时任务清理（保留日志）
```

### 3.5 登录安全与异常检测

每次登录请求经过以下检查（任一失败即记录 `login_logs` 并拒绝）：

```
登录请求 (email/username + password)
        │
        ▼
  1. Redis 限频：同 IP 5 分钟内 > 20 次 → 拒绝（防爆破）
  2. 查询用户是否存在 → 不存在则记录 fail_reason='NOT_FOUND'
        │
        ▼
  3. 用户状态检查：
     ├─ pending_email → 提示先认证邮箱
     ├─ disabled     → 提示联系管理员
     └─ banned       → 提示封禁原因与截止时间
        │
        ▼
  4. Redis 失败计数：同账号连续失败 5 次 → 锁定 15 分钟
        │
        ▼
  5. bcrypt 校验密码 → 失败记录 fail_reason='WRONG_PASSWORD'
        │
        ▼
  6. 成功：记录 login_logs (status='success')
     ├─ 异地/新设备登录 → 异步发送邮件提醒
     └─ 更新 users.last_login_* 字段
```

### 3.6 API 设计

| 方法     | 路径                            | 说明              | 鉴权 |
| ------ | ----------------------------- | --------------- | -- |
| POST   | /api/auth/register            | 用户注册（发送验证邮件）    | 无  |
| POST   | /api/auth/verify-email        | 验证邮箱（提交验证码）     | 无  |
| POST   | /api/auth/resend-verification | 重发验证码（节流限频）     | 无  |
| POST   | /api/auth/check-email         | 检查邮箱是否已注册       | 无  |
| POST   | /api/auth/login               | 用户登录            | 无  |
| POST   | /api/auth/logout              | 退出登录            | 需要 |
| POST   | /api/auth/refresh             | 刷新 Token        | 需要 |
| GET    | /api/auth/me                  | 当前用户信息          | 需要 |
| PUT    | /api/auth/password            | 修改密码（需原密码）      | 需要 |
| POST   | /api/auth/forgot-password     | 忘记密码（发送重置邮件）    | 无  |
| POST   | /api/auth/reset-password      | 重置密码（验证码 + 新密码） | 无  |
| POST   | /api/auth/change-email        | 换绑邮箱（需新邮箱验证）    | 需要 |
| GET    | /api/auth/sessions            | 我的登录会话列表        | 需要 |
| DELETE | /api/auth/sessions/:id        | 注销其他会话          | 需要 |
| GET    | /api/auth/login-logs          | 我的登录记录（分页）      | 需要 |

***

## 四、用户账号控制与风控模块（v3.0 新增）

> 本章是 v3.0 的核心新增模块，覆盖：**用户计费分组、账号封禁/解封、充值订单、金币全量流水、审计日志、访问日志、内容审核、风控规则、用户生成内容（UGC）查看**。
> 设计目标：账号全生命周期可控、每一笔金币变动可追溯、每一次关键操作有审计、每一条生成内容可复审。

### 4.1 模块总览

```
┌─────────────────────────────────────────────────────────┐
│              账号控制与风控模块                            │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  用户组管理 ──┐                                          │
│   · 折扣/赠送  │                                          │
│   · 费率/配额 ─┼─→ 用户账号控制                            │
│               │   · 启用/禁用/封禁/解封                    │
│  充值订单 ────┤   · 金币冻结/清零                          │
│   · 卡密兑换   │   · 用户组调整                            │
│   · 在线支付   │   · 风险等级标记                          │
│               │                                          │
│  金币流水 ────┼─→ 风控引擎                                 │
│   · 全量变动   │   · 频次限制                              │
│   · 双向追溯   │   · 异常行为检测                          │
│               │   · 自动封禁触发                           │
│  内容审核 ────┤                                          │
│   · 生成内容   │                                          │
│   · 人工复审   │                                          │
│   · 违规举报   │                                          │
│                                                          │
│  审计日志：所有管理员操作 + 敏感用户操作全量记录            │
│  访问日志：关键 API 调用记录（IP/UA/耗时/结果）            │
└─────────────────────────────────────────────────────────┘
```

### 4.2 数据库表设计

#### user\_groups 用户计费分组表

> 一个用户组代表一类用户（如：普通用户 / VIP / 内测 / 企业 / 黑名单），每组可配置独立折扣、赠送倍率、调用配额、费率倍数。

```sql
CREATE TABLE user_groups (
    id                  CHAR(36)     PRIMARY KEY,
    name                VARCHAR(50)  NOT NULL UNIQUE,       -- 组名（普通用户/VIP/内测...）
    code                VARCHAR(30)  NOT NULL UNIQUE,       -- 组代码（normal/vip/beta...）
    description         VARCHAR(255) DEFAULT NULL,
    is_default          TINYINT(1)   DEFAULT 0,             -- 是否为默认组（新用户自动加入）
    is_system           TINYINT(1)   DEFAULT 0,             -- 系统内置组不可删除
    discount_rate       DECIMAL(4,3) DEFAULT 1.000,         -- 折扣系数（0.8 = 八折）
    recharge_bonus_rate DECIMAL(4,3) DEFAULT 1.000,         -- 充值赠送倍率（1.2 = 充100得120）
    cost_multiplier     DECIMAL(4,3) DEFAULT 1.000,         -- 消费费率倍数（VIP 0.8 / 黑名单 5.0）
    daily_generate_limit INT         DEFAULT 0,             -- 每日生成次数上限（0=不限）
    daily_coin_limit    DECIMAL(12,2) DEFAULT 0,            -- 每日消费金币上限（0=不限）
    monthly_coin_limit  DECIMAL(12,2) DEFAULT 0,            -- 每月消费金币上限（0=不限）
    priority            INT          DEFAULT 0,             -- 优先级（用户可属多组时取最高）
    badge_color         VARCHAR(20)  DEFAULT NULL,          -- 前端徽章颜色
    is_active           TINYINT(1)   DEFAULT 1,
    created_at          DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_default (is_default),
    INDEX idx_active (is_active, priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

> **计费关系**：用户实际消费 = `模型原价 × cost_multiplier`；充值到账 = `充值金额 × recharge_bonus_rate`；用户可归属多个组（见 user\_group\_members），最终费率取**对用户最有利**的组（即 `cost_multiplier` 最小值）。

#### user\_group\_members 用户-组关系表（多对多）

```sql
CREATE TABLE user_group_members (
    id              CHAR(36)     PRIMARY KEY,
    user_id         CHAR(36)     NOT NULL,
    group_id        CHAR(36)     NOT NULL,
    joined_at       DATETIME     DEFAULT CURRENT_TIMESTAMP,
    expires_at      DATETIME     DEFAULT NULL,             -- 组成员资格有效期（NULL=永久）
    granted_by      CHAR(36)     DEFAULT NULL,             -- 授权人（管理员）
    grant_reason    VARCHAR(255) DEFAULT NULL,
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uk_user_group (user_id, group_id),
    INDEX idx_group (group_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### user\_bans 封禁记录表（每次封禁/解封一条流水）

> 永久记录所有封禁与解封动作，支持追溯与申诉。一次封禁对应可能的一次解封（通过 `related_ban_id` 关联）。

```sql
CREATE TABLE user_bans (
    id              CHAR(36)     PRIMARY KEY,
    user_id         CHAR(36)     NOT NULL,
    action          ENUM('ban','unban','freeze_coins','unfreeze_coins') NOT NULL,
    ban_type        ENUM('temporary','permanent') DEFAULT NULL,  -- 仅 ban 动作有值
    reason_category ENUM('violation_content','abuse','fraud','multi_account','spam','manual','other')
                    DEFAULT 'manual',
    reason          VARCHAR(500) NOT NULL,                -- 详细原因
    evidence        JSON         DEFAULT NULL,            -- 证据：举报ID/生成记录ID/日志快照
    operator_id     CHAR(36)     DEFAULT NULL,            -- 操作管理员（NULL=系统自动）
    operator_type   ENUM('admin','system_auto') DEFAULT 'admin',
    expires_at      DATETIME     DEFAULT NULL,            -- 临时封禁到期时间
    related_ban_id  CHAR(36)     DEFAULT NULL,            -- 解封动作关联的原封禁ID
    coins_amount    DECIMAL(12,2) DEFAULT NULL,           -- 冻结/解冻的金币数
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_user_time (user_id, created_at),
    INDEX idx_action (action),
    INDEX idx_operator (operator_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### recharge\_orders 充值订单表

> 支持卡密兑换、兑换码、在线支付（预留）三种方式。订单状态变更全程记录，最终通过金币流水入账。

```sql
CREATE TABLE recharge_orders (
    id                  CHAR(36)     PRIMARY KEY,
    order_no            VARCHAR(40)  NOT NULL UNIQUE,      -- 业务订单号（R + 时间戳 + 随机）
    user_id             CHAR(36)     NOT NULL,
    recharge_type       ENUM('card','redemption_code','online_pay','admin_grant') NOT NULL,
    amount_paid         DECIMAL(12,2) DEFAULT 0,           -- 实付金额（元）
    coins_base          DECIMAL(12,2) NOT NULL,            -- 基础金币数
    coins_bonus         DECIMAL(12,2) DEFAULT 0,           -- 赠送金币数
    coins_total         DECIMAL(12,2) NOT NULL,            -- 实际到账金币 = base + bonus
    exchange_rate       DECIMAL(10,4) DEFAULT 1.0000,      -- 当时的金币汇率
    status              ENUM('pending','paid','completed','failed','cancelled','refunded')
                        DEFAULT 'pending',
    pay_channel         VARCHAR(50)  DEFAULT NULL,         -- alipay/wechat/card_code...
    pay_transaction_id  VARCHAR(100) DEFAULT NULL,         -- 第三方交易号
    card_code_id        CHAR(36)     DEFAULT NULL,         -- 关联卡密（见 redeem_cards）
    paid_at             DATETIME     DEFAULT NULL,
    completed_at        DATETIME     DEFAULT NULL,
    expire_at           DATETIME     DEFAULT NULL,         -- 订单过期时间
    client_ip           VARCHAR(45)  DEFAULT NULL,
    user_agent          TEXT         DEFAULT NULL,
    remark              VARCHAR(255) DEFAULT NULL,
    created_at          DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_user_time (user_id, created_at),
    INDEX idx_status (status),
    INDEX idx_order_no (order_no),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### redeem\_cards 兑换卡密表

> 管理员预先生成的卡密，用户输入后兑换为金币。一码一用，可设置面额、有效期、批次。

```sql
CREATE TABLE redeem_cards (
    id              CHAR(36)     PRIMARY KEY,
    card_code       VARCHAR(64)  NOT NULL UNIQUE,          -- 卡密（bcrypt 存储 hash，原文仅生成时返回一次）
    card_code_hash  VARCHAR(255) NOT NULL UNIQUE,
    face_value      DECIMAL(12,2) NOT NULL,                -- 面额（金币）
    batch_id        CHAR(36)     DEFAULT NULL,             -- 批次ID
    batch_name      VARCHAR(100) DEFAULT NULL,
    status          ENUM('unused','used','disabled','expired') DEFAULT 'unused',
    used_by         CHAR(36)     DEFAULT NULL,
    used_order_id   CHAR(36)     DEFAULT NULL,             -- 关联充值订单
    used_ip         VARCHAR(45)  DEFAULT NULL,
    used_at         DATETIME     DEFAULT NULL,
    expire_at       DATETIME     DEFAULT NULL,
    created_by      CHAR(36)     DEFAULT NULL,             -- 创建管理员
    note            VARCHAR(255) DEFAULT NULL,
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_status (status),
    INDEX idx_batch (batch_id),
    INDEX idx_used_by (used_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

> **金币（Coin）统一约定**：v3.0 起，用户余额、流水、计费、充值均使用「金币」单位（数据库字段统一为 `coin`/`coins_*` 或 `balance`）。系统设置 `COIN_EXCHANGE_RATE` 配置金币↔法币汇率（默认 1 金币 = 1 元）。本章所有金币变动**必须**写入统一的 `coin_transactions` 表（见第七章），确保全量流水可追溯。

#### audit\_logs 审计日志表（管理员操作 + 敏感用户操作）

> **所有写操作**只要满足下列任一条件即落库：① 由管理员发起；② 涉及金币变动；③ 涉及账号状态/权限变更；④ 涉及内容删除/审核；⑤ 涉及系统配置。这是合规与追溯的核心表，**只增不删**，建议按月分区或归档。

```sql
CREATE TABLE audit_logs (
    id              BIGINT       AUTO_INCREMENT PRIMARY KEY,
    actor_id        CHAR(36)     DEFAULT NULL,            -- 操作人 user_id（NULL=系统/匿名）
    actor_type      ENUM('admin','user','system','cron') NOT NULL,
    actor_username  VARCHAR(50)  DEFAULT NULL,            -- 冗余便于检索
    actor_ip        VARCHAR(45)  DEFAULT NULL,
    actor_user_agent TEXT        DEFAULT NULL,
    action          VARCHAR(50)  NOT NULL,                -- 动作代码（见下方枚举）
    action_category ENUM('user','billing','content','model','system','security') NOT NULL,
    target_type     VARCHAR(30)  DEFAULT NULL,            -- 操作对象类型（user/recharge_order/record...）
    target_id       CHAR(36)     DEFAULT NULL,            -- 操作对象 ID
    target_snapshot JSON         DEFAULT NULL,            -- 操作前的对象快照
    changes         JSON         DEFAULT NULL,            -- 变更字段 diff（before/after）
    description     VARCHAR(500) DEFAULT NULL,            -- 人类可读描述
    result          ENUM('success','failed') DEFAULT 'success',
    error_message   VARCHAR(500) DEFAULT NULL,
    request_id      VARCHAR(50)  DEFAULT NULL,            -- 请求追踪ID
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_actor_time (actor_id, created_at),
    INDEX idx_action (action),
    INDEX idx_target (target_type, target_id),
    INDEX idx_category_time (action_category, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**action 动作代码枚举（部分）**：

| 分类       | 动作代码                                                 | 说明         |
| -------- | ---------------------------------------------------- | ---------- |
| user     | `user.ban` / `user.unban`                            | 封禁/解封用户    |
| user     | `user.freeze_coins` / `user.unfreeze_coins`          | 冻结/解冻金币    |
| user     | `user.group.assign` / `user.group.remove`            | 加入/移出用户组   |
| user     | `user.status.change`                                 | 改账号状态      |
| user     | `user.role.change`                                   | 改角色（提权/降权） |
| user     | `user.password.reset`                                | 管理员重置密码    |
| billing  | `billing.recharge` / `billing.gift`                  | 充值/赠送      |
| billing  | `billing.adjust` / `billing.rollback`                | 手工调整/冲正    |
| billing  | `billing.rule.create/update/delete`                  | 计费规则变更     |
| content  | `content.review` / `content.hide` / `content.delete` | 内容复审/隐藏/删除 |
| model    | `model.create/update/delete` / `channel.*`           | 模型/渠道变更    |
| system   | `system.setting.update` / `system.announce.*`        | 系统设置/公告    |
| security | `security.login.admin` / `security.config.export`    | 管理员登录/数据导出 |

#### access\_logs 访问日志表（关键 API 调用记录）

> 记录关键业务 API 的调用情况，用于排查问题、行为分析、风控取证。区别于 `login_logs`（只记登录），本表记录**生成、上传、充值、管理操作**等高价值请求。可通过配置决定采样率。

```sql
CREATE TABLE access_logs (
    id              BIGINT       AUTO_INCREMENT PRIMARY KEY,
    request_id      VARCHAR(50)  NOT NULL,                -- 链路追踪ID（响应头 X-Request-Id）
    user_id         CHAR(36)     DEFAULT NULL,            -- 已登录用户
    method          VARCHAR(10)  NOT NULL,                -- GET/POST/PUT/DELETE
    path            VARCHAR(255) NOT NULL,                -- 请求路径
    route_name      VARCHAR(100) DEFAULT NULL,            -- 命中的路由名
    status_code     INT          NOT NULL,                -- HTTP 状态码
    response_code   VARCHAR(50)  DEFAULT NULL,            -- 业务状态码
    duration_ms     INT          DEFAULT NULL,            -- 耗时
    request_size    BIGINT       DEFAULT NULL,            -- 请求体大小（字节）
    response_size   BIGINT       DEFAULT NULL,            -- 响应体大小
    ip              VARCHAR(45)  DEFAULT NULL,
    user_agent      TEXT         DEFAULT NULL,
    ua_browser      VARCHAR(50)  DEFAULT NULL,
    ua_os           VARCHAR(50)  DEFAULT NULL,
    ua_device       VARCHAR(50)  DEFAULT NULL,
    referer         VARCHAR(500) DEFAULT NULL,
    params_summary  JSON         DEFAULT NULL,            -- 关键参数（脱敏，不含密钥/密码）
    error_message   VARCHAR(500) DEFAULT NULL,
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_user_time (user_id, created_at),
    INDEX idx_path_time (path, created_at),
    INDEX idx_status (status_code),
    INDEX idx_ip_time (ip, created_at),
    INDEX idx_request_id (request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### content\_review 内容审核表（用户生成内容复审）

> 每一条用户生成的图片/视频/对话文本都创建一条 review 记录，记录自动审核结果与人工复审结果。`generation_records` 的 `id` 作为外键关联。

```sql
CREATE TABLE content_review (
    id                  CHAR(36)     PRIMARY KEY,
    generation_id       CHAR(36)     NOT NULL,            -- 关联 generation_records
    user_id             CHAR(36)     NOT NULL,
    content_type        ENUM('image','video','text') NOT NULL,
    content_urls        JSON         DEFAULT NULL,        -- 被审核的内容URL列表
    content_text        TEXT         DEFAULT NULL,        -- 文本内容（对话/提示词）

    -- 自动审核
    auto_status         ENUM('pending','pass','review','reject') DEFAULT 'pending',
    auto_source         ENUM('aliyun_green','tencent_cms','keyword_filter','none')
                        DEFAULT 'none',
    auto_labels         JSON         DEFAULT NULL,        -- 自动标签 [{label:'porn',score:0.92}]
    auto_score          DECIMAL(5,2) DEFAULT NULL,        -- 综合风险分
    auto_checked_at     DATETIME     DEFAULT NULL,

    -- 人工复审
    manual_status       ENUM('pending','pass','reject','hidden','restored') DEFAULT 'pending',
    manual_reviewer_id  CHAR(36)     DEFAULT NULL,
    manual_reason       VARCHAR(500) DEFAULT NULL,
    manual_reviewed_at  DATETIME     DEFAULT NULL,

    -- 处置
    is_hidden           TINYINT(1)   DEFAULT 0,           -- 是否对用户隐藏
    user_notified       TINYINT(1)   DEFAULT 0,           -- 是否已通知用户
    created_at          DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_generation (generation_id),
    INDEX idx_user (user_id),
    INDEX idx_auto_status (auto_status),
    INDEX idx_manual_status (manual_status, created_at),
    FOREIGN KEY (generation_id) REFERENCES generation_records(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### content\_reports 内容举报表

> 用户可对他人或自己的生成内容发起举报，举报进入审核队列。

```sql
CREATE TABLE content_reports (
    id              CHAR(36)     PRIMARY KEY,
    generation_id   CHAR(36)     NOT NULL,
    reported_user_id CHAR(36)    NOT NULL,                -- 被举报内容归属用户
    reporter_id     CHAR(36)     NOT NULL,                -- 举报人
    reason_category ENUM('porn','violence','politics','spam','copyright','fraud','other')
                    NOT NULL,
    reason_detail   VARCHAR(500) DEFAULT NULL,
    evidence        JSON         DEFAULT NULL,            -- 截图URL等
    status          ENUM('pending','reviewing','resolved','dismissed') DEFAULT 'pending',
    reviewer_id     CHAR(36)     DEFAULT NULL,
    review_result   VARCHAR(500) DEFAULT NULL,
    review_action   ENUM('none','hide','delete','ban_user','restore') DEFAULT NULL,
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    reviewed_at     DATETIME     DEFAULT NULL,

    INDEX idx_status (status, created_at),
    INDEX idx_reported_user (reported_user_id),
    INDEX idx_generation (generation_id),
    FOREIGN KEY (generation_id) REFERENCES generation_records(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### risk\_rules 风控规则表

> 可配置的风控规则（频次、阈值、行为模式），命中后触发动作（告警/限流/封禁）。

```sql
CREATE TABLE risk_rules (
    id              CHAR(36)     PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    code            VARCHAR(50)  NOT NULL UNIQUE,
    description     VARCHAR(500) DEFAULT NULL,
    rule_type       ENUM('frequency','threshold','pattern','composite') NOT NULL,
    metric          VARCHAR(50)  NOT NULL,                -- 指标：generate_per_min/recharge_amount/login_fail...
    dimension       ENUM('user','ip','device','global') DEFAULT 'user',
    condition       JSON         NOT NULL,                -- 触发条件（{window:60, op:'gt', value:30}）
    action          ENUM('alert','throttle','block','ban_temp','ban_permanent','freeze_coins')
                    DEFAULT 'alert',
    action_params   JSON         DEFAULT NULL,            -- 动作参数（如 ban 时长）
    severity        ENUM('low','medium','high') DEFAULT 'medium',
    is_active       TINYINT(1)   DEFAULT 1,
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_type_active (rule_type, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### risk\_events 风控事件表

> 每次命中风控规则记录一条事件，是风控中心的核心数据，可联动自动封禁与人工复核。

```sql
CREATE TABLE risk_events (
    id              BIGINT       AUTO_INCREMENT PRIMARY KEY,
    rule_id         CHAR(36)     DEFAULT NULL,
    rule_code       VARCHAR(50)  NOT NULL,
    rule_name       VARCHAR(100) DEFAULT NULL,
    user_id         CHAR(36)     DEFAULT NULL,
    ip              VARCHAR(45)  DEFAULT NULL,
    device_fingerprint VARCHAR(64) DEFAULT NULL,
    metric_value    DECIMAL(14,4) DEFAULT NULL,           -- 触发时的指标值
    threshold       DECIMAL(14,4) DEFAULT NULL,
    action_taken    VARCHAR(30)  NOT NULL,                -- 实际执行的动作
    action_detail   JSON         DEFAULT NULL,            -- 执行详情（封禁时长等）
    context         JSON         DEFAULT NULL,            -- 上下文快照
    status          ENUM('triggered','auto_handled','manual_reviewing','resolved','false_positive')
                    DEFAULT 'triggered',
    handled_by      CHAR(36)     DEFAULT NULL,
    handled_at      DATETIME     DEFAULT NULL,
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_user_time (user_id, created_at),
    INDEX idx_rule_time (rule_code, created_at),
    INDEX idx_ip_time (ip, created_at),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4.3 用户计费分组机制

**生效优先级**：用户可属于多个组（user\_group\_members），系统按以下规则计算最终费率：

```
1. 取用户所有「有效期内且 active」的组成员关系
2. 对每组取出 cost_multiplier，取最小值（对用户最有利）
3. 同时对配额类限制（daily/monthly limit）取最宽松（即最大上限）
4. 黑名单组（cost_multiplier 异常高）单独标记，命中即覆盖其他组的优惠
```

**计费公式**：

```
实际扣费 = 模型原价 × 用户最终 cost_multiplier × 折扣（活动/优惠券）
充值到账 = 充值金额 × COIN_EXCHANGE_RATE × 用户最终 recharge_bonus_rate
每日配额 = min(daily_generate_limit 跨组最大值) ；命中则当日禁生成
```

**API**：

| 方法     | 路径                                   | 说明           |
| ------ | ------------------------------------ | ------------ |
| GET    | /api/admin/user-groups               | 用户组列表        |
| POST   | /api/admin/user-groups               | 创建用户组        |
| PUT    | /api/admin/user-groups/:id           | 更新用户组        |
| DELETE | /api/admin/user-groups/:id           | 删除用户组（系统组禁删） |
| GET    | /api/admin/users/:id/groups          | 用户所属组        |
| POST   | /api/admin/users/:id/groups          | 加入用户组（支持设过期） |
| DELETE | /api/admin/users/:id/groups/:groupId | 移出用户组        |
| GET    | /api/user-groups/my                  | 当前用户所属组与权益   |

### 4.4 账号封禁与解封流程

```
触发封禁（管理员手动 / 风控自动）
        │
        ▼
  1. 记录封禁原因、证据、操作人、到期时间
  2. 更新 users: status='banned', banned_at, banned_until, ban_reason, banned_by
  3. 冻结金币：balance → coins_frozen（写入 user_bans action='freeze_coins'）
     · 永久封禁：可由管理员决定清零或保留
     · 临时封禁：到期自动转回 balance
  4. 撤销所有有效 refresh_token（强制下线）
  5. 加入 Redis 封禁名单（鉴权中间件秒级拦截）
  6. 写入 audit_logs: action='user.ban'
  7. 发送站内消息通知用户
        │
        ▼
  封禁期间：
  · 用户尝试登录 → login_logs status='banned'，提示封禁原因与到期时间
  · 用户尝试调用 API → 403 BANNED
  · 用户可发起申诉（POST /api/appeals）

解封流程：
  1. 管理员审核申诉 或 临时封禁到期自动解封
  2. 更新 users: status='active', unban_at
  3. 解冻金币：coins_frozen → balance（user_bans action='unfreeze_coins'）
  4. 移出 Redis 封禁名单
  5. 写入 audit_logs: action='user.unban'
  6. 通知用户
```

### 4.5 用户生成内容（UGC）查看与审核

管理员可在后台查看**任意用户**的全部生成历史，并执行审核动作：

```
管理员 → 风控中心 → 内容审核
        │
        ├─ 按用户筛选：查看该用户全部 generation_records
        │   └─ 关联 content_review 显示自动/人工审核状态
        ├─ 按状态筛选：pending(待审)/review(复审)/reject(违规)
        ├─ 按违规标签筛选：porn/violence/politics/...
        │
        ▼
  审核动作（单条 / 批量）：
  ├─ 标记通过 (pass)            → 不影响展示
  ├─ 隐藏 (hide)               → 对所有用户不可见，但保留记录
  ├─ 删除 (delete)              → 软删除 generation_records + 隐藏文件
  ├─ 还原 (restore)             → 撤销隐藏
  ├─ 扣金币/封禁用户            → 联动 coin_transactions + user_bans
  └─ 全部动作写 audit_logs + 触发站内消息通知用户
```

**用户侧查看自己的生成内容**：通过 `/api/records`（含审核状态字段），违规被隐藏的内容对用户显示「内容已被管理员审核处理」。

### 4.6 风控规则引擎

内置一批开箱即用的风控规则，均可在管理后台开关与调参：

| 规则代码                       | 触发条件                 | 默认动作                 |
| -------------------------- | -------------------- | -------------------- |
| `rate.generate.ip`         | 同 IP 每分钟生成 > 30 次    | throttle（限流）         |
| `rate.generate.user`       | 同用户每分钟生成 > 20 次      | throttle             |
| `daily.limit.user`         | 用户当日消费超出用户组配额        | block                |
| `burst.recharge`           | 1 小时内多账号同 IP 充值      | alert + 人工复核         |
| `multi.account`            | 同设备指纹绑定 > 3 账号       | 标记 high risk         |
| `content.violation.repeat` | 用户 24h 内被拒内容 ≥ 3 次   | ban\_temp 24h + 冻结金币 |
| `login.fail.burst`         | 同 IP 5 分钟登录失败 > 20 次 | block IP 1h          |
| `balance.abuse`            | 充值后立即全部消费后申请退款       | freeze\_coins + 人工   |

**风控事件处理流水线**：

```
请求经过风控中间件
        │
        ▼
  1. 采集维度（user_id / ip / device）
  2. Redis 滑动窗口计算各项 metric
  3. 命中任一活跃 risk_rule？
        ├─ 否 → 放行
        └─ 是
            ├─ 写入 risk_events
            ├─ 执行 action（alert/throttle/block/ban_temp/ban_permanent/freeze_coins）
            ├─ 高危动作（封禁/冻结）→ 走 4.4 流程
            └─ 推送管理后台告警（站内消息 + 可选邮件）
```

### 4.7 审计日志采集策略

通过统一的 `audit-context.js` 中间件 + 服务层 `AuditService.log()` 主动调用，覆盖：

| 触发场景                 | 采集方式                 |
| -------------------- | -------------------- |
| 管理员所有写操作（路由级）        | 路由中间件自动包裹            |
| 金币变动（充值/赠送/消费/退款/调整） | BillingService 内部调用  |
| 账号状态/组/角色变更          | UserService 内部调用     |
| 内容审核/删除/还原           | ReviewService 内部调用   |
| 模型/渠道/计费规则变更         | AdminService 内部调用    |
| 系统设置/公告发布            | SettingsService 内部调用 |
| 用户敏感操作（改密/换绑邮箱/导出数据） | 接口内调用                |

每条日志携带 `request_id`（与 access\_logs 贯通），便于跨表追踪一次请求产生的所有副作用。

### 4.8 账号控制与风控 API 汇总

#### 用户组管理

| 方法     | 路径                                   | 说明    |
| ------ | ------------------------------------ | ----- |
| GET    | /api/admin/user-groups               | 用户组列表 |
| POST   | /api/admin/user-groups               | 创建用户组 |
| PUT    | /api/admin/user-groups/:id           | 更新用户组 |
| DELETE | /api/admin/user-groups/:id           | 删除用户组 |
| GET    | /api/admin/users/:id/groups          | 用户所属组 |
| POST   | /api/admin/users/:id/groups          | 加入用户组 |
| DELETE | /api/admin/users/:id/groups/:groupId | 移出用户组 |

#### 账号封禁与金币控制

| 方法   | 路径                                  | 说明                      |
| ---- | ----------------------------------- | ----------------------- |
| POST | /api/admin/users/:id/ban            | 封禁用户（临时/永久 + 原因 + 冻结金币） |
| POST | /api/admin/users/:id/unban          | 解封用户（解冻金币）              |
| POST | /api/admin/users/:id/freeze-coins   | 单独冻结金币                  |
| POST | /api/admin/users/:id/unfreeze-coins | 单独解冻金币                  |
| GET  | /api/admin/users/:id/bans           | 封禁历史                    |
| POST | /api/appeals                        | 用户提交申诉（无 admin）         |
| GET  | /api/admin/appeals                  | 申诉列表                    |
| PUT  | /api/admin/appeals/:id              | 处理申诉                    |

#### 充值与卡密

| 方法   | 路径                            | 说明          |
| ---- | ----------------------------- | ----------- |
| POST | /api/recharge/redeem          | 用户兑换卡密      |
| GET  | /api/recharge/orders          | 我的充值订单      |
| POST | /api/admin/redeem-cards/batch | 批量生成卡密      |
| GET  | /api/admin/redeem-cards       | 卡密列表（分批/状态） |
| PUT  | /api/admin/redeem-cards/:id   | 禁用/续期卡密     |
| GET  | /api/admin/recharge/orders    | 全部充值订单      |
| POST | /api/admin/users/:id/recharge | 管理员直接充值     |
| POST | /api/admin/users/:id/gift     | 管理员赠送金币     |

#### 金币流水与审计

| 方法  | 路径                            | 说明              |
| --- | ----------------------------- | --------------- |
| GET | /api/coins/transactions       | 我的金币流水（多维度筛选）   |
| GET | /api/admin/coins/transactions | 全站金币流水          |
| GET | /api/admin/audit-logs         | 审计日志（多维筛选 + 导出） |
| GET | /api/admin/access-logs        | 访问日志（多维筛选）      |
| GET | /api/admin/login-logs         | 全站登录日志          |

#### 内容审核与举报

| 方法   | 路径                               | 说明               |
| ---- | -------------------------------- | ---------------- |
| GET  | /api/admin/review/queue          | 待审核内容队列          |
| GET  | /api/admin/review/list           | 审核内容列表（多维筛选）     |
| PUT  | /api/admin/review/:id            | 提交复审结果（通过/隐藏/删除） |
| POST | /api/admin/review/batch          | 批量审核             |
| GET  | /api/admin/users/:id/generations | 用户全部生成内容（含审核状态）  |
| POST | /api/reports                     | 用户举报内容           |
| GET  | /api/admin/reports               | 举报列表             |
| PUT  | /api/admin/reports/:id           | 处理举报             |

#### 风控中心

| 方法   | 路径                                | 说明           |
| ---- | --------------------------------- | ------------ |
| GET  | /api/admin/risk/rules             | 风控规则列表       |
| POST | /api/admin/risk/rules             | 创建规则         |
| PUT  | /api/admin/risk/rules/:id         | 更新规则         |
| GET  | /api/admin/risk/events            | 风控事件列表       |
| GET  | /api/admin/risk/dashboard         | 风控大盘（实时指标）   |
| POST | /api/admin/risk/events/:id/handle | 人工处理风控事件     |
| GET  | /api/admin/risk/blacklist/ip      | IP 黑名单       |
| POST | /api/admin/risk/blacklist/ip      | 加入/移出 IP 黑名单 |

***

## 五、公告与站内消息系统（v3.0 新增）

> 提供面向用户的信息触达能力，覆盖：**全站公告、定向公告、弹窗公告、用户端已读确认、站内消息、系统通知**。公告与站内消息分离设计：公告是「一对多」的广播（用户读后写已读），站内消息是「一对一」的通知（封禁、充值到账、审核结果等事件驱动）。

### 5.1 模块总览

```
┌─────────────────────────────────────────────────────────┐
│                公告与消息系统                              │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  公告管理（Admin）                                       │
│   ├─ 全站公告：所有登录用户可见                          │
│   ├─ 定向公告：按用户组 / 指定用户 / 风险等级投放         │
│   ├─ 弹窗公告：登录/首屏强制弹窗，需用户确认              │
│   ├─ 公告横幅：顶部滚动条常驻                            │
│   └─ 生效时段 + 排序 + 启停                              │
│                                                          │
│  站内消息（一对一/事件驱动）                             │
│   ├─ 系统通知：充值到账 / 封禁 / 解封 / 审核结果          │
│   ├─ 风控告警：异常登录 / 配额预警                       │
│   └─ 管理员群发：选用户组批量发送                        │
│                                                          │
│  用户端                                                  │
│   ├─ 公告列表 + 已读标记（公告-用户已读关系）             │
│   ├─ 消息中心：未读计数、列表、详情、标已读               │
│   └─ WebSocket / 轮询：实时未读数（小红点）               │
└─────────────────────────────────────────────────────────┘
```

### 5.2 数据库表设计

#### announcements 公告表

```sql
CREATE TABLE announcements (
    id              CHAR(36)     PRIMARY KEY,
    title           VARCHAR(200) NOT NULL,
    content         MEDIUMTEXT   NOT NULL,                -- 支持 Markdown / HTML
    content_format  ENUM('markdown','html','text') DEFAULT 'markdown',
    summary         VARCHAR(500) DEFAULT NULL,            -- 摘要（列表展示）

    -- 展示方式
    display_type    ENUM('banner','list','popup','banner_and_popup') DEFAULT 'list',
    -- banner=顶部横幅；list=消息列表项；popup=首屏强制弹窗
    popup_dismissible TINYINT(1) DEFAULT 1,               -- 弹窗是否可关闭
    popup_show_count INT         DEFAULT 1,               -- 弹窗每人最多展示次数（0=每次登录）
    banner_color    VARCHAR(20)  DEFAULT NULL,            -- 横幅颜色（info/warning/success）
    cover_image     TEXT         DEFAULT NULL,
    action_url      VARCHAR(500) DEFAULT NULL,            -- 点击跳转链接
    action_text     VARCHAR(50)  DEFAULT NULL,            -- 跳转按钮文案

    -- 投放范围
    target_scope    ENUM('all','group','user','risk_level') DEFAULT 'all',
    target_config   JSON         DEFAULT NULL,
    -- group:   {group_ids:[...]}
    -- user:    {user_ids:[...]}
    -- risk_level: {levels:['high','medium']}

    -- 时效
    priority        INT          DEFAULT 0,               -- 排序（越大越靠前）
    publish_at      DATETIME     NOT NULL,                -- 发布时间（可定时发布）
    expire_at       DATETIME     DEFAULT NULL,            -- 过期时间（NULL=长期）
    is_pinned       TINYINT(1)   DEFAULT 0,               -- 是否置顶
    is_active       TINYINT(1)   DEFAULT 1,

    -- 作者与统计
    author_id       CHAR(36)     DEFAULT NULL,            -- 创建管理员
    view_count      BIGINT       DEFAULT 0,               -- 浏览量（去重用户）
    read_count      BIGINT       DEFAULT 0,               -- 已读数

    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_active_publish (is_active, publish_at, priority),
    INDEX idx_scope (target_scope),
    INDEX idx_expire (expire_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### announcement\_reads 公告已读关系表

> 记录每个用户对每条公告的已读/确认状态。对于 popup 公告还需记录「已确认」动作。

```sql
CREATE TABLE announcement_reads (
    id              BIGINT       AUTO_INCREMENT PRIMARY KEY,
    announcement_id CHAR(36)     NOT NULL,
    user_id         CHAR(36)     NOT NULL,
    read_at         DATETIME     DEFAULT CURRENT_TIMESTAMP,
    confirmed_at    DATETIME     DEFAULT NULL,            -- popup 公告的「我知道了」时间
    popup_shown_count INT        DEFAULT 0,               -- 已弹窗次数
    read_ip         VARCHAR(45)  DEFAULT NULL,
    read_user_agent TEXT         DEFAULT NULL,

    UNIQUE KEY uk_ann_user (announcement_id, user_id),
    INDEX idx_user (user_id),
    FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### messages 站内消息表（一对一通知）

> 每条消息属于一个用户。`category` 区分消息类型，`source` 区分来源（系统事件 / 管理员 / 群发）。可关联业务对象（如 generation\_id、order\_id、ban\_id）便于跳转。

```sql
CREATE TABLE messages (
    id              CHAR(36)     PRIMARY KEY,
    user_id         CHAR(36)     NOT NULL,                -- 接收用户
    category        ENUM('system','billing','review','risk','account','announcement','admin')
                    NOT NULL,
    title           VARCHAR(200) NOT NULL,
    content         TEXT         NOT NULL,
    content_format  ENUM('markdown','html','text') DEFAULT 'text',
    level           ENUM('info','success','warning','error') DEFAULT 'info',

    -- 关联业务对象（用于消息详情跳转）
    ref_type        VARCHAR(30)  DEFAULT NULL,            -- order/generation/ban/report...
    ref_id          CHAR(36)     DEFAULT NULL,
    action_url      VARCHAR(500) DEFAULT NULL,

    -- 来源
    source          ENUM('event','admin','broadcast') DEFAULT 'event',
    sender_id       CHAR(36)     DEFAULT NULL,            -- 管理员发送时的发送人
    batch_id        CHAR(36)     DEFAULT NULL,            -- 群发批次ID

    -- 状态
    is_read         TINYINT(1)   DEFAULT 0,
    read_at         DATETIME     DEFAULT NULL,
    is_starred      TINYINT(1)   DEFAULT 0,               -- 用户星标
    is_deleted      TINYINT(1)   DEFAULT 0,               -- 用户删除（软删）
    expire_at       DATETIME     DEFAULT NULL,            -- 过期自动清理

    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_user_unread (user_id, is_read, created_at),
    INDEX idx_user_category (user_id, category, created_at),
    INDEX idx_batch (batch_id),
    INDEX idx_expire (expire_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### message\_broadcasts 群发批次表

> 管理员向用户组或全部用户群发消息时，先生成一个批次，再异步分发给每个用户生成 `messages` 记录。

```sql
CREATE TABLE message_broadcasts (
    id              CHAR(36)     PRIMARY KEY,
    title           VARCHAR(200) NOT NULL,
    content         TEXT         NOT NULL,
    category        ENUM('system','billing','review','risk','account','admin') DEFAULT 'admin',
    level           ENUM('info','success','warning','error') DEFAULT 'info',
    target_scope    ENUM('all','group','user','risk_level') DEFAULT 'all',
    target_config   JSON         DEFAULT NULL,
    total_count     INT          DEFAULT 0,               -- 计划发送数
    sent_count      INT          DEFAULT 0,               -- 已发送数
    failed_count    INT          DEFAULT 0,
    status          ENUM('pending','sending','completed','failed','cancelled') DEFAULT 'pending',
    sender_id       CHAR(36)     DEFAULT NULL,
    started_at      DATETIME     DEFAULT NULL,
    completed_at    DATETIME     DEFAULT NULL,
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 5.3 公告投放与已读流程

```
管理员发布公告（设置 target_scope / display_type / 时效）
        │
        ▼
  写入 announcements（status 由 publish_at + is_active 决定是否可见）
  定时任务检查 publish_at → 到点自动上线
        │
        ▼
  用户访问站点 / 登录
        │
        ▼
  GET /api/announcements?type=active
        │
        ▼
  后端筛选：
    1. is_active=1 AND publish_at<=NOW() AND (expire_at IS NULL OR expire_at>NOW())
    2. 按 target_scope 过滤：
       ├─ all              → 全部
       ├─ group            → 命中用户组
       ├─ user             → 命中指定 user_ids
       └─ risk_level       → 命中风险等级
    3. LEFT JOIN announcement_reads 判断该用户是否已读/已确认
    4. 按 priority + is_pinned + publish_at 排序
        │
        ▼
  返回 { banner:[...], popup:[...], list:[...] }
        │
        ▼
  前端：
    · banner → 顶部横幅渲染
    · popup  → 若未确认且 shown_count<popup_show_count → 首屏弹窗
    · list   → 消息中心 / 公告列表
        │
        ▼
  用户交互 → POST /api/announcements/:id/read（已读）
           → POST /api/announcements/:id/confirm（弹窗确认）
        │
        ▼
  写入/更新 announcement_reads（唯一键 uk_ann_user 保证幂等）
```

### 5.4 站内消息事件驱动

各类业务事件通过统一的 `MessageService.notify()` 发送站内消息：

| 事件       | category     | title 示例           | 触发点                         |
| -------- | ------------ | ------------------ | --------------------------- |
| 注册成功赠送金币 | billing      | 「欢迎注册，已赠送 100 金币」  | 邮箱认证完成                      |
| 充值到账     | billing      | 「充值成功，到账 200 金币」   | recharge\_orders completed  |
| 卡密兑换成功   | billing      | 「卡密兑换成功 +50 金币」    | redeem 兑换完成                 |
| 余额不足     | billing      | 「余额不足，生成失败」        | 计费预检失败                      |
| 余额低于阈值   | billing      | 「您的余额仅剩 X 金币」      | 余额变动后检查                     |
| 内容审核通过   | review       | 「您的内容已通过审核」        | content\_review pass        |
| 内容被隐藏/删除 | review       | 「您的内容因违规被处理」       | content\_review hide/delete |
| 被封禁      | account      | 「账号已被封禁：原因 / 截止时间」 | user\_bans ban              |
| 被解封      | account      | 「账号已解封」            | user\_bans unban            |
| 异地登录     | risk         | 「检测到新设备登录」         | 登录异常检测                      |
| 配额预警     | risk         | 「今日生成次数已达 80%」     | 配额检查                        |
| 公告推送     | announcement | 「新公告：xxx」          | 关联 announcement             |

**消息实时推送**：通过 WebSocket（或 SSE）在用户在线时推送 `message.new` 事件，前端更新未读小红点；离线用户下次登录拉取。

### 5.5 群发流程

```
管理员选择范围（全部 / 用户组 / 指定用户）→ 编辑内容 → 预览
        │
        ▼
  POST /api/admin/messages/broadcast
        │
        ▼
  1. 写入 message_broadcasts（status='pending'）
  2. 计算目标用户数 total_count
  3. 异步队列分批分发：
     · 每批 500 用户
     · 为每个用户 INSERT messages (source='broadcast', batch_id=...)
     · 累加 sent_count / failed_count
     · 在线用户实时 WebSocket 推送
  4. 完成后 status='completed'
        │
        ▼
  管理后台可查看批次进度与失败明细
```

### 5.6 公告与消息 API

#### 公告（用户侧）

| 方法   | 路径                              | 说明                            |
| ---- | ------------------------------- | ----------------------------- |
| GET  | /api/announcements              | 当前用户可见公告（分 banner/popup/list） |
| GET  | /api/announcements/:id          | 公告详情                          |
| POST | /api/announcements/:id/read     | 标记已读                          |
| POST | /api/announcements/:id/confirm  | 确认弹窗公告                        |
| GET  | /api/announcements/unread-count | 未读公告数                         |

#### 站内消息（用户侧）

| 方法     | 路径                         | 说明              |
| ------ | -------------------------- | --------------- |
| GET    | /api/messages              | 消息列表（分页 + 分类筛选） |
| GET    | /api/messages/unread-count | 未读消息数           |
| GET    | /api/messages/:id          | 消息详情（同时标已读）     |
| PUT    | /api/messages/:id/read     | 标记已读            |
| PUT    | /api/messages/read-all     | 全部标已读           |
| PUT    | /api/messages/:id/star     | 星标/取消星标         |
| DELETE | /api/messages/:id          | 删除消息            |

#### 公告与消息（管理侧）

| 方法     | 路径                                  | 说明         |
| ------ | ----------------------------------- | ---------- |
| GET    | /api/admin/announcements            | 公告列表       |
| POST   | /api/admin/announcements            | 创建公告       |
| PUT    | /api/admin/announcements/:id        | 更新公告       |
| DELETE | /api/admin/announcements/:id        | 删除公告       |
| PUT    | /api/admin/announcements/:id/status | 上线/下线      |
| GET    | /api/admin/announcements/:id/stats  | 阅读统计       |
| POST   | /api/admin/messages/broadcast       | 群发消息       |
| GET    | /api/admin/messages/broadcasts      | 群发批次列表     |
| GET    | /api/admin/messages/broadcasts/:id  | 群发批次详情     |
| POST   | /api/admin/messages/send            | 单发消息（指定用户） |

***

## 六、模型调度与多地址轮换设计（核心）

### 6.1 设计理念

当前前端将 chat / image / video 三类服务独立配置 Provider + API Key + Base URL。后端化后，这一逻辑被大幅增强：

- **图片模型、视频模型、回答模型** 在后台**完全独立配置**，互不干扰
- 每个模型可绑定**多个 API 地址**（不同 Provider / 不同 Key / 不同 Base URL 均可）
- 后端调度器在每次请求时**自动轮换**选择地址，实现负载均衡
- 某个地址故障时自动跳过，切换到下一个可用地址

### 6.2 数据库表设计

#### model\_channels 模型渠道表（可复用的 API 地址池）

每条记录代表一个**可用的 API 地址 + Key 组合**：

```sql
CREATE TABLE model_channels (
    id              CHAR(36)     PRIMARY KEY,           -- UUID
    name            VARCHAR(100) NOT NULL,               -- 渠道名称（如"阿里云万相-主","OpenAI-备用1"）
    provider_type   ENUM('openai','aliyun','doubao','stepfun','custom') NOT NULL, -- 适配器类型
    api_base_url    VARCHAR(500) NOT NULL,               -- API 基础地址
    api_key         TEXT         NOT NULL,               -- API Key（AES 加密存储）
    is_active       TINYINT(1)   DEFAULT 1,              -- 是否启用
    priority        INT          DEFAULT 0,              -- 优先级（数值越小越优先）
    weight          INT          DEFAULT 1,              -- 轮换权重（用于加权轮换）
    max_concurrent  INT          DEFAULT 10,             -- 最大并发数
    timeout_ms      INT          DEFAULT 60000,          -- 超时时间（毫秒）
    config          JSON         DEFAULT NULL,           -- 渠道特有配置
    -- 统计字段
    total_requests  BIGINT       DEFAULT 0,              -- 累计请求数
    success_count   BIGINT       DEFAULT 0,              -- 成功次数
    fail_count      BIGINT       DEFAULT 0,              -- 失败次数
    last_used_at    DATETIME     DEFAULT NULL,           -- 最后使用时间
    last_fail_at    DATETIME     DEFAULT NULL,           -- 最后失败时间
    -- 自动熔断
    circuit_open    TINYINT(1)   DEFAULT 0,              -- 熔断器状态（0=关闭/1=打开）
    circuit_open_at DATETIME     DEFAULT NULL,           -- 熔断打开时间
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_provider (provider_type),
    INDEX idx_active (is_active, priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**config 字段 JSON 示例**：

```json
// 阿里云万相特有配置
{
  "endpoints": {
    "image": "/services/aigc/multimodal-generation/generation",
    "imageAsync": "/services/aigc/image-generation/generation",
    "imageQuery": "/tasks/{taskId}",
    "video": "/services/aigc/video-generation/video-synthesis",
    "videoQuery": "/tasks/{taskId}"
  }
}

// OpenAI 格式兼容（如中转站）
{
  "endpoints": {
    "chat": "/v1/chat/completions",
    "image": "/v1/images/generations",
    "video": "/v1/videos",
    "videoQuery": "/v1/videos/{taskId}"
  }
}

// 自定义渠道
{
  "endpoints": {
    "chat": "/v1/chat/completions"
  },
  "custom_headers": {
    "X-Custom-Auth": "xxx"
  }
}
```

#### models 模型配置表

每条记录代表一个**具体模型**，通过关联表绑定到多个渠道地址：

```sql
CREATE TABLE models (
    id              CHAR(36)     PRIMARY KEY,
    model_key       VARCHAR(100) NOT NULL UNIQUE,       -- 模型标识（如 wan2.7-image-pro）
    display_name    VARCHAR(100) NOT NULL,               -- 展示名称
    model_type      ENUM('image','video','chat') NOT NULL, -- ★ 图片/视频/回答 三类独立
    is_active       TINYINT(1)   DEFAULT 1,              -- 是否对用户可见
    default_params  JSON         DEFAULT NULL,           -- 默认参数
    max_params      JSON         DEFAULT NULL,           -- 参数限制
    sort_order      INT          DEFAULT 0,              -- 排序（越小越靠前）
    description     TEXT         DEFAULT NULL,           -- 模型描述/标签
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_type_active (model_type, is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**default\_params JSON 示例**：

```json
// 图片模型（万相 2.7 Pro）
{
  "size": "2K",
  "n": 1,
  "thinking_mode": true,
  "watermark": false
}

// 视频模型（万相 图生视频）
{
  "resolution": "720P",
  "duration": 5,
  "watermark": true,
  "prompt_extend": true,
  "type": "i2v"
}

// 对话模型（GPT-4o）
{
  "temperature": 0.7,
  "max_tokens": 4096
}
```

#### model\_channel\_bindings 模型-渠道绑定表（多对多 + 轮换配置）

**这是多地址轮换的核心表**。一个模型可以绑定多个渠道地址，每个绑定关系独立配置轮换权重和策略：

```sql
CREATE TABLE model_channel_bindings (
    id              CHAR(36)     PRIMARY KEY,
    model_id        CHAR(36)     NOT NULL,               -- 关联模型
    channel_id      CHAR(36)     NOT NULL,               -- 关联渠道地址
    rotation_weight INT          DEFAULT 1,              -- 轮换权重（1-10，越大被选中概率越高）
    rotation_strategy ENUM('round_robin','weighted_random','priority','failover')
                    DEFAULT 'round_robin',               -- 轮换策略
    is_active       TINYINT(1)   DEFAULT 1,              -- 是否启用
    -- 轮换状态（由 Redis 维护，此字段作为持久化备份）
    last_used_index INT          DEFAULT 0,              -- 上次轮换索引
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uk_model_channel (model_id, channel_id),
    INDEX idx_model_active (model_id, is_active),
    FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES model_channels(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 6.3 轮换策略详解

系统提供 4 种轮换策略，可**按模型**独立配置：

#### 策略一：round\_robin 轮询（默认）

按顺序依次使用每个地址，循环往复。适合各地址性能相近的场景。

```
第1次请求 → 地址A
第2次请求 → 地址B
第3次请求 → 地址C
第4次请求 → 地址A  ← 循环
...
```

**实现**：Redis 中维护 `model:{modelId}:rr_index` 计数器，每次请求原子递增取模。

#### 策略二：weighted\_random 加权随机

按权重随机选择地址。权重越大，被选中概率越高。适合各地址性能/配额不同的场景。

```
地址A 权重=5  ─┐
地址B 权重=3  ─┼─→  随机抽取（A 概率 50%，B 概率 30%，C 概率 20%）
地址C 权重=2  ─┘
```

#### 策略三：priority 优先级

按优先级顺序使用，优先级最高的地址始终优先，只有它不可用时才降级到下一个。

```
始终优先 → 地址A（priority=0）
A 不可用时 → 地址B（priority=1）
B 也不可用时 → 地址C（priority=2）
A 恢复后 → 回到 A
```

#### 策略四：failover 故障转移

类似 priority，但一旦切换到备用地址，不会自动回到主地址，需要手动恢复或健康检查通过后切回。

```
正常 → 地址A
A 故障 → 切到地址B，锁定在 B
即使 A 恢复，仍用 B
管理员手动恢复 → 切回 A
```

### 6.4 模型调度流程

```
用户发起生成请求（如: 图片生成 model=wan2.7-image-pro）
        │
        ▼
  1. 查询模型配置
     SELECT * FROM models WHERE model_key = 'wan2.7-image-pro' AND is_active = 1
        │
        ▼
  2. 查询绑定的渠道地址列表
     SELECT b.*, c.* FROM model_channel_bindings b
     JOIN model_channels c ON c.id = b.channel_id
     WHERE b.model_id = ? AND b.is_active = 1 AND c.is_active = 1
     ORDER BY c.priority
        │
        ▼
  3. 过滤不可用地址
     · 排除 circuit_open = 1（熔断中）的渠道
     · 排除已达 max_concurrent 并发上限的渠道
        │
        ▼
  4. 按 rotation_strategy 选择地址
     ├─ round_robin:    Redis INCR 取模
     ├─ weighted_random: 按权重随机
     ├─ priority:       取 priority 最小的
     └─ failover:       取第一个可用的
        │
        ▼
  5. 使用选中的渠道发起请求
     ├─ 根据 provider_type 选择请求适配器
     │   ├─ openai  → 标准 OpenAI 格式
     │   ├─ aliyun  → 阿里云万相格式
     │   ├─ doubao  → 豆包 Responses API 格式
     │   └─ custom  → 自定义格式
     │
     ├─ 替换 API Key 和 Base URL
     └─ 发送 HTTP 请求到第三方 API
        │
        ├── 成功
        │   ├─ 更新渠道统计（total_requests++, success_count++, last_used_at）
        │   ├─ 重置熔断器（如有）
        │   └─ 返回结果
        │
        └── 失败
            ├─ 更新渠道统计（total_requests++, fail_count++, last_fail_at）
            ├─ 检查是否需要触发熔断（连续失败 >= 5 次 → 打开熔断器 60 秒）
            ├─ 还有其他可用地址？
            │   ├─ 是 → 选下一个地址重试（最多重试 = 绑定地址数）
            │   └─ 否 → 返回错误给用户
            └─ 记录错误日志
```

### 6.5 熔断与恢复机制

```
┌─────────────────────────────────────────────────────────┐
│                    熔断器状态机                            │
│                                                          │
│   ┌────────┐  连续失败>=5次   ┌────────┐  60秒后       │
│   │ CLOSED │ ──────────────→ │  OPEN  │ ─────→ 半开探测 │
│   │ (正常)  │                 │ (熔断)  │                │
│   └────────┘  ←────────────── └────────┘ ←─────       │
│              探测成功或手动恢复       │                    │
│                                        │  探测失败       │
│                                        └──→ 保持 OPEN    │
└─────────────────────────────────────────────────────────┘

连续失败阈值: 5 次（可在系统设置中调整）
熔断持续时间: 60 秒（可在系统设置中调整）
半开探测: 熔断到期后，放行 1 个请求探测，成功则关闭，失败则继续熔断
手动恢复: 管理员可在后台手动重置熔断器
```

### 6.6 请求适配器（从前端迁移到后端）

后端需要实现与前端 `providers.js` 相同的请求/响应适配逻辑，但以模块化方式组织：

```
server/
├── adapters/
│   ├── index.js           # 适配器注册表，按 provider_type 分发
│   ├── openai.js          # OpenAI 标准格式适配器
│   ├── aliyun.js          # 阿里云万相格式适配器
│   ├── doubao.js          # 豆包 Responses API 格式适配器
│   └── custom.js          # 自定义适配器（可扩展）
├── scheduler/
│   ├── index.js           # 模型调度器入口
│   ├── rotation.js        # 轮换策略实现
│   ├── circuit-breaker.js # 熔断器
│   └── health-check.js    # 渠道健康检查
└── services/
    ├── image.js           # 图片生成服务
    ├── video.js           # 视频生成服务
    └── chat.js            # 对话服务
```

### 6.7 管理后台——模型配置界面设计

后台管理界面分为**三个独立 Tab**，对应三类模型：

```
┌─────────────────────────────────────────────────────────┐
│  模型管理                                                 │
├──────────┬──────────┬──────────┐                        │
│ 🖼 图片模型│ 🎬 视频模型│ 💬 回答模型│                        │
├──────────┴──────────┴──────────┴────────────────────────┤
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  当前类别：图片模型                                    │ │
│  ├─────────────────────────────────────────────────────┤ │
│  │                                                      │ │
│  │  ┌──── 模型卡片 ────────────────────────────────┐   │ │
│  │  │ 万相 2.7 Pro                        [启用 ✅]  │   │ │
│  │  │ wan2.7-image-pro                            │   │ │
│  │  │                                              │   │ │
│  │  │ 绑定地址 (3个):                               │   │ │
│  │  │ ┌─────────────────────────────────────────┐ │   │ │
│  │  │ │ ☑ 阿里云万相-主                           │ │   │ │
│  │  │ │   https://dashscope.aliyuncs.com        │ │   │ │
│  │  │ │   权重: 5  策略: 轮询  [编辑] [测试]      │ │   │ │
│  │  │ ├─────────────────────────────────────────┤ │   │ │
│  │  │ │ ☑ 阿里云万相-备用                         │ │   │ │
│  │  │ │   https://dashscope-alt.aliyuncs.com     │ │   │ │
│  │  │ │   权重: 3  策略: 故障转移  [编辑] [测试]   │ │   │ │
│  │  │ ├─────────────────────────────────────────┤ │   │ │
│  │  │ │ ☑ OpenAI中转-图片                         │ │   │ │
│  │  │ │   https://ai.kggzs.cn                    │ │   │ │
│  │  │ │   权重: 2  策略: 轮询  [编辑] [测试]      │ │   │ │
│  │  │ └─────────────────────────────────────────┘ │   │ │
│  │  │                                              │   │ │
│  │  │ [+ 添加地址]                                 │   │ │
│  │  │                                              │   │ │
│  │  │ 默认参数: 尺寸=2K, 思考模式=开, 水印=关       │   │ │
│  │  │ [编辑模型] [复制模型] [删除模型]               │   │ │
│  │  └──────────────────────────────────────────────┘   │ │
│  │                                                      │ │
│  │  ┌──── 模型卡片 ────────────────────────────────┐   │ │
│  │  │ 豆包 Seedream 5.0                    [启用 ✅]  │   │ │
│  │  │ ...                                            │   │ │
│  │  └──────────────────────────────────────────────┘   │ │
│  │                                                      │ │
│  │  [+ 新增图片模型]                                     │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  渠道地址池管理                                           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 名称: 阿里云万相-主                                 │   │
│  │ 类型: [阿里云万相 ▼]                                │   │
│  │ API地址: [https://dashscope.aliyuncs.com/api/v1] │   │
│  │ API Key:  [sk-xxxxxxxxxxxxxxxx•••••••••]          │   │
│  │ 超时:    [60] 秒                                    │   │
│  │ 优先级: [0]                                        │   │
│  │                                                      │   │
│  │ 统计: 请求 1,234 / 成功 1,200 / 失败 34             │   │
│  │ 状态: 🟢 正常  [重置熔断器]  [测试连通性]            │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  [+ 新增渠道地址]                                         │
└─────────────────────────────────────────────────────────┘
```

### 6.8 管理后台 API——模型配置

#### 渠道地址管理

| 方法     | 路径                                    | 说明      |
| ------ | ------------------------------------- | ------- |
| GET    | /api/admin/channels                   | 渠道地址列表  |
| POST   | /api/admin/channels                   | 创建渠道地址  |
| PUT    | /api/admin/channels/:id               | 更新渠道地址  |
| DELETE | /api/admin/channels/:id               | 删除渠道地址  |
| POST   | /api/admin/channels/:id/test          | 测试渠道连通性 |
| POST   | /api/admin/channels/:id/reset-circuit | 重置熔断器   |
| GET    | /api/admin/channels/:id/stats         | 渠道统计信息  |

#### 模型管理

| 方法     | 路径                           | 说明        |
| ------ | ---------------------------- | --------- |
| GET    | /api/admin/models?type=image | 按类型查询模型列表 |
| POST   | /api/admin/models            | 创建模型      |
| PUT    | /api/admin/models/:id        | 更新模型      |
| DELETE | /api/admin/models/:id        | 删除模型      |
| PUT    | /api/admin/models/:id/status | 启用/禁用模型   |

#### 模型-渠道绑定管理（多地址轮换配置）

| 方法     | 路径                                        | 说明            |
| ------ | ----------------------------------------- | ------------- |
| GET    | /api/admin/models/:id/channels            | 查询模型绑定的渠道列表   |
| POST   | /api/admin/models/:id/channels            | 为模型添加渠道地址     |
| PUT    | /api/admin/models/:id/channels/:bindingId | 修改绑定关系（权重/策略） |
| DELETE | /api/admin/models/:id/channels/:bindingId | 移除渠道地址        |
| PUT    | /api/admin/models/:id/channels/order      | 调整渠道排序        |

**绑定请求体示例**：

```json
{
  "channel_id": "uuid-xxx",
  "rotation_weight": 5,
  "rotation_strategy": "round_robin",
  "is_active": true
}
```

#### 用户侧模型 API

| 方法  | 路径                | 说明              |
| --- | ----------------- | --------------- |
| GET | /api/models       | 获取所有可用模型（按类型分组） |
| GET | /api/models/image | 仅获取图片模型         |
| GET | /api/models/video | 仅获取视频模型         |
| GET | /api/models/chat  | 仅获取回答模型         |
| GET | /api/models/:id   | 获取模型详情（含可用参数选项） |

***

## 七、生成 API 设计（后端代理）

### 7.1 图片生成

| 方法   | 路径                          | 说明       |
| ---- | --------------------------- | -------- |
| POST | /api/generate/image         | 提交图片生成任务 |
| GET  | /api/generate/image/:taskId | 查询异步任务状态 |

**请求体**：

```json
{
  "model": "wan2.7-image-pro",
  "prompt": "一只在月光下奔跑的白猫",
  "size": "2K",
  "n": 1,
  "image": ["https://cdn.example.com/storage/uploads/2026/06/ref.jpg"]  // 可选，参考图（本地存储 URL）
}
```

**响应体**：

```json
{
  "id": "uuid-xxx",
  "status": "completed",
  "model": "wan2.7-image-pro",
  "channel_used": "阿里云万相-主",
  "images": [
    {
      "url": "https://cdn.example.com/generated/xxx.png",
      "thumbnail_url": "https://cdn.example.com/generated/xxx_thumb.png"
    }
  ],
  "cost": 0.15
}
```

### 7.2 视频生成

| 方法   | 路径                          | 说明       |
| ---- | --------------------------- | -------- |
| POST | /api/generate/video         | 提交视频生成任务 |
| GET  | /api/generate/video/:taskId | 查询任务状态   |

### 7.3 对话聊天

| 方法   | 路径                           | 说明         |
| ---- | ---------------------------- | ---------- |
| POST | /api/chat/completions        | 非流式对话      |
| POST | /api/chat/completions/stream | 流式对话 (SSE) |

**流式 SSE 代理**：后端用 `ReadableStream` 转发，流结束后确认扣减额度。

***

## 八、图片/视频服务端存储设计

> v3.2 变更：**不再使用 OSS 等对象存储**，改为**本地磁盘存储 + Nginx 静态分发**。文件删除一律采用**软删除**：用户侧不可见，管理员可见且可溯源（保留删除人/时间/原因）。

### 8.1 存储架构

```
存储根目录：/www/wwwroot/doodle-canvas-storage/
├── uploads/        用户上传的参考图（按 yyyy/mm 分目录）
├── generated/      AI 生成图片/视频（按 yyyy/mm 分目录）
└── thumbnails/     缩略图

用户上传参考图:
  浏览器 → POST /api/upload → 后端写入本地磁盘 → 返回访问 URL

AI 生成图片/视频:
  第三方返回 URL → 后端下载 → 写入本地磁盘 → 返回访问 URL

访问方式:
  Nginx 直接映射静态目录，URL 形如 https://cdn.example.com/storage/generated/2026/06/xxx.png
  私有/敏感文件通过后端鉴权代理（/api/files/:id/stream）
```

**目录按年月分片**（如 `generated/2026/06/`），避免单目录文件数过多影响 ext4/xfs 性能。

**Nginx 静态映射**（加入站点配置）：

```nginx
# 本地文件存储静态分发
location /storage/ {
    alias /www/wwwroot/doodle-canvas-storage/;
    expires 30d;
    add_header Cache-Control "public, immutable";
    try_files $uri =404;
}
```

### 8.2 数据库表

#### files 文件表

> **软删除设计**：`status` 字段区分正常/已删除；删除操作不物理移除文件，仅置 `status='deleted'` 并记录删除审计信息。用户侧所有查询默认带 `status='active'`，管理员可查看全部（含已删除）以溯源。

```sql
CREATE TABLE files (
    id                  CHAR(36)     PRIMARY KEY,
    user_id             CHAR(36)     NOT NULL,
    generation_id       CHAR(36)     DEFAULT NULL,         -- 关联生成记录
    type                ENUM('upload','generated_image','generated_video','thumbnail')
                        NOT NULL,
    file_name           VARCHAR(255) NOT NULL,              -- 原始文件名（用户可见）
    storage_path        VARCHAR(500) NOT NULL,              -- 本地相对路径（相对存储根目录，如 generated/2026/06/xxx.png）
    file_url            VARCHAR(500) NOT NULL,              -- 访问 URL（域名 + storage_path）
    file_size           BIGINT       NOT NULL,              -- 字节数
    mime_type           VARCHAR(100) NOT NULL,
    width               INT          DEFAULT NULL,
    height              INT          DEFAULT NULL,
    duration            FLOAT        DEFAULT NULL,          -- 视频时长(秒)
    sha256              CHAR(64)     DEFAULT NULL,          -- 文件指纹（去重/溯源）

    -- ★ 软删除与溯源（v3.2）
    status              ENUM('active','deleted','quarantined') DEFAULT 'active',
                        -- active=正常可见；deleted=软删除（文件保留）；quarantined=审核隔离
    deleted_at          DATETIME     DEFAULT NULL,          -- 删除时间
    deleted_by          CHAR(36)     DEFAULT NULL,          -- 删除人 user_id（用户自删 或 管理员）
    deleted_by_type     ENUM('user','admin','system') DEFAULT NULL,
    delete_reason       VARCHAR(255) DEFAULT NULL,          -- 删除原因（管理员删除时必填，溯源用）
    related_review_id   CHAR(36)     DEFAULT NULL,          -- 若因内容审核被删，关联 content_review

    created_at          DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_user_status (user_id, status, created_at),
    INDEX idx_generation (generation_id),
    INDEX idx_status (status),
    INDEX idx_sha256 (sha256),
    INDEX idx_deleted (deleted_at, deleted_by),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

> **软删除规则**：
> - **用户侧不可见**：所有面向用户的查询（`/api/files`、生成记录返回的图片、项目画布）一律附加 `WHERE status='active'`；已删除文件对用户表现为「不存在」或「内容已删除」。
> - **管理员可见**：管理后台文件列表、用户生成内容审核、风控取证等查询**不加 status 过滤**，并高亮显示已删除项，可查看删除人/时间/原因。
> - **物理文件保留**：软删除后磁盘文件**不立即清除**，由定时任务按策略清理（如保留 90 天后物理删除，且清理动作写入 audit_logs）。
> - **不可重复删除**：`status='deleted'` 的文件再次调用删除接口返回 409，避免覆盖溯源记录。
> - **联动**：内容审核判定违规执行「隐藏/删除」时，同步置对应 files.status 并写 content_review + audit_logs。

### 8.3 文件上传 API

| 方法 | 路径 | 说明 | 鉴权 |
|---|---|---|---|
| POST | /api/upload/image | 上传参考图片（写本地磁盘） | 需要 |
| GET | /api/files/:id | 获取文件信息（仅 active 可见） | 需要 |
| GET | /api/files/:id/stream | 鉴权后代理输出文件流（私有文件） | 需要 |
| DELETE | /api/files/:id | 删除文件（**软删除**，用户侧不可见，管理员可溯源） | 需要 |
| POST | /api/admin/files/:id/restore | 管理员恢复软删除的文件 | Admin |
| GET | /api/admin/files | 文件列表（含已删除，多维筛选） | Admin |

**删除请求体**（管理员删除时）：
```json
{ "reason": "违规内容-色情" }
```

**删除响应**：
```json
{
  "code": 0,
  "data": { "id": "uuid", "status": "deleted", "deleted_at": "2026-06-17T12:00:00Z" }
}
```

***

## 九、金币额度与计费模块设计

> v3.0 起，余额单位统一为**金币（Coin）**。本模块负责金币的存储、计费与**全量流水**记录。
>
> **精度约定（v3.2）**：所有金币字段使用 `DECIMAL(12,2)`，**精确到 2 位小数**（即精确到 0.01 金币）。计算中间过程保留 4 位，落库前 `ROUND(x, 2)` 四舍五入到分。禁止使用浮点 `FLOAT/DOUBLE` 存储金额。
> **核心原则**：`user_balances.balance` 是状态，`coin_transactions` 是事实；两者必须强一致，任何一笔金币变动都必须同时落库流水，且流水可双向追溯到业务记录与操作人。

### 9.1 计费模型

采用**金币余额制 + 按模型固定费用**：

```
每次生成:
  1. 根据模型查询计费规则 → 得到金币费用（模型原价）
  2. 应用用户组的 cost_multiplier（VIP 折扣 / 黑名单加价）→ 实际扣费
  3. 校验用户组配额（daily/monthly limit）
  4. 检查余额 >= 实际扣费?
  5. 预扣减（事务 + 行锁）→ 调用 API → 成功确认 / 失败退还
  6. 无论成功失败都写 coin_transactions
```

支持**参数差异化**：同一模型不同参数组合可设置不同费用（如 4K 比 2K 贵）。

### 9.2 数据库表

#### billing\_rules 计费规则表

```sql
CREATE TABLE billing_rules (
    id              CHAR(36)     PRIMARY KEY,
    model_id        CHAR(36)     NOT NULL,
    rule_type       ENUM('fixed','param_tiered') DEFAULT 'fixed',
    fixed_amount    DECIMAL(10,4) DEFAULT 0,                  -- 固定费用（金币）
    param_rules     JSON         DEFAULT NULL,               -- 参数差异化规则
    is_active       TINYINT(1)   DEFAULT 1,
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uk_model (model_id),
    FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**param\_rules 示例**（万相 2.7 Pro 图片，按分辨率差异化定价）：

```json
{
  "size": {
    "1K": 0.08,
    "2K": 0.15,
    "4K": 0.30
  }
}
```

**param\_rules 示例**（对话模型，按 Token 计费）：

```json
{
  "mode": "token",
  "input_price_per_1k": 0.001,
  "output_price_per_1k": 0.002
}
```

#### user\_balances 用户金币余额表

> 存储金币**当前状态**（快照），是高频读、低频写的热表。所有变更必须经事务更新并同步 `coin_transactions`。

```sql
CREATE TABLE user_balances (
    id                      CHAR(36)     PRIMARY KEY,
    user_id                 CHAR(36)     NOT NULL UNIQUE,
    balance                 DECIMAL(12,2) DEFAULT 0,         -- 可用金币（不含冻结）
    coins_frozen            DECIMAL(12,2) DEFAULT 0,         -- 冻结金币（冗余 users.coins_frozen，便于余额查询）
    total_recharged         DECIMAL(12,2) DEFAULT 0,         -- 累计充值金币
    total_consumed          DECIMAL(12,2) DEFAULT 0,         -- 累计消费金币
    total_gifted            DECIMAL(12,2) DEFAULT 0,         -- 累计赠送金币
    total_refunded          DECIMAL(12,2) DEFAULT 0,         -- 累计退还金币
    total_expired           DECIMAL(12,2) DEFAULT 0,         -- 累计过期金币
    last_transaction_at     DATETIME     DEFAULT NULL,       -- 最近一次变动时间
    low_balance_alert       TINYINT(1)   DEFAULT 1,
    low_balance_threshold   DECIMAL(12,2) DEFAULT 1.00,
    version                 INT          DEFAULT 0,           -- 乐观锁版本号（防并发更新）
    created_at              DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### coin\_transactions 金币全量流水表（v3.0 核心）

> **账户体系的真相之源**。用户金币的每一次增减——无论来自充值、赠送、消费、退款、管理员调整、封禁冻结、解冻、过期失效——都必须在此表留下**唯一一条**不可篡改记录。
> **设计约束**：①只增不改不删（冲正用反向流水）；②每条流水必须记录变动前后余额，便于审计对账；③每条流水必须可关联到业务记录与操作人。

```sql
CREATE TABLE coin_transactions (
    id                  CHAR(36)     PRIMARY KEY,
    tx_no               VARCHAR(40)  NOT NULL UNIQUE,     -- 流水号（T + 时间戳 + 随机）

    user_id             CHAR(36)     NOT NULL,            -- 所属用户

    -- 变动类型（覆盖全部场景）
    type                ENUM(
                            'recharge',           -- 充值入账（关联 recharge_orders）
                            'recharge_bonus',     -- 充值赠送
                            'redeem',             -- 卡密兑换
                            'gift',               -- 管理员/活动赠送
                            'register_gift',      -- 注册赠送
                            'consume',            -- 消费扣减（关联 generation_records）
                            'refund',             -- 消费失败退还
                            'adjust_add',         -- 管理员增加
                            'adjust_deduct',      -- 管理员扣减
                            'freeze',             -- 冻结（封禁时转出 balance）
                            'unfreeze',           -- 解冻（解封时转回 balance）
                            'forfeit',            -- 没收（永久封禁清零）
                            'expire',             -- 过期失效
                            'transfer_in',        -- 转入（用户间转账，预留）
                            'transfer_out',       -- 转出（用户间转账，预留）
                            'rollback'            -- 冲正（撤销历史错误流水）
                        ) NOT NULL,
    direction           ENUM('in','out') NOT NULL,         -- 方向：in=增加 out=减少
    amount              DECIMAL(12,2) NOT NULL,            -- 变动金额（始终为正数，方向由 direction 决定）
    balance_before      DECIMAL(12,2) NOT NULL,            -- 变动前可用余额
    balance_after       DECIMAL(12,2) NOT NULL,            -- 变动后可用余额

    -- 业务关联（至少关联一项）
    ref_type            VARCHAR(30)  NOT NULL,             -- order/generation/card/ban/gift_rule...
    ref_id              CHAR(36)     DEFAULT NULL,
    related_tx_id       CHAR(36)     DEFAULT NULL,         -- 关联流水（如退款关联原消费）

    -- 原因与来源
    reason_code         VARCHAR(50)  DEFAULT NULL,         -- 标准化原因码
    description         VARCHAR(500) DEFAULT NULL,         -- 人类可读描述
    operator_id         CHAR(36)     DEFAULT NULL,         -- 操作人（NULL=系统/用户自身）
    operator_type       ENUM('admin','system','user','cron') DEFAULT 'system',

    -- 来源信息（风控取证）
    client_ip           VARCHAR(45)  DEFAULT NULL,
    user_agent          TEXT         DEFAULT NULL,
    request_id          VARCHAR(50)  DEFAULT NULL,         -- 链路追踪ID

    -- 用户组费率快照（消费类流水记录当时生效的费率，便于复核）
    cost_snapshot       JSON         DEFAULT NULL,
    -- 例：{model_price:0.15, cost_multiplier:0.8, group:'vip', final_cost:0.12}

    is_reversed         TINYINT(1)   DEFAULT 0,            -- 是否已被冲正
    created_at          DATETIME     DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_user_time (user_id, created_at),
    INDEX idx_type_time (type, created_at),
    INDEX idx_ref (ref_type, ref_id),
    INDEX idx_direction (direction),
    INDEX idx_request (request_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**全量流水场景对照表**：

| 业务场景        | type            | direction | ref\_type     | 说明                      |
| ----------- | --------------- | --------- | ------------- | ----------------------- |
| 用户充值 100 金币 | recharge        | in        | order         | 关联 recharge\_orders     |
| 充值赠送 20 金币  | recharge\_bonus | in        | order         | 按 recharge\_bonus\_rate |
| 卡密兑换 50 金币  | redeem          | in        | card          | 关联 redeem\_cards        |
| 注册赠送 100 金币 | register\_gift  | in        | user          | 邮箱认证完成时                 |
| 管理员活动赠送     | gift            | in        | gift\_rule    | 关联赠送规则                  |
| 图片生成消费      | consume         | out       | generation    | 关联 generation\_records  |
| 生成失败退还      | refund          | in        | generation    | related\_tx\_id 指向原消费   |
| 管理员手动加金币    | adjust\_add     | in        | admin\_op     | 关联 audit\_logs          |
| 管理员手动扣金币    | adjust\_deduct  | out       | admin\_op     | 关联 audit\_logs          |
| 封禁冻结金币      | freeze          | out       | ban           | 关联 user\_bans，余额→冻结     |
| 解封解冻金币      | unfreeze        | in        | ban           | related\_tx\_id 指向原冻结   |
| 永久封禁没收金币    | forfeit         | out       | ban           | 清零冻结金币                  |
| 充值金币过期      | expire          | out       | expire\_batch | 定时任务清理                  |
| 历史流水冲正      | rollback        | 反向        | —             | related\_tx\_id 指向被冲正流水 |

#### generation\_records 生成记录表

> v3.0 增强：记录 IP/UA（风控取证）、审核状态、用户组费率快照、关联金币流水。

```sql
CREATE TABLE generation_records (
    id              CHAR(36)     PRIMARY KEY,
    user_id         CHAR(36)     NOT NULL,
    model_id        CHAR(36)     NOT NULL,
    channel_id      CHAR(36)     DEFAULT NULL,           -- 实际使用的渠道
    type            ENUM('image','video','chat') NOT NULL,
    status          ENUM('pending','processing','completed','failed','cancelled')
                    DEFAULT 'pending',
    input_params    JSON         NOT NULL,                -- 输入参数
    prompt_text     MEDIUMTEXT   DEFAULT NULL,            -- 提示词文本（便于审核检索）
    result          JSON         DEFAULT NULL,            -- 输出结果
    cost_amount     DECIMAL(12,2) DEFAULT 0,              -- 实际扣金币
    cost_breakdown  JSON         DEFAULT NULL,            -- 费用明细 {base,multiplier,group,final}
    coin_tx_id      CHAR(36)     DEFAULT NULL,            -- 关联 coin_transactions（消费）
    refund_tx_id    CHAR(36)     DEFAULT NULL,            -- 关联 coin_transactions（退款，失败时）
    review_status   ENUM('pending','pass','review','reject','hidden') DEFAULT 'pending',
    error_message   TEXT         DEFAULT NULL,
    duration_ms     INT          DEFAULT NULL,
    project_id      CHAR(36)     DEFAULT NULL,

    -- ★ 来源信息（v3.0 风控取证）
    client_ip       VARCHAR(45)  DEFAULT NULL,
    user_agent      TEXT         DEFAULT NULL,
    ua_browser      VARCHAR(50)  DEFAULT NULL,
    ua_os           VARCHAR(50)  DEFAULT NULL,
    ua_device       VARCHAR(50)  DEFAULT NULL,
    device_fingerprint VARCHAR(64) DEFAULT NULL,

    -- ★ 用户组快照（费率复核）
    user_group_snapshot VARCHAR(50) DEFAULT NULL,         -- 当时生效的用户组 code

    is_deleted      TINYINT(1)   DEFAULT 0,               -- 管理员软删除（审核）
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    completed_at    DATETIME     DEFAULT NULL,

    INDEX idx_user_status (user_id, status, created_at),
    INDEX idx_model (model_id),
    INDEX idx_review (review_status, created_at),
    INDEX idx_client_ip (client_ip),
    INDEX idx_coin_tx (coin_tx_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (model_id) REFERENCES models(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 9.3 金币变动强一致流程（核心）

> 任何金币变动必须通过统一的 `CoinService.transact()` 完成，该方法封装了「事务 + 行锁 + 流水 + 审计 + 消息」，禁止绕过直接 UPDATE 余额表。

```
CoinService.transact({ userId, type, amount, direction, refType, refId, ... })
        │
        ▼
  BEGIN TRANSACTION
        │
        ▼
  1. SELECT ... FROM user_balances WHERE user_id=? FOR UPDATE  -- 行锁
        │
        ▼
  2. 计算 balance_before；校验：
     · direction=out 时 balance_before >= amount（不足则回滚抛 InsufficientBalance）
     · type 合法性、金额正数、幂等键（防重复扣费）
        │
        ▼
  3. UPDATE user_balances SET balance=?, version=version+1, ... WHERE user_id=? AND version=?
     -- 乐观锁 + 行锁双保险
        │
        ▼
  4. INSERT coin_transactions（balance_before/balance_after、ref、来源信息全量记录）
        │
        ▼
  5. 按需联动：
     · consume → 关联 generation_records.coin_tx_id
     · recharge → 更新 recharge_orders.status
     · freeze/forfeit → 更新 users.coins_frozen
        │
        ▼
  6. 写 audit_logs（action=billing.*）
        │
        ▼
  COMMIT
        │
        ▼
  7. 异步：发送站内消息（充值到账/余额不足/封禁通知...）
  8. 异步：更新 Redis 余额缓存（读多写少，缓存 30s）
```

**对账机制**：定时任务每日跑账：

```
理论余额 = 初始 + Σ(in 流水) - Σ(out 流水)
若 != user_balances.balance → 告警 + 写入对账异常表
```

### 9.4 额度检查与扣减流程（集成用户组与配额）

```
用户发起生成请求
        │
        ▼
  1. 查询模型的计费规则
  2. 根据请求参数计算本次费用
        │
        ├── 余额不足 → 返回 402
        │   { error: 'INSUFFICIENT_BALANCE', required: 0.15, balance: 0.03 }
        │
        └── 余额充足
            │
            ▼
  3. 开启 MySQL 事务
  4. 扣减余额 (UPDATE user_balances SET balance = balance - 0.15 WHERE user_id = ?)
  5. 插入金币流水 (INSERT coin_transactions, type='consume', direction='out')
  6. 提交事务（经 CoinService.transact 封装）
        │
            ▼
  7. 调用模型 API（含多地址轮换）
        │
        ├── 成功 → 确认扣减完成
        │          （对话类型：按实际 token 用量微调，多退少补，
        │            差额再走一笔 adjust_add/adjust_deduct 流水）
        │
        └── 失败 → 退还预扣减额度
                  (INSERT coin_transactions, type='refund', direction='in',
                   related_tx_id 指向原消费)
```

### 9.5 API 设计

#### 用户侧

| 方法   | 路径                      | 说明                   |
| ---- | ----------------------- | -------------------- |
| GET  | /api/coins/balance      | 查询金币余额（含冻结）          |
| GET  | /api/coins/transactions | 我的金币流水（分页 + 类型/方向筛选） |
| GET  | /api/coins/summary      | 收支汇总（充值/消费/赠送/退还统计）  |
| GET  | /api/billing/estimate   | 预估本次费用（含用户组折扣）       |
| GET  | /api/records            | 我的生成记录（含审核状态）        |
| GET  | /api/recharge/orders    | 我的充值订单               |
| POST | /api/recharge/redeem    | 兑换卡密                 |

#### 管理侧

| 方法     | 路径                                | 说明                               |
| ------ | --------------------------------- | -------------------------------- |
| GET    | /api/admin/billing/rules          | 计费规则列表                           |
| POST   | /api/admin/billing/rules          | 创建计费规则                           |
| PUT    | /api/admin/billing/rules/:id      | 修改计费规则                           |
| DELETE | /api/admin/billing/rules/:id      | 删除计费规则                           |
| POST   | /api/admin/users/:id/recharge     | 充值（写 recharge\_order + coin\_tx） |
| POST   | /api/admin/users/:id/gift         | 赠送金币                             |
| POST   | /api/admin/users/:id/adjust-coins | 手动调整金币（加/扣，需原因）                  |
| GET    | /api/admin/coins/transactions     | 全站金币流水（多维筛选）                     |
| GET    | /api/admin/coins/reconciliation   | 对账报告                             |
| GET    | /api/admin/reports/consumption    | 消费统计                             |
| GET    | /api/admin/reports/model-usage    | 模型使用统计                           |
| GET    | /api/admin/reports/export         | 数据导出                             |

### 9.6 系统设置表

> 管理后台「系统设置」与全局可调参数的**唯一存储**。采用 KV 结构避免频繁加字段；敏感项（如密钥）值加密。前端注册开关、站点名称/Logo、默认额度、熔断参数、金币汇率、内容审核阈值等均从此表读取（启动时载入 Redis 缓存）。

```sql
CREATE TABLE system_settings (
    id              BIGINT       AUTO_INCREMENT PRIMARY KEY,
    `key`           VARCHAR(100) NOT NULL UNIQUE,              -- 设置键（点分命名，如 site.name / billing.coin_rate）
    value           MEDIUMTEXT   DEFAULT NULL,                 -- 值（标量存字符串，复杂结构存 JSON）
    value_type      ENUM('string','number','boolean','json','secret') DEFAULT 'string',
    category        ENUM('site','registration','billing','model','storage','security','email','risk','content')
                    DEFAULT 'site',
    description     VARCHAR(255) DEFAULT NULL,                 -- 说明（后台展示）
    is_public       TINYINT(1)   DEFAULT 0,                    -- 是否对未登录用户公开（前端可读，如 site.name）
    is_editable     TINYINT(1)   DEFAULT 1,                    -- 后台是否可编辑（系统锁定项置 0）
    updated_by      CHAR(36)     DEFAULT NULL,                 -- 最后修改人
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_category (category),
    INDEX idx_public (is_public)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**预置设置项示例**（由 `sql/init.sql` 初始化插入）：

| key                               | value\_type | category     | 说明                   |
| --------------------------------- | ----------- | ------------ | -------------------- |
| `site.name`                       | string      | site         | 站点名称（公开）             |
| `site.logo_url`                   | string      | site         | Logo（公开）             |
| `registration.enabled`            | boolean     | registration | 是否开放注册               |
| `registration.verify_email`       | boolean     | registration | 注册是否强制邮箱认证           |
| `registration.gift_coins`         | number      | registration | 注册赠送金币数              |
| `billing.coin_exchange_rate`      | number      | billing      | 金币↔法币汇率（默认 1.0）      |
| `billing.new_user_balance`        | number      | billing      | 新用户初始金币              |
| `billing.low_balance_threshold`   | number      | billing      | 余额预警阈值               |
| `model.circuit_breaker_threshold` | number      | model        | 熔断连续失败阈值             |
| `model.circuit_breaker_timeout`   | number      | model        | 熔断持续毫秒数              |
| `storage.root`                    | string      | storage      | 本地存储根目录（v3.2）         |
| `storage.base_url`                | string      | storage      | 文件访问基础 URL               |
| `storage.soft_delete_retain_days` | number      | storage      | 软删除文件保留天数             |
| `email.smtp_*`                    | secret      | email        | SMTP 主机/端口/账号/密码（加密） |
| `risk.login_fail_limit`           | number      | risk         | 登录失败锁定阈值             |
| `content.auto_review_enabled`     | boolean     | content      | 是否启用云内容安全自动审核        |

> **安全约定**：`value_type='secret'` 的项在 API 返回时**脱敏**（返回 `****`），仅管理后台编辑时可见原文；写入审计日志（action=`system.setting.update`）。

***

## 十、项目持久化改造

### 10.1 数据库表

```sql
CREATE TABLE projects (
    id              CHAR(36)     PRIMARY KEY,
    user_id         CHAR(36)     NOT NULL,
    name            VARCHAR(200) NOT NULL,
    description     TEXT         DEFAULT NULL,
    canvas_data     JSON         NOT NULL,                -- nodes + edges + viewport
    thumbnail_file_id CHAR(36)   DEFAULT NULL,
    node_count      INT          DEFAULT 0,
    is_public       TINYINT(1)   DEFAULT 0,
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_user_time (user_id, updated_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 10.2 API

| 方法     | 路径                | 说明   |
| ------ | ----------------- | ---- |
| GET    | /api/projects     | 项目列表 |
| POST   | /api/projects     | 创建项目 |
| GET    | /api/projects/:id | 获取项目 |
| PUT    | /api/projects/:id | 更新项目 |
| DELETE | /api/projects/:id | 删除项目 |

***

## 十一、数据库 ER 关系图

> v3.0：以 `users` 为核心，向外辐射出**认证、计费与金币、风控、内容、公告消息、模型调度**五大簇。图中 ★ 标记为 v3.0 新增表。

```
                            ┌─────────────────────────────────────────┐
                            │                  users                    │
                            │  id · username · email · password_hash    │
                            │  email_verified_at · status · role        │
                            │  ★ user_group_id(冗余) · ★ risk_level   │
                            │  ★ ban_reason · ★ banned_until            │
                            │  ★ coins_frozen · ★ violation_count       │
                            │  ★ register_ip · ★ last_login_ip/ua       │
                            └───┬──────┬──────┬──────┬──────┬──────┬───┘
                                │      │      │      │      │      │
        ┌───────────────────────┘      │      │      │      │      └─────────────────────┐
        │                              │      │      │      │                            │
        ▼                              ▼      │      │      │                            ▼
┌─────────────────┐         ┌──────────────┐ │      │      │                 ┌──────────────────┐
│ refresh_tokens   │         │ login_logs   │ │      │      │                 │ ★ user_group_    │
│ user_id (FK)     │         │ ★ 全量登录   │ │      │      │                 │   members        │
│ token_hash       │         │ ip/ua/geo    │ │      │      │                 │ user_id · group  │
└─────────────────┘         └──────────────┘ │      │      │                 └────────┬─────────┘
                                             │      │      │                          │
┌──────────────────────┐                     │      │      │                          ▼
│ ★ email_verifications │ ◀─── 注册/找回 ────┘      │      │                 ┌──────────────────┐
│  user_id · email      │                        │      │                 │ ★ user_groups    │
│  code · purpose       │                        │      │                 │  code · discount │
└──────────────────────┘                         │      │                 │  cost_multiplier │
                                                 │      │                 │  daily_limit     │
        ┌────────────────────────────────────────┘      │      │                 └──────────────────┘
        ▼                                              │      │
┌──────────────────┐         ┌──────────────────┐      │      │
│ user_balances    │ ◀──1:1─ │ ★ coin_          │      │      │
│ user_id · balance│         │   transactions   │      │      │
│ coins_frozen     │         │  ★ 全量金币流水  │      │      │
│ total_*          │         │  type · direction│      │      │
└──────────────────┘         │  amount · before │      │      │
        ▲                    │  · after · ref   │      │      │
        │                    │  operator · ip   │      │      │
        │                    └────────┬─────────┘      │      │
        │                             │ ref_type       │      │
        │  ┌──────────────────────────┼────────────────┘      │
        │  │                          │                       │
        │  ▼                          ▼                       │
┌────────────────────┐     ┌──────────────────────┐           │
│ ★ recharge_orders   │     │ generation_records    │ ◀────────┘
│ user_id · coins_*  │     │ user_id · model_id    │
│ pay_channel · card │     │ channel_id · status   │
└────────┬───────────┘     │ ★ cost_breakdown      │
         │ used_by          │ ★ client_ip · ua      │
         ▼                  │ ★ review_status       │
┌────────────────────┐     │ coin_tx_id · refund_  │
│ ★ redeem_cards     │     │   tx_id               │
│  card_code · face  │     └──────────┬─────────────┘
│  status · batch    │                │
└────────────────────┘                │ generation_id
                                      ▼
┌──────────────────────────────────────┐
│  模型调度簇（v2.0 保留）              │
│  models ─< model_channel_bindings >─ │
│            model_channels             │
│  billing_rules → models              │
│  files → generation_records          │
└──────────────────────────────────────┘

┌─── 风控与内容审核簇（v3.0 新增）──────────────────────────────┐
│                                                              │
│  generation_records ──1:1── ★ content_review                 │
│                          (auto/manual status, labels)        │
│                                                              │
│  generation_records ──1:N── ★ content_reports                │
│                          (举报人/原因/处理结果)               │
│                                                              │
│  ★ risk_rules ──触发── ★ risk_events ──联动── user_bans       │
│                                                              │
│  users ──1:N── ★ user_bans (ban/unban/freeze/forfeit 流水)   │
│                                                              │
└──────────────────────────────────────────────────────────────┘

┌─── 公告与消息簇（v3.0 新增）─────────────────────────────────┐
│                                                              │
│  ★ announcements ──1:N── ★ announcement_reads ──> users       │
│   (banner/popup/list, target_scope)                          │
│                                                              │
│  users ──1:N── ★ messages (站内消息，事件驱动)                │
│          └─ source: event/admin/broadcast                    │
│                                                              │
│  ★ message_broadcasts ──分发── ★ messages (群发批次)          │
│                                                              │
└──────────────────────────────────────────────────────────────┘

┌─── 审计与日志簇（v3.0 新增，贯穿全系统）──────────────────────┐
│                                                              │
│  ★ audit_logs    管理员操作 + 敏感用户操作（action 枚举）     │
│  ★ access_logs   关键 API 调用（含 request_id 链路追踪）      │
│  login_logs      全量登录尝试                                │
│                                                              │
│  四表通过 request_id / actor_id / user_id 互通，可跨表追溯    │
│  一次请求产生的全部副作用                                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘

┌─── 其他业务表（v2.0 保留）───────────────────────────────────┐
│  projects (user_id, canvas_data)                             │
└──────────────────────────────────────────────────────────────┘
```

**v3.0 新增表清单（共 19 张）**：

| 簇    | 表                                                                                  | 用途                  |
| ---- | ---------------------------------------------------------------------------------- | ------------------- |
| 认证   | `email_verifications` · `login_logs`                                               | 邮箱认证 / 全量登录日志       |
| 账号控制 | `user_groups` · `user_group_members` · `user_bans`                                 | 计费分组 / 封禁流水         |
| 金币   | `coin_transactions`（替代 balance\_transactions） · `recharge_orders` · `redeem_cards` | 全量金币流水 / 充值订单 / 卡密  |
| 风控   | `risk_rules` · `risk_events`                                                       | 风控规则 / 风控事件         |
| 内容   | `content_review` · `content_reports`                                               | 内容审核 / 举报           |
| 公告消息 | `announcements` · `announcement_reads` · `messages` · `message_broadcasts`         | 公告 / 已读 / 站内消息 / 群发 |
| 审计日志 | `audit_logs` · `access_logs`                                                       | 审计日志 / 访问日志         |

***

## 十二、完整 API 汇总

### 12.1 公共接口（无需鉴权）

| 方法   | 路径                            | 说明           |
| ---- | ----------------------------- | ------------ |
| POST | /api/auth/register            | 用户注册（发送验证邮件） |
| POST | /api/auth/verify-email        | 验证邮箱         |
| POST | /api/auth/resend-verification | 重发验证码        |
| POST | /api/auth/check-email         | 检查邮箱是否已注册    |
| POST | /api/auth/login               | 用户登录         |
| POST | /api/auth/forgot-password     | 忘记密码（发邮件）    |
| POST | /api/auth/reset-password      | 重置密码         |
| POST | /api/appeals                  | 用户提交封禁申诉     |
| GET  | /api/health                   | 健康检查         |

### 12.2 用户接口（需要鉴权）

| 方法     | 路径                              | 说明                       |
| ------ | ------------------------------- | ------------------------ |
| POST   | /api/auth/logout                | 退出登录                     |
| POST   | /api/auth/refresh               | 刷新 Token                 |
| GET    | /api/auth/me                    | 当前用户信息（含用户组/金币）          |
| PUT    | /api/auth/password              | 修改密码                     |
| POST   | /api/auth/change-email          | 换绑邮箱                     |
| GET    | /api/auth/sessions              | 我的登录会话                   |
| DELETE | /api/auth/sessions/:id          | 注销其他会话                   |
| GET    | /api/auth/login-logs            | 我的登录记录                   |
| GET    | /api/models                     | 可用模型列表                   |
| GET    | /api/models/:type               | 按类型获取 (image/video/chat) |
| POST   | /api/generate/image             | 图片生成                     |
| GET    | /api/generate/image/:taskId     | 查询图片任务状态                 |
| POST   | /api/generate/video             | 视频生成                     |
| GET    | /api/generate/video/:taskId     | 查询视频任务状态                 |
| POST   | /api/chat/completions           | 非流式对话                    |
| POST   | /api/chat/completions/stream    | 流式对话 (SSE)               |
| POST   | /api/upload/image               | 上传参考图片                   |
| GET    | /api/files/:id                  | 获取文件信息                   |
| DELETE | /api/files/:id                  | 删除文件                     |
| GET    | /api/projects                   | 项目列表                     |
| POST   | /api/projects                   | 创建项目                     |
| GET    | /api/projects/:id               | 获取项目                     |
| PUT    | /api/projects/:id               | 更新项目                     |
| DELETE | /api/projects/:id               | 删除项目                     |
| GET    | /api/coins/balance              | 查询金币余额                   |
| GET    | /api/coins/transactions         | 我的金币流水                   |
| GET    | /api/coins/summary              | 收支汇总                     |
| GET    | /api/billing/estimate           | 费用预估                     |
| GET    | /api/records                    | 我的生成记录                   |
| GET    | /api/recharge/orders            | 我的充值订单                   |
| POST   | /api/recharge/redeem            | 兑换卡密                     |
| GET    | /api/user-groups/my             | 我的用户组与权益                 |
| GET    | /api/announcements              | 可见公告                     |
| GET    | /api/announcements/:id          | 公告详情                     |
| POST   | /api/announcements/:id/read     | 标记公告已读                   |
| POST   | /api/announcements/:id/confirm  | 确认弹窗公告                   |
| GET    | /api/announcements/unread-count | 未读公告数                    |
| GET    | /api/messages                   | 站内消息列表                   |
| GET    | /api/messages/unread-count      | 未读消息数                    |
| GET    | /api/messages/:id               | 消息详情                     |
| PUT    | /api/messages/:id/read          | 标记已读                     |
| PUT    | /api/messages/read-all          | 全部已读                     |
| PUT    | /api/messages/:id/star          | 星标/取消                    |
| DELETE | /api/messages/:id               | 删除消息                     |
| POST   | /api/reports                    | 举报内容                     |

### 12.3 管理接口（需要 Admin 角色）

| 方法             | 路径                                        | 说明                |
| -------------- | ----------------------------------------- | ----------------- |
| **仪表盘**        | <br />                                    | <br />            |
| GET            | /api/admin/dashboard/overview             | 今日概况              |
| GET            | /api/admin/dashboard/trend                | 趋势数据              |
| GET            | /api/admin/dashboard/model-stats          | 模型使用统计            |
| GET            | /api/admin/risk/dashboard                 | 风控大盘              |
| **用户管理**       | <br />                                    | <br />            |
| GET            | /api/admin/users                          | 用户列表（多维筛选）        |
| GET            | /api/admin/users/:id                      | 用户详情（含金币/组/风控/审核） |
| PUT            | /api/admin/users/:id                      | 更新用户              |
| PUT            | /api/admin/users/:id/status               | 启用/禁用             |
| POST           | /api/admin/users/:id/recharge             | 充值                |
| POST           | /api/admin/users/:id/gift                 | 赠送金币              |
| POST           | /api/admin/users/:id/adjust-coins         | 手动调整金币            |
| GET            | /api/admin/users/:id/generations          | 用户全部生成内容          |
| **用户组（计费分组）**  | <br />                                    | <br />            |
| GET            | /api/admin/user-groups                    | 用户组列表             |
| POST           | /api/admin/user-groups                    | 创建用户组             |
| PUT            | /api/admin/user-groups/:id                | 更新用户组             |
| DELETE         | /api/admin/user-groups/:id                | 删除用户组             |
| GET            | /api/admin/users/:id/groups               | 用户所属组             |
| POST           | /api/admin/users/:id/groups               | 加入用户组             |
| DELETE         | /api/admin/users/:id/groups/:groupId      | 移出用户组             |
| **账号封禁与申诉**    | <br />                                    | <br />            |
| POST           | /api/admin/users/:id/ban                  | 封禁用户              |
| POST           | /api/admin/users/:id/unban                | 解封用户              |
| POST           | /api/admin/users/:id/freeze-coins         | 冻结金币              |
| POST           | /api/admin/users/:id/unfreeze-coins       | 解冻金币              |
| GET            | /api/admin/users/:id/bans                 | 封禁历史              |
| GET            | /api/admin/appeals                        | 申诉列表              |
| PUT            | /api/admin/appeals/:id                    | 处理申诉              |
| **金币流水与审计**    | <br />                                    | <br />            |
| GET            | /api/admin/coins/transactions             | 全站金币流水            |
| GET            | /api/admin/coins/reconciliation           | 对账报告              |
| GET            | /api/admin/audit-logs                     | 审计日志              |
| GET            | /api/admin/access-logs                    | 访问日志              |
| GET            | /api/admin/login-logs                     | 全站登录日志            |
| **充值与卡密**      | <br />                                    | <br />            |
| GET            | /api/admin/recharge/orders                | 全部充值订单            |
| POST           | /api/admin/redeem-cards/batch             | 批量生成卡密            |
| GET            | /api/admin/redeem-cards                   | 卡密列表              |
| PUT            | /api/admin/redeem-cards/:id               | 禁用/续期卡密           |
| **内容审核与举报**    | <br />                                    | <br />            |
| GET            | /api/admin/review/queue                   | 待审核队列             |
| GET            | /api/admin/review/list                    | 审核内容列表            |
| PUT            | /api/admin/review/:id                     | 提交复审结果            |
| POST           | /api/admin/review/batch                   | 批量审核              |
| GET            | /api/admin/reports                        | 举报列表              |
| PUT            | /api/admin/reports/:id                    | 处理举报              |
| **风控中心**       | <br />                                    | <br />            |
| GET            | /api/admin/risk/rules                     | 风控规则列表            |
| POST           | /api/admin/risk/rules                     | 创建规则              |
| PUT            | /api/admin/risk/rules/:id                 | 更新规则              |
| GET            | /api/admin/risk/events                    | 风控事件列表            |
| POST           | /api/admin/risk/events/:id/handle         | 处理风控事件            |
| GET            | /api/admin/risk/blacklist/ip              | IP 黑名单            |
| POST           | /api/admin/risk/blacklist/ip              | 管理 IP 黑名单         |
| **公告管理**       | <br />                                    | <br />            |
| GET            | /api/admin/announcements                  | 公告列表              |
| POST           | /api/admin/announcements                  | 创建公告              |
| PUT            | /api/admin/announcements/:id              | 更新公告              |
| DELETE         | /api/admin/announcements/:id              | 删除公告              |
| PUT            | /api/admin/announcements/:id/status       | 上线/下线             |
| GET            | /api/admin/announcements/:id/stats        | 阅读统计              |
| **站内消息**       | <br />                                    | <br />            |
| POST           | /api/admin/messages/broadcast             | 群发消息              |
| GET            | /api/admin/messages/broadcasts            | 群发批次              |
| GET            | /api/admin/messages/broadcasts/:id        | 批次详情              |
| POST           | /api/admin/messages/send                  | 单发消息              |
| **渠道地址管理**     | <br />                                    | <br />            |
| GET            | /api/admin/channels                       | 渠道列表              |
| POST           | /api/admin/channels                       | 创建渠道              |
| PUT            | /api/admin/channels/:id                   | 更新渠道              |
| DELETE         | /api/admin/channels/:id                   | 删除渠道              |
| POST           | /api/admin/channels/:id/test              | 测试连通性             |
| POST           | /api/admin/channels/:id/reset-circuit     | 重置熔断器             |
| GET            | /api/admin/channels/:id/stats             | 渠道统计              |
| **模型管理（按类型分）** | <br />                                    | <br />            |
| GET            | /api/admin/models?type=image              | 图片模型列表            |
| GET            | /api/admin/models?type=video              | 视频模型列表            |
| GET            | /api/admin/models?type=chat               | 回答模型列表            |
| POST           | /api/admin/models                         | 创建模型              |
| PUT            | /api/admin/models/:id                     | 更新模型              |
| DELETE         | /api/admin/models/:id                     | 删除模型              |
| PUT            | /api/admin/models/:id/status              | 启用/禁用模型           |
| GET            | /api/admin/models/:id/channels            | 模型绑定地址            |
| POST           | /api/admin/models/:id/channels            | 添加地址到模型           |
| PUT            | /api/admin/models/:id/channels/:bindingId | 修改权重/策略           |
| DELETE         | /api/admin/models/:id/channels/:bindingId | 移除地址              |
| **计费管理**       | <br />                                    | <br />            |
| GET            | /api/admin/billing/rules                  | 计费规则列表            |
| POST           | /api/admin/billing/rules                  | 创建规则              |
| PUT            | /api/admin/billing/rules/:id              | 更新规则              |
| DELETE         | /api/admin/billing/rules/:id              | 删除规则              |
| **记录与报表**      | <br />                                    | <br />            |
| GET            | /api/admin/records                        | 生成记录              |
| GET            | /api/admin/records/:id                    | 记录详情              |
| GET            | /api/admin/reports/consumption            | 消费统计              |
| GET            | /api/admin/reports/model-usage            | 模型统计              |
| GET            | /api/admin/reports/export                 | 数据导出              |
| **系统设置**       | <br />                                    | <br />            |
| GET            | /api/admin/settings                       | 系统设置              |
| PUT            | /api/admin/settings                       | 更新设置              |

***

## 十三、安全设计

| 措施               | 说明                                    |
| ---------------- | ------------------------------------- |
| 密码加密             | bcrypt (cost=12)                      |
| JWT 有效期          | Access: 15 分钟，Refresh: 7 天            |
| Token 黑名单        | 退出登录写入 Redis，TTL = Token 剩余有效期        |
| 防暴力破解            | 登录失败 5 次 → 锁定 15 分钟（Redis 计数）         |
| API Key 加密       | 数据库中使用 AES-256-GCM 加密存储，密钥放环境变量       |
| 速率限制             | 全局 100 次/min（Redis 滑动窗口），单接口可独立配置     |
| 输入校验             | 所有参数严格校验，SQL 使用 Sequelize 参数化查询       |
| CORS             | 仅允许前端域名                               |
| 本地文件鉴权        | v3.2：私有/敏感文件经后端鉴权代理输出；公开文件走 Nginx 静态；软删除文件用户不可见 |
| **★ 邮箱强制认证**     | v3.0：注册必须邮箱认证，未认证账号不可用                |
| **★ IP/UA 全量记录** | v3.0：注册/登录/生成/充值均记录 IP/UA/地理位置，风控取证   |
| **★ 金币事务强一致**    | v3.0：余额变更必须行锁+乐观锁+流水，禁止绕过 CoinService |
| **★ 审计不可篡改**     | v3.0：audit\_logs 只增不删，冲正用反向流水而非删除     |
| **★ 卡密防爆破**      | v3.0：卡密兑换 5 次失败锁定 IP，bcrypt 存储 hash   |
| **★ 内容安全审核**     | v3.0：接入云内容安全（阿里云绿网），违规自动拦截            |

***

## 十四、宝塔部署方案

### 14.1 服务器要求

| 项目  | 最低配置                   | 推荐配置             |
| --- | ---------------------- | ---------------- |
| CPU | 2 核                    | 4 核+             |
| 内存  | 4 GB                   | 8 GB+            |
| 硬盘  | 40 GB SSD              | 100 GB SSD       |
| 系统  | CentOS 7+ / Ubuntu 20+ | Ubuntu 22.04 LTS |
| 宝塔  | 7.x / 8.x              | 宝塔 8.x           |

### 14.2 宝塔面板安装与配置

#### Step 1：安装宝塔面板

```bash
# Ubuntu/Debian
wget -O install.sh https://download.bt.cn/install/install-ubuntu_6.0.sh && sudo bash install.sh ed8484bec

# CentOS
yum install -y wget && wget -O install.sh https://download.bt.cn/install/install_6.0.sh && sh install.sh ed8484bec
```

#### Step 2：在宝塔面板中安装软件

通过宝塔面板「软件商店」安装以下软件：

| 软件          | 版本              | 用途                    |
| ----------- | --------------- | --------------------- |
| **Nginx**   | 1.24+           | 反向代理 + 静态资源           |
| **MySQL**   | 8.0+            | 主数据库                  |
| **Redis**   | 7.0+            | 缓存 + Token 黑名单 + 轮换计数 |
| **Node.js** | 18.x / 20.x LTS | 服务端运行环境               |
| **PM2管理器**  | 最新版             | Node.js 进程守护          |

#### Step 3：MySQL 配置

```
宝塔面板 → 数据库 → 添加数据库
  - 数据库名: doodle_canvas
  - 用户名: doodle_canvas
  - 密码: [自动生成强密码]
  - 访问权限: 本地服务器
  - 字符集: utf8mb4
```

通过宝塔「phpMyAdmin」或命令行导入建表 SQL（见第九章所有建表语句）。

#### Step 4：Redis 配置

```
宝塔面板 → 软件商店 → Redis → 设置
  - 确认 bind 127.0.0.1（仅本地访问）
  - 设置密码
  - 最大内存: 256MB（可按需调整）
```

#### Step 5：创建 Node.js 项目

```bash
# SSH 登录服务器后
mkdir -p /www/wwwroot/doodle-canvas-server
cd /www/wwwroot/doodle-canvas-server

# 初始化项目（或 git clone）
npm init -y

# 安装依赖
npm install express sequelize mysql2 redis jsonwebtoken bcryptjs cors multer
npm install dayjs uuid
npm install --save-dev nodemon
```

#### Step 6：项目目录结构

```
/www/wwwroot/doodle-canvas-server/
├── package.json
├── .env                          # 环境变量（MySQL/Redis/JWT密钥/AES密钥）
├── ecosystem.config.js           # PM2 配置
├── src/
│   ├── app.js                    # Express 入口
│   ├── config/
│   │   ├── database.js           # MySQL + Sequelize 配置
│   │   ├── redis.js              # Redis 连接
│   │   └── auth.js               # JWT 配置
│   ├── middleware/
│   │   ├── auth.js               # JWT 鉴权中间件
│   │   ├── admin.js              # Admin 角色检查
│   │   └── rateLimit.js          # 速率限制
│   ├── routes/
│   │   ├── auth.js               # 认证路由
│   │   ├── models.js             # 模型列表路由（用户侧）
│   │   ├── generate.js           # 生成路由（图片/视频）
│   │   ├── chat.js               # 对话路由（含 SSE）
│   │   ├── upload.js             # 文件上传路由
│   │   ├── projects.js           # 项目 CRUD 路由
│   │   ├── billing.js            # 额度/计费路由
│   │   └── admin/
│   │       ├── index.js          # 管理路由入口
│   │       ├── users.js          # 用户管理
│   │       ├── channels.js       # 渠道地址管理
│   │       ├── models.js         # 模型配置管理
│   │       ├── billing.js        # 计费规则管理
│   │       ├── records.js        # 生成记录
│   │       ├── reports.js        # 报表统计
│   │       └── settings.js       # 系统设置
│   ├── adapters/
│   │   ├── index.js              # 适配器注册
│   │   ├── openai.js             # OpenAI 适配器
│   │   ├── aliyun.js             # 阿里云万相适配器
│   │   ├── doubao.js             # 豆包适配器
│   │   └── custom.js             # 自定义适配器
│   ├── scheduler/
│   │   ├── index.js              # 调度器入口
│   │   ├── rotation.js           # 轮换策略
│   │   ├── circuit-breaker.js    # 熔断器
│   │   └── health-check.js       # 健康检查
│   ├── services/
│   │   ├── image.js              # 图片生成服务
│   │   ├── video.js              # 视频生成服务
│   │   ├── chat.js               # 对话服务
│   │   ├── storage.js            # 本地文件存储服务
│   │   └── billing.js            # 计费服务
│   └── utils/
│       ├── encryption.js          # AES 加解密工具
│       ├── logger.js             # 日志
│       └── helpers.js             # 工具函数
├── sql/
│   └── init.sql                  # 全部建表 SQL
└── logs/                         # PM2 日志目录
```

#### Step 7：.env 环境变量配置

```env
# 服务器
PORT=3000
NODE_ENV=production

# MySQL
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=doodle_canvas
DB_USER=doodle_canvas
DB_PASS=你的数据库密码

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASS=你的Redis密码

# JWT
JWT_SECRET=你的JWT密钥-至少32位随机字符串
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# AES 加密（用于 API Key 加密存储）
AES_SECRET_KEY=你的AES密钥-32字节
AES_IV=你的AES初始向量-16字节

# 文件存储（v3.2：本地磁盘存储，不使用 OSS）
STORAGE_ROOT=/www/wwwroot/doodle-canvas-storage   # 存储根目录
STORAGE_BASE_URL=https://cdn.example.com/storage  # 访问基础 URL（Nginx 静态映射）
# 软删除文件保留天数（超过后定时任务物理删除并写 audit_logs）
STORAGE_SOFT_DELETE_RETAIN_DAYS=90
# 单文件大小上限（字节，默认 50MB）
STORAGE_MAX_FILE_SIZE=52428800
# 允许的 MIME 类型白名单（逗号分隔）
STORAGE_ALLOWED_MIMES=image/png,image/jpeg,image/webp,image/gif,video/mp4

# 邮件服务（注册认证 / 异常登录 / 重置密码）
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_SECURE=true                    # 465 端口为 true，587 端口为 false
SMTP_USER=postmaster@example.com
SMTP_PASS=你的SMTP密码
MAIL_FROM="Doodle-Canvas <postmaster@example.com>"
# 备选：阿里云邮件推送（DirectMail）
# DMA_ACCESS_KEY_ID=
# DMA_ACCESS_KEY_SECRET=
# DMA_ACCOUNT=dm-example@example.com
# DMA_ALIAS=Doodle-Canvas

# 金币体系
COIN_EXCHANGE_RATE=1.0              # 1 金币 = N 元（可被 system_settings 覆盖）
REGISTER_GIFT_COINS=100             # 注册赠送金币
LOW_BALANCE_THRESHOLD=1.00          # 余额预警阈值

# Redis 限流与风控（滑动窗口）
RATE_LIMIT_GLOBAL=100               # 全局每分钟请求数
RATE_LIMIT_LOGIN=20                 # 同 IP 登录每分钟次数
LOGIN_FAIL_LOCK=5                   # 连续失败锁定阈值
LOGIN_LOCK_MINUTES=15               # 锁定时长

# 内容安全（云审核）
CONTENT_REVIEW_PROVIDER=aliyun_green    # none / aliyun_green / tencent_cms
CONTENT_REVIEW_ACCESS_KEY=你的内容安全AK
CONTENT_REVIEW_ACCESS_SECRET=你的内容安全SK
# 违规阈值：自动审核分数超过此值转人工复审
CONTENT_REVIEW_REJECT_SCORE=0.9
CONTENT_REVIEW_REVIEW_SCORE=0.6

# 日志与链路追踪
LOG_LEVEL=info                      # debug / info / warn / error
ACCESS_LOG_SAMPLE_RATE=1.0          # access_logs 采样率（0-1，1=全量）

# CORS 白名单（逗号分隔）
CORS_ORIGINS=https://doodle-canvas.example.com

# 系统默认配置
DEFAULT_NEW_USER_BALANCE=10.00
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_TIMEOUT=60000
```

#### Step 8：PM2 启动

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'doodle-canvas-server',
    script: 'src/app.js',
    cwd: '/www/wwwroot/doodle-canvas-server',
    instances: 1,
    autorestart: true,
    max_memory_restart: '512M',
    env_production: {
      NODE_ENV: 'production'
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '/www/wwwroot/doodle-canvas-server/logs/error.log',
    out_file: '/www/wwwroot/doodle-canvas-server/logs/out.log',
    merge_logs: true
  }]
}
```

```bash
cd /www/wwwroot/doodle-canvas-server
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup    # 设置开机自启
```

#### Step 9：Nginx 反向代理配置

在宝塔面板中：

```
网站 → 添加站点 → doodle-canvas.example.com
```

站点设置 → 配置文件（替换为以下内容）：

```nginx
server {
    listen 80;
    server_name doodle-canvas.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name doodle-canvas.example.com;

    # SSL 证书（宝塔面板申请 Let's Encrypt 或上传自有证书）
    ssl_certificate    /www/server/panel/vhost/cert/doodle-canvas/fullchain.pem;
    ssl_certificate_key /www/server/panel/vhost/cert/doodle-canvas/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # 前端静态文件
    root /www/wwwroot/doodle-canvas/dist;
    index index.html;

    # 前端路由 history 模式
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE 流式响应支持
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;

        # 文件上传大小限制
        client_max_body_size 50m;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

#### Step 10：前端构建与部署

```bash
# 在本地构建
cd /www/wwwroot/doodle-canvas   # 前端项目
npm run build    # 产物输出到 dist/

# dist/ 目录已在 Nginx root 配置中指向
# 后续更新只需重新构建并覆盖 dist/
```

### 14.3 宝塔面板运维操作

| 操作           | 方法                                                         |
| ------------ | ---------------------------------------------------------- |
| **查看服务状态**   | 宝塔 → PM2管理器 → 查看 doodle-canvas-server 状态                   |
| **查看日志**     | 宝塔 → PM2管理器 → 日志，或 SSH: `pm2 logs doodle-canvas-server`    |
| **重启服务**     | 宝塔 → PM2管理器 → 重启，或 SSH: `pm2 restart doodle-canvas-server` |
| **数据库管理**    | 宝塔 → 数据库 → phpMyAdmin                                      |
| **Redis 监控** | 宝塔 → 软件商店 → Redis → 设置/监控                                  |
| **SSL 证书**   | 宝塔 → 网站 → SSL → Let's Encrypt 免费申请                         |
| **备份**       | 宝塔 → 计划任务 → 自动备份（数据库 + 文件）                                 |
| **防火墙**      | 宝塔 → 安全 → 仅开放 80/443/22 端口                                 |

### 14.4 日常运维建议

```bash
# 查看实时日志
pm2 logs doodle-canvas-server --lines 100

# 查看服务状态
pm2 status

# 重启服务
pm2 restart doodle-canvas-server

# 数据库备份（也可通过宝塔计划任务自动化）
mysqldump -u doodle_canvas -p doodle_canvas > /backup/db_$(date +%Y%m%d).sql

# Redis 连通性测试
redis-cli -a your_password ping

# 磁盘使用
df -h

# Node.js 进程资源
pm2 monit
```

***

## 十五、管理后台设计

### 15.1 功能模块

```
管理后台
├── 仪表盘
│   ├── 今日概况（用户数、生成次数、消费金额、余额消耗）
│   ├── 7 日趋势图
│   └── 模型使用占比 + 渠道调用占比
│
├── 用户管理
│   ├── 用户列表（搜索、筛选、分页）
│   ├── 充值 / 赠送额度
│   ├── 启用 / 禁用用户
│   └── 查看用户生成记录
│
├── 模型管理（三个独立 Tab）
│   ├── 🖼 图片模型
│   │   ├── 模型列表（启用/禁用/排序）
│   │   ├── 每个模型可绑定多个渠道地址
│   │   ├── 配置轮换策略和权重
│   │   └── 设置默认参数和限制
│   │
│   ├── 🎬 视频模型
│   │   ├── 模型列表
│   │   ├── 多地址轮换配置
│   │   └── 参数配置
│   │
│   └── 💬 回答模型
│       ├── 模型列表
│       ├── 多地址轮换配置
│       └── 参数配置
│
├── 渠道地址池
│   ├── 所有渠道地址列表
│   ├── 统计信息（请求/成功/失败/成功率）
│   ├── 熔断器状态与操作
│   ├── 测试连通性
│   └── 新增/编辑/删除渠道
│
├── 计费管理
│   ├── 按模型设置费用
│   ├── 参数差异化定价
│   └── Token 计费配置
│
├── 生成记录
│   ├── 全部记录（多维筛选：用户/模型/渠道/状态/时间）
│   ├── 记录详情（含实际使用渠道、耗时、费用）
│   └── 失败记录分析
│
├── 财务报表
│   ├── 消费汇总（日/周/月）
│   ├── 用户消费排行
│   ├── 模型成本统计
│   └── 数据导出 CSV
│
└── 系统设置
    ├── 站点名称、Logo、公告
    ├── 默认新用户额度
    ├── 注册开关
    ├── 熔断器参数（阈值、超时）
    └── 本地存储配置（存储根目录/基础URL/软删除保留天数）
```

### 15.2 管理后台路由

```
pages/admin/
├── index.vue              # 仪表盘
├── users/
│   ├── index.vue          # 用户列表
│   └── [id].vue            # 用户详情
├── models/
│   ├── index.vue          # 模型管理（Tab 切换 image/video/chat）
│   └── [id].vue            # 模型详情 + 渠道绑定配置
├── channels/
│   └── index.vue          # 渠道地址池管理
├── billing/
│   └── index.vue          # 计费规则
├── records/
│   └── index.vue          # 生成记录
├── reports/
│   └── index.vue          # 财务报表
└── settings/
    └── index.vue          # 系统设置
```

***

## 十六、前端改造文件清单

### 16.1 新增文件

| 文件路径                            | 说明           |
| ------------------------------- | ------------ |
| `src/views/Login.vue`           | 登录页面         |
| `src/views/Register.vue`        | 注册页面         |
| `src/views/account/Profile.vue` | 个人信息         |
| `src/views/account/Balance.vue` | 余额与消费记录      |
| `src/utils/auth.js`             | JWT Token 管理 |
| `src/stores/pinia/user.js`      | 用户状态 Store   |
| `src/api/auth.js`               | 认证 API       |
| `src/api/project.js`            | 项目 CRUD API  |
| `src/api/billing.js`            | 额度/计费 API    |
| `src/api/file.js`               | 文件上传 API     |

### 16.2 修改文件

| 文件路径                               | 改造内容                    |
| ---------------------------------- | ----------------------- |
| `src/router/index.js`              | 新增登录/注册路由 + 路由守卫        |
| `src/utils/request.js`             | 移除 API Key，注入 JWT Token |
| `src/api/image.js`                 | 调用后端 API，移除 provider 参数 |
| `src/api/video.js`                 | 调用后端 API，移除 provider 参数 |
| `src/api/chat.js`                  | 调用后端 SSE，移除 apiKey      |
| `src/api/model.js`                 | 从后端获取模型列表               |
| `src/hooks/useApi.js`              | 移除 provider 获取，简化为纯参数   |
| `src/config/models.js`             | 保留为 fallback，优先后端动态获取   |
| `src/config/providers.js`          | 迁移到后端（或保留为适配器参考）        |
| `src/stores/pinia/models.js`       | 移除 API Key 配置，保留模型选择    |
| `src/stores/projects.js`           | 改为后端 API 存储             |
| `src/components/ApiSettings.vue`   | 改造为用户中心/额度展示            |
| `src/components/AppHeader.vue`     | 新增用户头像、余额、退出            |
| `src/components/ImageNode.vue`     | 上传改为后端 API              |
| `src/components/DownloadModal.vue` | 下载改为本地存储 URL         |
| `vite.config.js`                   | 移除动态代理                  |

### 16.3 可删除文件

| 文件路径                      | 原因             |
| ------------------------- | -------------- |
| `src/utils/imageCache.js` | IndexedDB 不再需要 |

***

## 十七、分阶段实施建议

### 阶段一：基础设施（3-5 天）

- [ ] 宝塔安装 Nginx + MySQL + Redis + Node.js + PM2
- [ ] 搭建 Express 项目框架
- [ ] MySQL 建表（users, refresh\_tokens）
- [ ] 实现注册/登录/JWT 鉴权
- [ ] 前端添加登录/注册页面和路由守卫

### 阶段二：模型管理 + 多地址轮换（5-7 天）

- [ ] 建表（model\_channels, models, model\_channel\_bindings）
- [ ] 实现渠道地址管理 API
- [ ] 实现模型 CRUD + 绑定管理 API
- [ ] 实现请求适配器（从 providers.js 迁移）
- [ ] 实现轮换调度器（round\_robin / weighted / priority / failover）
- [ ] 实现熔断器
- [ ] 前端改造 API 调用层

### 阶段三：服务端存储（3-5 天）

- [ ] 实现本地磁盘存储服务（分目录 + Nginx 静态映射）
- [ ] 实现文件上传/下载 API
- [ ] 生成结果自动存本地磁盘
- [ ] 前端项目存储改造

### 阶段四：金币额度与计费（3-5 天）

- [ ] 建表（billing\_rules, user\_balances, coin\_transactions, generation\_records）
- [ ] 实现计费规则管理（含用户组 cost\_multiplier 折扣）
- [ ] 实现 CoinService.transact()（事务 + 行锁 + 乐观锁 + 全量流水）
- [ ] 实现额度检查与扣减（集成到生成流程，失败自动 refund 流水）
- [ ] 实现每日对账定时任务（理论余额 vs 实际余额）
- [ ] 前端余额展示与费用预估

### 阶段五：账号控制与风控（4-6 天，v3.0 新增）

- [ ] 建表（user\_groups, user\_group\_members, user\_bans, recharge\_orders, redeem\_cards）
- [ ] 建表（content\_review, content\_reports, risk\_rules, risk\_events）
- [ ] 建表（audit\_logs, access\_logs）
- [ ] 实现用户组 / 封禁解封 / 金币冻结 / 申诉流程
- [ ] 实现卡密批量生成与兑换
- [ ] 接入云内容安全（阿里云绿网）自动审核 + 人工复审队列
- [ ] 实现风控规则引擎（频次/阈值/模式匹配）+ 自动封禁联动

### 阶段六：公告与站内消息（2-3 天，v3.0 新增）

- [ ] 建表（announcements, announcement\_reads, messages, message\_broadcasts）
- [ ] 实现公告投放（banner/popup/list + 定向范围）与已读确认
- [ ] 实现 MessageService.notify() 事件驱动站内消息
- [ ] 实现群发批次异步分发
- [ ] 前端消息中心 + 未读小红点（WebSocket / SSE 推送）

### 阶段七：管理后台（5-7 天）

- [ ] 用户管理页面（含金币/组/风控/审核聚合详情）
- [ ] 模型管理页面（三 Tab + 多地址轮换配置）
- [ ] 渠道地址池管理页面
- [ ] 计费规则管理页面
- [ ] 风控中心（规则配置 / 事件处理 / IP 黑名单 / 大盘）
- [ ] 内容审核队列 + 举报处理
- [ ] 公告编辑器 + 群发批次进度
- [ ] 审计日志 / 访问日志 / 金币流水查询（多维筛选 + 导出）
- [ ] 仪表盘与报表

### 阶段八：部署与完善（2-3 天）

- [ ] Nginx 配置 + SSL 证书
- [ ] PM2 部署 + 开机自启
- [ ] 数据库备份策略（宝塔计划任务）
- [ ] 安全审计

**总计预估：27-42 天**（v3.0 较 v2.0 新增风控/公告/金币强一致等模块，工时上调）

***

## 十八、关键风险与应对

| 风险            | 影响                   | 应对措施                               |
| ------------- | -------------------- | ---------------------------------- |
| 多地址轮换时部分地址不可用 | 请求失败率上升              | 熔断器 + 自动重试 + 故障转移策略                |
| SSE 流式代理延迟    | 对话体验下降               | Nginx `proxy_buffering off` + 合理超时 |
| MySQL 并发额度竞争  | 扣减不准确                | SELECT ... FOR UPDATE 行锁           |
| 本地磁盘容量增长   | 磁盘写满、服务异常        | 软删除文件 90 天后物理清理 + 监控磁盘使用率告警 |
| 数据迁移          | 现有 localStorage 项目丢失 | 提供导入工具 + 双写过渡期                     |

***

## 附录 A：统一响应格式与错误码规范

> 所有业务 API（非 SSE 流）统一返回以下 JSON 结构，便于前端用同一套拦截器处理。

### A.1 成功响应

```json
{
  "code": 0,
  "message": "ok",
  "data": { },
  "request_id": "req_a1b2c3d4"
}
```

| 字段           | 类型     | 说明                    |
| ------------ | ------ | --------------------- |
| `code`       | number | `0` 表示成功；非 `0` 见错误码表  |
| `message`    | string | 人类可读提示，可直接展示给用户       |
| `data`       | any    | 业务数据，失败时为 `null`      |
| `request_id` | string | 链路追踪 ID（见附录 B），排查问题必填 |

> **HTTP 状态码约定**：成功 `200`；客户端错误 `400/401/402/403/404/409/422/429`；服务端错误 `500/502/503/504`。HTTP 状态码用于网关层语义，业务细节一律以 `code` 为准。

### A.2 错误响应

```json
{
  "code": 40001,
  "message": "邮箱格式不正确",
  "data": null,
  "errors": [
    { "field": "email", "message": "邮箱格式不正确" }
  ],
  "request_id": "req_a1b2c3d4"
}
```

`errors` 仅在参数校验失败（422 类）时出现，供前端表单逐字段定位错误。

### A.3 业务错误码表（节选）

> 编码规则：`HTTP状态码 × 100 + 序号`。如 `40101` = 401 类第 1 个错误。

| code      | HTTP   | 含义                      | 触发场景                                |
| --------- | ------ | ----------------------- | ----------------------------------- |
| **认证类**   | <br /> | <br />                  | <br />                              |
| 40101     | 401    | `TOKEN_INVALID`         | Access Token 无效/过期                  |
| 40102     | 401    | `TOKEN_EXPIRED`         | Token 过期，前端应用 Refresh Token 续期      |
| 40103     | 401    | `REFRESH_TOKEN_INVALID` | Refresh Token 失效，需重新登录              |
| 40104     | 401    | `EMAIL_NOT_VERIFIED`    | 邮箱未认证                               |
| 40301     | 403    | `FORBIDDEN`             | 无权限访问该资源                            |
| 40302     | 403    | `ROLE_REQUIRED`         | 需要 Admin 角色但当前为 user                |
| 40303     | 403    | `BANNED`                | 账号被封禁（返回 ban\_reason/banned\_until） |
| 40304     | 403    | `ACCOUNT_DISABLED`      | 账号被管理员禁用                            |
| **认证限流**  | <br /> | <br />                  | <br />                              |
| 42901     | 429    | `RATE_LIMITED`          | 触发速率限制                              |
| 42902     | 429    | `LOGIN_FAIL_LOCKED`     | 登录失败次数过多，账号锁定                       |
| 42903     | 429    | `LOGIN_IP_BLOCKED`      | 同 IP 登录尝试过多                         |
| **参数校验**  | <br /> | <br />                  | <br />                              |
| 42201     | 422    | `VALIDATION_FAILED`     | 字段校验失败（附 errors 数组）                 |
| 40901     | 409    | `USERNAME_EXISTS`       | 用户名已存在                              |
| 40902     | 409    | `EMAIL_EXISTS`          | 邮箱已注册                               |
| 40401     | 404    | `USER_NOT_FOUND`        | 用户不存在                               |
| 40402     | 404    | `RESOURCE_NOT_FOUND`    | 通用资源不存在                             |
| **金币计费**  | <br /> | <br />                  | <br />                              |
| 40201     | 402    | `INSUFFICIENT_BALANCE`  | 余额不足（返回 required/balance）           |
| 40202     | 402    | `QUOTA_EXCEEDED`        | 触发用户组每日/每月配额上限                      |
| 40911     | 409    | `COIN_TX_REVERSED`      | 流水已被冲正，不可重复操作                       |
| 40912     | 409    | `COIN_TX_IDEMPOTENT`    | 幂等键重复，已处理过                          |
| **模型调度**  | <br /> | <br />                  | <br />                              |
| 50301     | 503    | `MODEL_UNAVAILABLE`     | 模型未启用或无可用渠道                         |
| 50302     | 503    | `ALL_CHANNELS_FAILED`   | 所有渠道均失败/熔断                          |
| 50401     | 504    | `GENERATE_TIMEOUT`      | 生成超时                                |
| 50201     | 502    | `UPSTREAM_ERROR`        | 第三方 API 返回错误（透传 message）            |
| **充值与卡密** | <br /> | <br />                  | <br />                              |
| 40921     | 409    | `CARD_USED`             | 卡密已被使用                              |
| 40922     | 409    | `CARD_EXPIRED`          | 卡密已过期                               |
| 40923     | 409    | `CARD_DISABLED`         | 卡密已被禁用                              |
| 40403     | 404    | `CARD_NOT_FOUND`        | 卡密不存在（兑换码错误）                        |
| **内容审核**  | <br /> | <br />                  | <br />                              |
| 40305     | 403    | `CONTENT_REJECTED`      | 内容违规被自动拦截                           |
| 40306     | 403    | `CONTENT_HIDDEN`        | 内容已被管理员隐藏                           |
| **系统**    | <br /> | <br />                  | <br />                              |
| 50001     | 500    | `INTERNAL_ERROR`        | 服务内部异常                              |
| 50303     | 503    | `SERVICE_UNAVAILABLE`   | 维护中/熔断                              |

### A.4 SSE 流式响应（对话）

SSE 不走统一 JSON 包裹，直接以 `text/event-stream` 推送以下事件：

```
event: delta
data: {"content": "你好"}

event: meta
data: {"request_id": "req_xxx", "model": "gpt-4o", "channel": "OpenAI-主"}

event: done
data: {"cost": 0.002, "input_tokens": 12, "output_tokens": 8, "coin_tx_id": "..."}

event: error
data: {"code": 50201, "message": "上游错误"}
```

***

## 附录 B：链路追踪 request\_id 规范

> `request_id` 贯穿 `access_logs` / `audit_logs` / `coin_transactions` / `risk_events` / `generation_records`，是一次请求所有副作用的串联键，是排障与对账的核心。

### B.1 生成与传递

```
客户端（可选）──► X-Request-Id 请求头
                       │
                       ▼
        API Gateway 中间件
   ├─ 有入站头 → 复用（限 50 字符内、仅 [a-zA-Z0-9_-]）
   └─ 无入站头 → 生成 req_ + 32位 nanoid
                       │
                       ▼
        注入 req.requestId + 响应头 X-Request-Id
        同时挂到 res.locals，供后续 logger / service 使用
                       │
                       ▼
        所有 Service 层调用（AuditService / CoinService ...）
        透传 request_id 到对应日志表字段
```

### B.2 格式约定

- 前缀 `req_`，主体为 URL-safe 的 nanoid（22-32 位），总长度 ≤ 50。
- 示例：`req_V1StGXR8_Z5jdHi6B-myT`
- 严禁包含用户敏感信息（用户 ID、邮箱等）。

### B.3 跨表追溯示例

用户反馈"扣了金币但没出图"，只需一个 request\_id：

```sql
-- 1. 找到这次请求的访问记录
SELECT * FROM access_logs WHERE request_id = 'req_xxx';
-- 2. 看扣费流水
SELECT * FROM coin_transactions WHERE request_id = 'req_xxx';
-- 3. 看生成记录
SELECT * FROM generation_records g
  JOIN coin_transactions c ON g.coin_tx_id = c.id
  WHERE c.request_id = 'req_xxx';
-- 4. 若触发了风控
SELECT * FROM risk_events WHERE ... context->>'$.request_id' = 'req_xxx';
-- 5. 若有管理员介入
SELECT * FROM audit_logs WHERE request_id = 'req_xxx';
```

### B.4 前端配合

- axios 请求拦截器：若 `localStorage` 无 `request_id` 则不主动生成（由服务端生成）；如需前端生成，用 `nanoid` 并存 `req_` 前缀。
- 错误弹窗中附带 request\_id，引导用户上报。

***

## 附录 C：localStorage → 服务端数据迁移方案

> 现有前端项目数据存于 `localStorage`（键 `ai-canvas-projects`），图片缓存在 IndexedDB。后端化后需将这些存量数据迁移到服务端 `projects` / `files` / `generation_records` 表，保证老用户无感升级。

### C.1 迁移总体策略：双写过渡 + 一键导入

```
阶段 0（上线前）       阶段 1（上线后 1-2 周）        阶段 2（稳定后）
─────────────────     ─────────────────────────     ─────────────────
前端仅写 localStorage   前端双写 localStorage + 后端    前端仅写后端
                      首页弹窗提示「一键迁移历史项目」   停止读 localStorage
                      迁移完成后清理本地存储
```

### C.2 一键导入接口

```
POST /api/migrate/local
鉴权：需要（已登录用户）

请求体：
{
  "projects": [
    {
      "client_id": "project_1718000000000_abc123",   // 本地项目 ID
      "name": "示例项目",
      "created_at": "2026-06-01T10:00:00Z",
      "updated_at": "2026-06-17T12:00:00Z",
      "thumbnail": "https://... 或 data:image/...",  // data: 由服务端转存本地存储
      "canvas_data": { "nodes": [...], "edges": [...], "viewport": {...} }
    }
  ]
}

响应：
{
  "code": 0,
  "data": {
    "imported": 12,
    "skipped": 0,
    "mapping": {                              // 本地 ID → 服务端 ID 映射
      "project_1718..._abc": "uuid-server-1"
    },
    "failed": []
  }
}
```

### C.3 服务端迁移处理流程

```
POST /api/migrate/local
        │
        ▼
  1. 校验 projects 数组大小（单次 ≤ 50，超限分批）
        │
        ▼
  2. 逐项目处理（同一事务）：
     · 按 client_id 查重（migrate_imports 表），已导入则 skip
     · 遍历 canvas_data.nodes：
       ├─ url 为 data:image/... → 写入本地存储 → 替换为访问 URL，建 files 记录
       ├─ url 为第三方域名（如 dashscope 临时图）→ 下载转存本地存储
       └─ url 为 upload:// 本地缓存 key → 尝试从客户端 IndexedDB 取回（见 C.4）
     · INSERT projects（user_id, canvas_data, thumbnail_file_id）
     · INSERT migrate_imports（记录 client_id ↔ server_id，防重复导入）
        │
        ▼
  3. 返回 mapping，前端据此更新本地引用
```

辅助表（防重复导入）：

```sql
CREATE TABLE migrate_imports (
    id              BIGINT       AUTO_INCREMENT PRIMARY KEY,
    user_id         CHAR(36)     NOT NULL,
    client_id       VARCHAR(100) NOT NULL,            -- 本地项目原 ID
    project_id      CHAR(36)     NOT NULL,            -- 迁移后的服务端项目 ID
    imported_at     DATETIME     DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uk_user_client (user_id, client_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### C.4 IndexedDB 图片回填

现有图片节点 URL 可能形如 `upload://<cache-key>`，真实二进制在 IndexedDB（`imageCache.js` 管理）。迁移时：

1. 前端遍历所有 `upload://` 节点，从 IndexedDB 读出 Blob。
2. 将 Blob 随迁移请求一并上传（multipart），或先调 `POST /api/upload/image` 拿到 CDN URL 后再替换节点 URL。
3. 服务端对每个上传的图建立 `files` 记录，`generation_id` 留空（标记为用户上传历史图）。

### C.5 降级与容错

| 情况                | 处理                                     |
| ----------------- | -------------------------------------- |
| 单个项目迁移失败          | 不中断整体迁移，记入 `failed[]`，前端可单独重试          |
| 图片下载/转存失败         | 保留原 URL（若可访问）或标记 `placeholder`，不阻塞项目导入 |
| localStorage 已被清理 | 迁移接口返回空，前端隐藏"一键迁移"入口                   |
| 网络中断              | 靠 `migrate_imports` 幂等，可重复调用，已导入的不会重复  |

### C.6 迁移 API

| 方法     | 路径                       | 说明                   |
| ------ | ------------------------ | -------------------- |
| POST   | /api/migrate/local       | 一键导入本地项目             |
| GET    | /api/migrate/status      | 查询当前用户已迁移项目数 / 待迁移提示 |
| DELETE | /api/migrate/local-cache | 迁移完成后，前端通知服务端并清理本地引用 |

***

## 附录 D：变更历史

| 版本   | 日期         | 主要变更                                                                                                                                                                                                                                                                                                   |
| ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| v1.0 | —          | 初版设计（前端 SPA，无后端）                                                                                                                                                                                                                                                                                       |
| v2.0 | 2026-06-17 | 引入后端化：MySQL + 宝塔部署、用户认证、模型分类独立配置、多地址轮换、服务端 OSS 存储、额度计费                                                                                                                                                                                                                                                 |
| v3.0 | 2026-06-17 | 新增**用户账号控制与风控模块**（计费分组 / 邮箱认证 / 登录日志 / 封禁 / 充值订单 / 审计 / 内容审核 / 风控规则）、**公告与站内消息系统**；统一\*\*金币（Coin）\*\*计费单位与全量流水（`coin_transactions`）；强化 UGC 审核能力                                                                                                                                                        |
| v3.2 | 2026-06-17 | 金币精度统一 `DECIMAL(12,2)`（2 位小数）；移除 OSS 改为**本地磁盘存储 + Nginx 静态分发**；files 表改为**软删除**（`status` 字段，用户不可见、管理员可见可溯源，物理文件保留 90 天）；同步更新架构图/ER 图/环境变量/实施计划/风险表 |
| v3.1 | 2026-06-17 | 文档完善：① 合并 v2.0/v3.0 并修正章节编号错乱；② 澄清 `users.user_group_id` 为冗余字段、计费以 `user_group_members` 为准；③ 新增 `system_settings` 系统设置表；④ 补全 SMTP/金币/OSS 内网/限流/内容审核等环境变量；⑤ 新增附录 A（统一响应格式与错误码）、附录 B（request\_id 链路追踪）、附录 C（localStorage 数据迁移）、附录 D（变更历史）；⑥ 修正实施计划表名（`balance_transactions`→`coin_transactions`）并细化阶段四至八 |

> 本文档状态为「设计阶段」，所有 SQL 与接口均为设计稿，正式开发前以本文档为基线评审。
