# Doodle-Canvas 服务端后端实现 Spec

> 基线文档：`doc/server-design.md` v3.1
> 变更范围：将纯前端 SPA 改造为全栈应用（Vue 3 前端 + Node.js/Express 后端 + MySQL + Redis + 本地磁盘存储）

## Why

Doodle-Canvas 当前是纯前端 SPA，存在 API Key 浏览器暴露、无用户体系、无额度控制、图片仅存浏览器 IndexedDB、无多地址轮换等核心痛点。需建立完整的账号体系、模型调度、计费、风控、内容审核与公告消息系统，使平台具备商业化运营能力。

## What Changes

### 后端新增（server/ 目录，独立于现有前端 src/）
- **BREAKING** 新增 Node.js/Express 后端服务，前端所有 AI 调用改为经后端代理
- 新增 MySQL 数据库（30+ 表），覆盖用户/认证/计费/风控/内容/公告/模型调度/文件/项目
- 新增 Redis 缓存层（Token 黑名单、轮换计数、速率限制、余额缓存）
- 新增本地磁盘文件存储 + Nginx 静态分发（替代 IndexedDB）
- 新增 JWT 认证体系（Access 15min + Refresh 7d）
- 新增模型调度器（4 种轮换策略 + 熔断器 + 健康检查）
- 新增金币计费体系（全量流水 + 事务强一致 + 对账）
- 新增风控引擎（频次/阈值/模式匹配 + 自动封禁）
- 新增内容审核（自动 + 人工复审 + 举报）
- 新增公告与站内消息系统（WebSocket 实时推送）
- 新增管理后台 API（用户/模型/渠道/计费/风控/审核/公告/报表/设置）

### 前端改造
- **BREAKING** 移除浏览器端 API Key 存储，所有 AI 调用走后端代理
- 新增登录/注册/邮箱认证页面与路由守卫
- 新增用户中心（个人信息/余额/消费记录/消息中心）
- 项目存储从 localStorage 改为后端 API
- 图片缓存从 IndexedDB 改为后端存储 URL
- 新增管理后台前端页面

## Impact

- Affected specs: 全部前端模块均受影响（API 调用层、状态管理、路由、组件）
- Affected code:
  - 新建 `server/` 目录（后端全部代码）
  - 修改 `src/utils/request.js`（JWT 注入）
  - 修改 `src/api/*`（调用后端 API）
  - 修改 `src/router/index.js`（路由守卫）
  - 修改 `src/stores/*`（用户状态、项目存储改造）
  - 修改 `src/components/*`（ApiSettings、AppHeader、ImageNode 等）
  - 新增 `src/views/Login.vue`、`src/views/Register.vue`、`src/views/account/*`
  - 新增 `src/views/admin/*`（管理后台）
  - 删除 `src/utils/imageCache.js`（IndexedDB 不再需要）

## ADDED Requirements

### Requirement: 用户认证体系
系统 SHALL 提供完整的用户认证体系，包括邮箱强制认证注册、JWT 登录、Token 刷新、登录日志、异常登录检测。

#### Scenario: 用户注册
- **WHEN** 用户提交邮箱/用户名/密码
- **THEN** 系统创建 pending_email 状态账号，发送验证码邮件
- **AND** 用户输入验证码后账号激活，初始化余额并赠送注册金币

#### Scenario: JWT 鉴权
- **WHEN** 客户端携带 Access Token 请求受保护接口
- **THEN** 中间件验证 Token 有效性并注入 userId
- **AND** Token 过期时返回 40102，前端用 Refresh Token 续期

#### Scenario: 登录安全
- **WHEN** 同 IP 5 分钟内登录失败超过 20 次
- **THEN** 拒绝该 IP 请求并记录 login_logs
- **AND** 同账号连续失败 5 次锁定 15 分钟

### Requirement: 模型调度与多地址轮换
系统 SHALL 支持图片/视频/回答三类模型独立配置，每个模型可绑定多个渠道地址，支持 4 种轮换策略与自动熔断。

#### Scenario: 轮换调度
- **WHEN** 用户发起生成请求
- **THEN** 调度器查询模型绑定的可用渠道，按策略选择地址
- **AND** 失败时自动切换到下一个可用地址（最多重试 = 绑定地址数）

#### Scenario: 熔断器
- **WHEN** 渠道连续失败 >= 5 次
- **THEN** 打开熔断器 60 秒，期间跳过该渠道
- **AND** 60 秒后半开探测，成功则关闭熔断器

### Requirement: 金币计费体系
系统 SHALL 以金币（Coin）为唯一计费单位，所有金币变动通过 CoinService.transact() 强一致落库，全量流水可追溯。

#### Scenario: 消费扣费
- **WHEN** 用户发起生成请求
- **THEN** 预扣减余额（事务 + 行锁 + 乐观锁），写 coin_transactions
- **AND** 生成失败时自动退还（refund 流水，related_tx_id 指向原消费）

#### Scenario: 余额不足
- **WHEN** 用户余额 < 实际扣费
- **THEN** 返回 402 INSUFFICIENT_BALANCE，含 required/balance 字段

### Requirement: 用户账号控制与风控
系统 SHALL 提供用户计费分组、账号封禁/解封、金币冻结、风控规则引擎、内容审核能力。

#### Scenario: 账号封禁
- **WHEN** 管理员或风控引擎触发封禁
- **THEN** 更新 users.status='banned'，冻结金币，撤销所有 refresh_token
- **AND** 加入 Redis 封禁名单，写 audit_logs，发送站内消息

#### Scenario: 风控规则命中
- **WHEN** 请求经过风控中间件且命中活跃规则
- **THEN** 写入 risk_events，执行对应动作（alert/throttle/block/ban）
- **AND** 高危动作联动封禁流程

### Requirement: 公告与站内消息
系统 SHALL 提供全站/定向/弹窗公告与一对一站内消息，支持事件驱动通知与群发批次。

#### Scenario: 公告投放
- **WHEN** 管理员发布公告并设置 target_scope
- **THEN** 用户访问时按 scope 过滤可见公告，分 banner/popup/list 返回
- **AND** 用户确认后写 announcement_reads

#### Scenario: 事件驱动消息
- **WHEN** 业务事件发生（充值到账/封禁/审核结果等）
- **THEN** MessageService.notify() 发送站内消息
- **AND** 在线用户通过 WebSocket 实时推送

### Requirement: 本地文件存储
系统 SHALL 使用本地磁盘存储 + Nginx 静态分发，文件删除采用软删除（用户不可见、管理员可溯源）。

#### Scenario: 文件上传
- **WHEN** 用户上传参考图
- **THEN** 写入本地磁盘（按 yyyy/mm 分目录），建 files 记录，返回访问 URL

#### Scenario: 软删除
- **WHEN** 用户或管理员删除文件
- **THEN** 置 files.status='deleted'，记录删除人/时间/原因
- **AND** 物理文件保留 90 天后由定时任务清理

### Requirement: 统一响应格式与链路追踪
系统 SHALL 所有业务 API 返回统一 JSON 结构（code/message/data/request_id），request_id 贯穿所有日志表。

#### Scenario: 成功响应
- **WHEN** API 处理成功
- **THEN** 返回 `{ code: 0, message: "ok", data: {...}, request_id: "req_xxx" }`

#### Scenario: 链路追踪
- **WHEN** 请求进入 API Gateway
- **THEN** 中间件生成或复用 request_id，注入 req 对象与响应头
- **AND** 所有 Service 层调用透传 request_id 到日志表

## MODIFIED Requirements

### Requirement: 前端 API 调用层
前端所有 AI 模型调用 SHALL 经后端代理，移除浏览器端 API Key 存储。

#### Scenario: 图片生成
- **WHEN** 用户在画布触发图片生成
- **THEN** 前端调用 POST /api/generate/image（携带 JWT）
- **AND** 后端调度模型、扣费、存储结果、返回 URL

### Requirement: 项目持久化
项目存储 SHALL 从 localStorage 改为后端 MySQL，支持 localStorage 数据一键迁移。

#### Scenario: 项目保存
- **WHEN** 用户保存画布
- **THEN** 调用 PUT /api/projects/:id，后端存 canvas_data JSON
- **AND** 不再写 localStorage

## REMOVED Requirements

### Requirement: 浏览器端 API Key 配置
**Reason**: API Key 暴露在浏览器端存在安全风险，改由后端统一管理
**Migration**: 前端 ApiSettings.vue 改造为用户中心/额度展示；API Key 配置迁移到管理后台渠道地址管理
