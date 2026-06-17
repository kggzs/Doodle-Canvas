# Checklist

> 验证清单：逐项确认实现是否符合 `doc/server-design.md` 设计规范。
> 每完成一项验证后勾选 `[x]`。

## 阶段一：基础设施（认证体系）

- [ ] Express 项目框架搭建完成，目录结构符合设计文档 Step 6
- [ ] MySQL 连接配置正确（utf8mb4_unicode_ci），Sequelize 同步表结构无报错
- [ ] Redis 连接配置正确（支持密码认证），可执行 SET/GET
- [ ] .env 包含全部环境变量（MySQL/Redis/JWT/AES/SMTP/金币/限流/内容审核/CORS）
- [ ] 统一响应格式实现：`{ code, message, data, request_id }`，成功 code=0
- [ ] request_id 中间件：生成 `req_` + nanoid，注入 req 对象与响应头 X-Request-Id
- [ ] AES-256-GCM 加解密工具可正确加解密 API Key
- [ ] users 表字段完整（含 email_verified_at/status/risk_level/coins_frozen/register_ip 等 v3.0 字段）
- [ ] refresh_tokens 表外键关联 users，ON DELETE CASCADE
- [ ] email_verifications 表支持 4 种 purpose（register/reset_password/change_email/login）
- [ ] login_logs 表记录全量登录尝试（含 IP/UA/地理位置解析字段）
- [ ] JWT 鉴权中间件：验证 Token、注入 userId、检查 Redis 黑名单、检查封禁状态
- [ ] Admin 角色中间件：非 admin 返回 40302 ROLE_REQUIRED
- [ ] 速率限制中间件：Redis 滑动窗口，全局 100 次/min 可配
- [ ] 注册流程：邮箱唯一性校验 → bcrypt 加密 → 写入 pending_email → 发送验证码
- [ ] 邮箱认证：验证码 bcrypt 存储，5 次尝试上限，30 分钟过期，认证后初始化余额 + 赠送金币
- [ ] 登录流程：IP 限频（5min 20 次）→ 用户状态检查 → 失败锁定（5 次 15min）→ bcrypt 校验 → 生成 JWT
- [ ] 异地/新设备登录检测并发送邮件提醒
- [ ] Token 刷新：Access 15min、Refresh 7d，刷新时校验 token_hash 与有效期
- [ ] 退出登录：refresh_token revoked_at、Redis 黑名单 TTL = Token 剩余有效期
- [ ] 15 个认证 API 接口全部实现且可通过 curl/Postman 验证
- [ ] 前端 Login.vue / Register.vue 页面可正常登录注册
- [ ] 前端 request.js 注入 JWT Authorization 头，401 自动刷新 Token
- [ ] 前端路由守卫：未登录访问受保护页面跳转登录页
- [ ] AppHeader 显示用户头像、余额、退出按钮

## 阶段二：模型管理 + 多地址轮换

- [ ] model_channels 表：api_key AES 加密存储，含统计字段与熔断字段
- [ ] models 表：model_type ENUM('image','video','chat') 三类独立
- [ ] model_channel_bindings 表：UNIQUE KEY uk_model_channel 防重复绑定
- [ ] 4 个适配器实现（openai/aliyun/doubao/custom），按 provider_type 分发
- [ ] 阿里云适配器支持异步任务（提交 + 轮询查询）
- [ ] 4 种轮换策略实现：round_robin（Redis INCR 取模）、weighted_random、priority、failover
- [ ] 熔断器状态机：CLOSED → OPEN（连续失败 5 次）→ 半开探测（60s 后）→ CLOSED/保持 OPEN
- [ ] 调度流程：查模型 → 查渠道 → 过滤（熔断/并发上限）→ 选策略 → 发请求 → 失败重试
- [ ] 渠道管理 API：CRUD + 测试连通性 + 重置熔断器 + 统计
- [ ] 模型管理 API：CRUD + 启停 + 渠道绑定管理（权重/策略/排序）
- [ ] 用户侧模型 API：GET /api/models、按类型查询、详情
- [ ] 图片生成 API：POST /api/generate/image，返回 images 数组（含 url + thumbnail_url）
- [ ] 视频生成 API：POST /api/generate/video + GET /api/generate/video/:taskId 异步查询
- [ ] 对话 API：非流式 POST /api/chat/completions + 流式 POST /api/chat/completions/stream（SSE）
- [ ] SSE 流式代理：ReadableStream 转发，event: delta/meta/done/error 格式正确
- [ ] 前端 image.js / video.js / chat.js 调用后端 API，移除 provider 参数与 apiKey
- [ ] 前端 useApi.js 简化为纯参数，移除 provider 获取逻辑

## 阶段三：服务端存储

- [ ] files 表：含软删除字段（status/deleted_at/deleted_by/deleted_by_type/delete_reason/related_review_id）
- [ ] 本地存储按 yyyy/mm 分目录（generated/2026/06/xxx.png）
- [ ] 文件上传：写入本地磁盘 + 计算 sha256 + 建 files 记录 + 返回访问 URL
- [ ] AI 生成结果：第三方返回 URL → 后端下载 → 写本地磁盘 → 返回访问 URL
- [ ] 缩略图生成功能实现
- [ ] 软删除规则：用户侧查询 WHERE status='active'，管理员可见全部
- [ ] 软删除不可重复删除（status='deleted' 再次删除返回 409）
- [ ] 物理文件 90 天后定时清理，清理动作写 audit_logs
- [ ] 管理员文件管理 API：列表含已删除、恢复软删除文件
- [ ] 前端 ImageNode 上传改为后端 API
- [ ] 前端 DownloadModal 下载改为本地存储 URL
- [ ] imageCache.js 已删除，IndexedDB 不再使用

## 阶段四：金币额度与计费

- [ ] billing_rules 表：支持 fixed 与 param_tiered 两种规则
- [ ] user_balances 表：balance/coins_frozen/total_* 字段完整，version 乐观锁
- [ ] coin_transactions 表：15 种 type 枚举完整，含 balance_before/balance_after
- [ ] generation_records 表：含 IP/UA、review_status、user_group_snapshot、coin_tx_id/refund_tx_id
- [ ] system_settings 表：KV 结构，secret 项加密存储，API 返回脱敏
- [ ] CoinService.transact()：事务 + FOR UPDATE 行锁 + 乐观锁 + 全量流水 + 审计 + 消息
- [ ] 余额校验：direction=out 时 balance_before >= amount，不足抛 InsufficientBalance (40201)
- [ ] 幂等键防重复扣费
- [ ] 冲正：rollback 反向流水，related_tx_id 指向原流水，置 is_reversed=1
- [ ] 异步联动：更新 Redis 余额缓存（30s TTL）、发送站内消息
- [ ] 用户组费率计算：取所有有效组 cost_multiplier 最小值，黑名单覆盖
- [ ] 配额检查：daily/monthly limit，命中返回 402 QUOTA_EXCEEDED (40202)
- [ ] 生成流程集成：预扣减 → 调用 API → 成功确认/失败退还（refund 流水）
- [ ] 对话类型按实际 token 用量微调（多退少补，差额走 adjust 流水）
- [ ] 用户侧 API：余额查询、流水查询、收支汇总、费用预估
- [ ] 管理侧 API：计费规则 CRUD、用户充值/赠送/调整、全站流水、对账报告
- [ ] 每日对账定时任务：理论余额 vs 实际余额，异常告警
- [ ] 系统设置 API：GET/PUT /api/admin/settings，secret 项脱敏
- [ ] 前端余额展示与费用预估功能

## 阶段五：账号控制与风控

- [ ] user_groups 表：折扣/赠送/费率/配额字段完整
- [ ] user_group_members 表：多对多，含有效期 expires_at
- [ ] user_bans 表：ban/unban/freeze_coins/unfreeze_coins 流水
- [ ] recharge_orders 表：4 种 recharge_type，状态流转完整
- [ ] redeem_cards 表：card_code_hash bcrypt 存储，一码一用
- [ ] content_review 表：自动 + 人工审核状态，关联 generation_records
- [ ] content_reports 表：用户举报，7 种 reason_category
- [ ] risk_rules 表：4 种 rule_type，可配置 condition/action
- [ ] risk_events 表：命中规则事件，含上下文快照
- [ ] audit_logs 表：只增不删，action 枚举覆盖全部场景
- [ ] access_logs 表：含 request_id，可跨表追溯
- [ ] 用户组费率计算：取 cost_multiplier 最小值，配额取最大值，黑名单覆盖
- [ ] 封禁流程：更新状态 → 冻结金币 → 撤销 token → Redis 封禁名单 → 审计 → 消息
- [ ] 解封流程：更新状态 → 解冻金币 → 移出封禁名单 → 审计 → 消息
- [ ] 卡密兑换：bcrypt 校验、一码一用、5 次失败锁定 IP
- [ ] 管理员充值/赠送：写 recharge_orders + coin_transactions
- [ ] 风控中间件：采集维度 → Redis 滑动窗口 → 规则匹配 → 执行动作
- [ ] 8 条内置风控规则实现
- [ ] 风控事件联动封禁（高危动作走 4.4 流程）
- [ ] 内容自动审核接入阿里云绿网
- [ ] 人工复审队列：通过/隐藏/删除/还原，联动 files.status
- [ ] AuditService.log() 覆盖所有写操作（管理员 + 金币变动 + 账号状态 + 内容审核 + 模型 + 系统）
- [ ] 账号控制 API 路由全部实现
- [ ] 风控与审核 API 路由全部实现

## 阶段六：公告与站内消息

- [ ] announcements 表：banner/popup/list 三种 display_type，4 种 target_scope
- [ ] announcement_reads 表：UNIQUE KEY uk_ann_user 保证幂等
- [ ] messages 表：7 种 category，3 种 source，含 ref_type/ref_id 业务关联
- [ ] message_broadcasts 表：群发批次，含发送进度
- [ ] 公告投放：is_active + publish_at + expire_at 过滤，scope 过滤（all/group/user/risk_level）
- [ ] 公告返回分 banner/popup/list 三组
- [ ] 弹窗公告：popup_dismissible + popup_show_count 控制展示
- [ ] 站内消息事件驱动：MessageService.notify() 覆盖全部业务事件
- [ ] 群发批次：异步队列分批（每批 500 用户），在线用户 WebSocket 推送
- [ ] WebSocket 实时推送 message.new 事件
- [ ] 公告与消息 API 路由全部实现（用户侧 + 管理侧）

## 阶段七：管理后台前端

- [ ] 管理后台布局组件（侧边栏导航）实现
- [ ] 仪表盘：今日概况、7 日趋势图、模型使用占比
- [ ] 用户管理：列表/详情/充值/赠送/封禁/用户组调整
- [ ] 模型管理：三 Tab（image/video/chat）+ 多地址轮换配置 + 渠道地址池
- [ ] 计费规则管理页面
- [ ] 风控中心：规则配置/事件处理/IP 黑名单/大盘
- [ ] 内容审核队列 + 举报处理
- [ ] 公告编辑器 + 群发批次进度
- [ ] 审计日志/访问日志/金币流水查询（多维筛选 + 导出 CSV）
- [ ] 系统设置页面

## 阶段八：项目持久化与数据迁移

- [ ] projects 表：canvas_data JSON 存储
- [ ] 项目 CRUD API 实现
- [ ] 前端 projects store 改为后端 API 存储
- [ ] migrate_imports 表：UNIQUE KEY uk_user_client 防重复导入
- [ ] 迁移 API：POST /api/migrate/local、GET /api/migrate/status、DELETE /api/migrate/local-cache
- [ ] 迁移处理：client_id 查重、data:image 转存、第三方 URL 下载转存
- [ ] 前端一键迁移入口与进度展示

## 阶段九：部署与运维

- [ ] PM2 配置（ecosystem.config.js）正确
- [ ] Nginx 配置：API 反向代理 + SSE 支持（proxy_buffering off）+ /storage/ 静态映射 + 安全头
- [ ] init.sql 完整：全部建表 + 预置 system_settings + 默认用户组
- [ ] 部署文档编写完成

## 安全设计验证

- [ ] 密码加密 bcrypt cost=12
- [ ] JWT 有效期：Access 15min、Refresh 7d
- [ ] Token 黑名单：退出登录写入 Redis，TTL = Token 剩余有效期
- [ ] 防暴力破解：登录失败 5 次锁定 15 分钟
- [ ] API Key 加密：AES-256-GCM 加密存储，密钥放环境变量
- [ ] 速率限制：全局 100 次/min，单接口可独立配置
- [ ] SQL 参数化查询：Sequelize 防注入
- [ ] CORS：仅允许前端域名
- [ ] 邮箱强制认证：pending_email 状态不可登录、不可生成
- [ ] IP/UA 全量记录：注册/登录/生成/充值均记录
- [ ] 金币事务强一致：行锁 + 乐观锁 + 流水，禁止绕过 CoinService
- [ ] 审计不可篡改：audit_logs 只增不删，冲正用反向流水
- [ ] 卡密防爆破：5 次失败锁定 IP，bcrypt 存储 hash
- [ ] 内容安全审核：接入阿里云绿网，违规自动拦截

## 统一响应格式与错误码验证

- [ ] 成功响应：`{ code: 0, message: "ok", data: {...}, request_id: "req_xxx" }`
- [ ] 错误响应：`{ code: 4xxxx, message: "...", data: null, errors: [...], request_id: "..." }`
- [ ] 错误码规范：HTTP状态码 × 100 + 序号（如 40101 = 401 类第 1 个错误）
- [ ] SSE 流式响应：event: delta/meta/done/error 格式正确
- [ ] request_id 贯穿 access_logs/audit_logs/coin_transactions/risk_events/generation_records
