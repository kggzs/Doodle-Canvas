# Doodle-Canvas 开发进度记录

> 日期：2026-06-18  
> 基线文档：`doc/missing-features.md`、`doc/server-design.md`、`数据信息.md`

## 本次目标

围绕 `missing-features.md` 第一优先级继续开发，优先补齐后端可闭环能力：

- 生成记录持久化
- 本地文件存储与软删除
- 计费规则、费用预估、生成预扣费与失败退款
- 用户侧余额、流水、生成记录、项目持久化接口
- 管理侧计费规则、生成记录、文件列表/恢复接口
- 注册邮箱验证后的默认用户组与注册赠送金币

## 设计决策

1. 本地存储按 `server-design.md` v3.2 执行：默认使用 `server/storage`，访问路径为 `/storage/*`，生产环境仍建议由 Nginx 映射。
2. 金币变动只通过 `CoinService.transact()` 写入，生成消费使用 `consume`，失败退款使用 `refund`，注册赠送使用 `register_gift`。
3. `users.user_group_id` 仅作为主组展示冗余字段；计费倍率以有效期内的 `user_group_members` 关联为准。
4. 计费规则未配置时费用为 `0`，允许模型先免费运行；配置 `billing_rules` 后生成流程会自动预扣。
5. 第三方生成结果会尝试转存到本地；转存失败时保留上游原始 URL，并记录 warning，不阻断用户拿到结果。
6. 生成记录先创建为 `processing`，成功后更新为 `completed`，失败更新为 `failed` 并写 `error_message`。
7. 对已有库新增 `server/sql/upgrade-core-features.sql`，避免只更新 `init.sql` 导致存量环境缺字段。
8. 前端认证状态改为响应式 token + user 共同判断，避免登录成功后只更新用户信息、路由守卫仍认为未登录；401 清理本地会话时同步通知 auth store 清空响应式状态。
9. 管理后台优先复用已经落地的核心接口，按 `server-design.md` 的模块拆分补齐 Dashboard、生成记录、计费规则、文件管理页面；Dashboard 统计直接读取 `users`、`generation_records`、`coin_transactions`、`files`、`model_configs`，不额外引入缓存层。
10. 鉴权、密钥、存储、计费等共享链路按生产安全优先处理：生产环境缺少强 JWT/AES 密钥时直接启动失败，文件公开访问必须经过数据库状态校验，外部资源转存默认阻断内网/本机地址。
11. 用户侧模型列表严格保持“可用模型”语义：模型必须启用并至少绑定一个启用且未熔断的渠道才会出现在 `/api/models`；后台新增模型时支持直接选择默认渠道，避免创建成功但用户侧不可见。
12. 模型、渠道、计费配置合并到三类模型页：问答、图片、视频分别维护自己的 API 地址、API 路径、Key、调用模型名、用户显示名和计费规则；同一模型可继续新增同类型渠道线路，生成时复用服务端已有轮询策略。
13. 图片生成保持强制消耗积分：模型页图片计费输入最小值为 1，后端计费服务仍对图片模型执行最低 1 金币兜底，避免误设为 0 后免费生成。
14. 根路径不再直接进入画布或旧项目页：`/` 作为项目官网，登录/注册成功默认进入 `/projects`，后台仍从 `/admin` 进入；用户画布、提示词、图片和视频节点数据以服务端 `projects.canvas_data` 为准，不再依赖浏览器项目缓存。

## 已实现内容

### 数据模型

- 新增 `BillingRule`、`GenerationRecord`、`File`、`Project`、`SystemSetting`、`MigrateImport` Sequelize Model。
- 更新 `UserBalance`：补齐 `coins_frozen`、`total_recharged`、`total_gifted`、`total_expired`、`last_transaction_at`、低余额提醒字段。
- 更新 `CoinTransaction`：补齐 `tx_no`、`related_tx_id`、`reason_code`、`description`、`client_ip`、`user_agent`、`cost_snapshot`、`is_reversed`，并扩展流水类型。
- 更新 `server/src/models/index.js` 关联关系。

### 服务层

- 新增 `storage.js`：上传、远程生成结果转存、文件软删除、管理员恢复、文件列表。
- 新增 `billing.js`：费用预估、用户组倍率、基础配额检查、生成预扣、失败退款、计费规则 CRUD。
- 新增 `project.js`：项目列表、创建、详情、更新、删除。
- 新增 `records.js`：用户侧/管理侧生成记录查询。
- 更新 `generation.js`：图片、视频、非流式对话接入生成记录、计费和文件转存；视频异步任务完成后回写记录。
- 更新 `auth.js`：邮箱验证成功后加入默认用户组，初始化余额并写注册赠送金币流水；`/auth/me` 返回余额和用户组。
- 更新 `coins.js`：支持新流水类型、余额汇总和用户侧流水查询。

### 安全与稳定性修复

- 更新 JWT 配置：生产环境必须配置非默认且长度不少于 32 字节的 `JWT_SECRET`。
- 更新 AES-GCM 加密：新加密数据使用随机 12 字节 IV，并兼容旧版固定 IV 数据解密；生产环境要求配置 32 字节 `AES_SECRET_KEY`。
- 更新文件公开访问：移除裸 `express.static(server/storage)`，`/storage/*` 只允许访问数据库中 `active` 状态且物理文件存在的记录，软删除/隔离文件返回 404。
- 更新远程文件转存：限制协议为 HTTP/HTTPS，禁止 URL 凭据，解析 DNS 后阻断 loopback、内网、链路本地、多播等受限地址，并对重定向重复执行校验。
- 更新 Redis 故障处理：限流在 Redis 异常时启用进程内滑动窗口兜底；生产环境 token 黑名单 Redis 异常时默认拒绝鉴权，同时保留进程内黑名单兜底。
- 更新生成计费：用户扣费链路增加 MySQL 用户级命名锁，降低并发请求超用余额风险；流式对话扣费失败会把生成记录标记为失败。
- 更新依赖：升级 `nanoid`、`nodemailer`、`uuid`，并通过 npm overrides 固定 `dottie`、`uuid`，消除生产依赖审计风险。

### 模型可见性修复

- 定位用户侧无法读取后台新增模型的原因：`/api/models` 按 `server-design.md` 只返回“已启用 + 有可用渠道绑定”的模型；当前 `gpt-image-2` 已创建并启用，但未写入 `model_channel_bindings`。
- 更新后台模型创建接口：`POST /api/admin/models` 支持携带 `channel_id`、`rotation_weight`、`rotation_strategy`，服务层在同一事务内创建模型与初始绑定。
- 更新 `AdminModels`：新增模型时可选择默认绑定渠道；模型状态、删除、绑定新增/修改/移除后刷新前端公开模型缓存。
- 更新 `AdminChannels`：渠道创建、更新、删除后刷新公开模型缓存，避免用户侧仍看到旧可用性。
- 更新用户侧模型加载：`loadAllModels()` 进入画布时主动重新拉取 `/api/models`。
- 更新图片/视频配置节点：模型与参数下拉改为 click 触发，避免用户点击模型名不展开。
- 已将当前测试库中未绑定的 `gpt-image-2` 绑定到现有启用渠道，用户侧公开模型列表已包含该 image 模型。

### 路由层

- 新增用户侧接口：
  - `GET /api/coins/balance`
  - `GET /api/coins/summary`
  - `GET /api/coins/transactions`
  - `GET /api/billing/estimate`
  - `GET /api/records`
  - `GET /api/records/:id`
  - `POST /api/upload/image`
  - `GET /api/files/:id`
  - `DELETE /api/files/:id`
  - `GET/POST /api/projects`
  - `GET/PUT/DELETE /api/projects/:id`
- 新增管理侧接口：
  - `GET /api/admin/dashboard/overview`
  - `GET /api/admin/dashboard/trend`
  - `GET /api/admin/dashboard/model-stats`
  - `GET/POST /api/admin/billing/rules`
  - `PUT/DELETE /api/admin/billing/rules/:id`
  - `GET /api/admin/records`
  - `GET /api/admin/records/:id`
  - `GET /api/admin/files`
  - `POST /api/admin/files/:id/restore`

### 前端管理后台

- 新增 `AdminDashboard`：展示用户、生成、金币、文件概况，近 7 天趋势和模型使用统计。
- 新增 `AdminRecords`：按关键词、类型、状态、审核状态查询生成记录，并支持查看详情。
- 新增 `AdminBilling`：展示、筛选、新增、编辑和删除模型计费规则。
- 新增 `AdminFiles`：查询文件列表，区分类型/状态，并支持管理员恢复软删除文件。
- 更新后台路由与 `AdminShell` 导航：`/admin` 默认进入 `/admin/dashboard`，后台菜单补齐仪表盘、生成记录、计费规则、文件管理。

### 数据库脚本

- 更新 `server/sql/init.sql`：补齐核心表与字段。
- 新增 `server/sql/upgrade-core-features.sql`：用于存量 `canvas` 数据库升级。
- 新增 `server/src/scripts/upgrade-core-features.js`：兼容当前 MySQL/MariaDB 环境的存量库升级脚本，已加入 `npm --prefix server run upgrade-core-features`。

## 测试记录

已执行：

- `git diff --check`：通过，仅有 Git 换行符提示。
- `node --check`：全量检查 `server/src/**/*.js`，通过。
- 后端路由装载检查：`import('./server/src/routes/index.js')`，通过；首次检查因 Redis 客户端保持事件循环未退出而超时，重跑时显式断开 Redis 后通过。
- `npm run build`：通过，Vite 成功构建前端产物。
- 数据库初始化：已在本机 `canvas` 库执行 `server/sql/init.sql`。
- 数据库升级：纯 SQL 版升级脚本因当前数据库不支持 `ADD COLUMN IF NOT EXISTS` 语法未执行成功；随后执行兼容版 `node src/scripts/upgrade-core-features.js`，通过。
- 浏览器登录验证：通过 in-app Browser 访问 `http://127.0.0.1:3000/huobao-canvas/login`，使用测试管理员登录后成功进入 `/admin/users`。
- 后台页面验证：`/admin/users`、`/admin/user-groups`、`/admin/coins`、`/admin/channels`、`/admin/models` 均可打开，页面包含管理后台壳、导航和关键控件，浏览器控制台无 error。
- 退出与路由守卫：点击「退出」后跳转登录页；未登录访问 `/admin/users` 会重定向到 `/login?redirect=/admin/users`。
- 登录回归复测：用户侧曾看到 `POST /api/auth/login 500`，定位为后端 3000 端口未监听，重启后 `/api/health` 正常；随后发现登录 200 后停留登录页，修复 `src/stores/auth.js` 的非响应式 token 状态后，浏览器闭环通过：退出 -> 访问后台触发守卫 -> 登录 -> 自动回到 `/admin/users`。
- API 冒烟：通过 `/api/auth/login` 重新登录后，`/api/auth/me`、`/api/coins/balance`、`/api/coins/summary`、`/api/records`、`/api/admin/records`、`/api/admin/billing/rules`、`/api/admin/files` 均返回 `code=0`。
- 项目 CRUD 冒烟：`POST /api/projects`、`GET /api/projects/:id`、`DELETE /api/projects/:id` 通过。
- Dashboard API 冒烟：`/api/admin/dashboard/overview`、`/api/admin/dashboard/trend`、`/api/admin/dashboard/model-stats` 均返回 `code=0`。
- 新后台页面浏览器验证：通过 in-app Browser 访问 `/admin/dashboard`、`/admin/records`、`/admin/billing`、`/admin/files`，页面均显示管理后台壳、关键控件和数据表空态，控制台无 error。
- 登录流程浏览器复测：在后台点击「退出」后回到 `/login`，使用 `codex-admin@example.com` / `CodexAdmin123` 重新登录，成功进入 `/admin/dashboard`，未再出现 `/api/auth/login 500`。
- 生产依赖审计：`npm audit --omit=dev --registry=https://registry.npmjs.org` 与 `npm --prefix server audit --omit=dev --registry=https://registry.npmjs.org` 均为 0 vulnerabilities。
- 关键文件语法检查：`node --check server/src/app.js`、`storage.js`、`encryption.js`、`generation.js`、`billing.js`、`middleware/auth.js`、`middleware/rateLimit.js`、`services/auth.js` 均通过。
- 模块导入与加密回归：导入 encryption、storage、generation、billing、routes 相关模块通过；`encrypt()` 生成带 `iv` 的密文，`decrypt()` 可正确还原。
- 存储软删除回归：上传测试图片后 `/storage/*` 可访问；执行 `DELETE /api/files/:id` 后旧 URL 返回 404；测试上传文件已清理。
- SSRF 负向测试：`persistRemoteFile()` 转存 `http://127.0.0.1:3000/api/health` 被拒绝，返回 `StorageError` code `42201`。
- 生产密钥校验：`NODE_ENV=production` 且未配置 `JWT_SECRET` 时启动配置报错；未配置 `AES_SECRET_KEY` 时加密报错，均符合预期。
- 最新 API 冒烟：`/api/health`、`/api/auth/login`、`/api/auth/me`、`/api/admin/dashboard/overview`、`/api/admin/dashboard/trend`、`/api/admin/dashboard/model-stats`、`/api/admin/records`、`/api/admin/billing/rules`、`/api/admin/files` 均返回 `code=0`。
- 最新浏览器验证：通过 in-app Browser 访问 `/huobao-canvas/admin/files`、`/huobao-canvas/admin/records`、`/huobao-canvas/admin/billing`，均保持已登录后台态，页面显示预期标题，控制台无新增 error。
- 运行日志复核：`server-runtime.err.log` 仅剩 Sequelize 当前数据库版本弃用警告；`server-runtime.out.log` 未检出 500、未处理异常、TypeError、ReferenceError 等运行错误关键词。
- 模型可见性 API 回归：绑定现有 `gpt-image-2` 后，`GET /api/models` 返回 `image[0].modelKey = gpt-image-2`，`availableChannels = 1`。
- 创建时绑定回归：使用 `POST /api/admin/models` 创建临时模型并携带 `channel_id`，公开 `/api/models` 能立即读取；随后删除临时模型并确认公开列表不再包含，测试数据已清理。
- 用户画布浏览器回归：访问 `/huobao-canvas/canvas/new`，添加“文生图”配置节点，点击模型下拉后可见 `gpt-image-2-测试`，控制台无新增 error。
- 根路径与三类模型配置回归：Vite `base`、Vue Router history、后端 `FRONTEND_BASE`、`server/.env` 与 `nginx.conf` 已统一到 `/`，后台仍通过 `/admin` 访问；后端启动日志显示前端入口 `http://localhost:3000/`。
- 渠道/模型三分类实现：`model_channels` 新增 `model_type`，管理端渠道页和模型页加入“问答模型 / 图片生成模型 / 视频生成模型”分段切换；模型创建、绑定、公开模型查询、生成运行时选路均校验同类型渠道。
- 存量混合渠道迁移：`upgrade-core-features.js` 与 SQL 版升级脚本会把旧的多类型混合渠道按模型类型复制拆分，并迁移绑定；本机迁移后 `GET /api/admin/channels?model_type=image` 与 `?model_type=chat` 均返回 1 条，`GET /api/models` 返回 `publicImageCount=1`、`publicChatCount=1`。
- 用户侧模型来源调整：Pinia 模型 Store 不再把内置模型和本地历史自定义模型混入生成下拉，用户侧只显示 `/api/models` 返回的后台启用且有可用同类型渠道绑定的模型；文生图、视频、问答节点不再回退到旧默认模型 key。
- 用户积分展示与扣费：`AppHeader` 登录态显示“积分”；新增用户侧 `coinApi`；图片生成成功后触发余额刷新。计费服务对图片模型设置最低消耗 1 金币，即使后台计费规则误设为 0 也不会免费生成。
- 最新接口与浏览器验证：登录 `codex-admin@example.com` / `CodexAdmin123` 成功进入 `/admin/dashboard`，头部显示 `积分 0`，控制台无 error；后台 `/admin/channels` 问答标签显示“测试”，图片标签显示“测试-image”；后台 `/admin/models` 图片标签仅显示 `gpt-image-2`，问答模型未混入；0 余额调用 `POST /api/generate/image` 返回 `40201 用户金币余额不足` 且 `required=1`，不再返回 500。
- 最新构建与语法检查：`node --check` 覆盖 `ModelChannel.js`、`model-management.js`、`generation.js`、`billing.js`、`admin/channels.js`、`upgrade-core-features.js` 均通过；`npm run build` 通过。
- 三类模型页合并配置：新增 `AdminModelTypePage` 统一承载 `/admin/models/chat`、`/admin/models/image`、`/admin/models/video`；页面内直接编辑渠道名称、Provider、API 地址、API 路径、API Key、调用模型名称、用户显示模型名称、默认参数和模型计费规则。
- 多渠道线路配置：模型页表格增加“渠道数”和“新增线路”，可为同一个模型继续创建同类型渠道并绑定；新增线路时锁定模型名称和默认参数，只填写渠道 API 信息，后端生成时按 `model_channel_bindings` 的 `round_robin` 等策略参与选路。
- 后台入口收敛：旧 `/admin/channels`、`/admin/billing` 改为跳转 `/admin/models/chat`，避免渠道、计费、模型出现多套配置入口；顶部导航保留“问答模型 / 图片模型 / 视频模型”三个模型配置入口。
- 计费规则回归：临时创建图片模型、图片渠道和计费规则，`/api/billing/estimate` 初始返回 `base_amount=3.5`，更新规则后返回 `base_amount=2.25`，确认模型页保存的固定计费规则能影响实际费用预估；临时数据已清理。
- 多渠道公开模型回归：临时创建问答模型并绑定 2 条问答渠道，`GET /api/admin/models/:id/channels` 返回 `bindingCount=2` 且类型均为 `chat`，`GET /api/models/chat` 返回该模型 `availableChannels=2`，费用预估 `base_amount=0.75`；临时数据已清理。
- 最新浏览器验证：通过 in-app Browser 登录 `codex-admin@example.com` / `CodexAdmin123` 后访问 `/admin/models/chat`、`/admin/models/image`、`/admin/models/video`，问答/图片页显示新增线路、API 路径、消耗积分；视频页打开“新增视频生成模型”抽屉后确认 API 路径、调用模型名称、Provider、每次消耗积分字段存在；旧 `/admin/channels`、`/admin/billing` 均跳转 `/admin/models/chat`；控制台无 error。
- 模型调用故障排查：定位 `POST /api/chat/completions/stream 400` 的直接原因是问答渠道 `config.endpoints.chat` 被浏览器自动填充污染为 `admin@example.com`，已修正当前库为 `/v1/chat/completions`，并在模型页禁用 API 地址、API 路径、API Key 自动填充、保存前校验 API 路径。
- 上游 URL 拼接修复：`generation.js` 增加重复版本段规避，兼容 `API 地址=https://example.com/v1` 且 `API 路径=/v1/chat/completions` 的配置，避免拼出 `/v1/v1/...`。
- 渠道密钥状态：管理端渠道响应新增 `apiKeyConfigured`、`apiKeyValid`，模型页展示“密钥状态”；当前问答渠道 `测试` 为 `keyValid=true`，图片渠道 `测试-image` 为 `keyValid=false`，图片生成返回 `50301 渠道 测试-image API Key 配置无效，请在后台重新保存渠道密钥`。
- 上游认证错误语义修复：上游 401/403 统一返回 `50301 渠道 xxx 上游认证失败，请检查 API Key 是否正确`，不再伪装成前端请求参数 400；当前问答请求已进入正确上游地址，但上游返回 401，说明现有问答 Key 被上游拒绝。
- Node 上游连接稳定性：`generation.js` 为 axios 配置 IPv4 `httpAgent/httpsAgent`，避免 Node 与 curl 在 DNS/连接策略不一致时出现 TLS 握手前断开；复测问答接口从 TLS 断开变为明确的上游认证失败。
- 错误隐藏与错误日志：新增 `error_logs` 表、`ErrorLog` 模型、错误日志服务和 `/api/admin/error-logs` 管理接口；用户侧 `/api/*` 错误统一返回友好文案，后台错误日志保留原始 message、堆栈、上游状态、请求路径、用户和 UA 等排查信息。新增后台 `/admin/error-logs` 页面，可按关键词、级别、来源筛选并标记已处理。
- 超时与断连记录：`generation.js` 在上游响应非 2xx、网络异常、超时时立即写入 `upstream` 日志；Express 增加 API 客户端断开记录，前端超时或用户取消时后台可见 499 类记录。流式问答错误事件仅向前端发送“生成失败，请稍后再试”等友好文案。
- 积分刷新回归：前端 API 超时时间提升到 120 秒；问答、图片、视频生成结束或失败后均派发 `doodle-balance-refresh`，`AppHeader` 增加刷新排队逻辑，避免并发刷新导致右上角积分被旧响应覆盖。
- 删除模型/渠道策略：模型或渠道已有历史生成记录时不再硬删，以免破坏 `generation_records` 外键追溯；改为事务内解绑并停用，用户侧公开模型列表不再显示，后台历史记录仍可关联原模型/渠道。
- 最新超时回归测试：临时启动本地悬挂上游服务并创建 `codex-timeout-image-model`，调用 `/api/generate/image` 返回 HTTP 504、`message=服务暂时不可用，请稍后再试`，响应体未暴露 `timeout of 1000ms exceeded`；`/api/admin/error-logs?keyword=timeout` 可看到 `scope=upstream` 且原始错误为 `timeout of 1000ms exceeded`；失败生成完成退款，余额保持 `10`。
- 最新浏览器验证：通过 in-app Browser 表单登录 `codex-admin@example.com` / `CodexAdmin123`，访问 `/admin/error-logs` 可见“错误日志”和 timeout 记录，访问 `/` 可见用户首页；后台和用户页右上角均显示 `积分 10`，浏览器控制台 error 数为 0。
- 根路径官网与登录流：新增 `/` 项目官网，登录按钮进入 `/login`；表单登录 `codex-admin@example.com` / `CodexAdmin123` 后默认进入 `/projects`。直接从 `/admin` 被拦截到登录页时仍保留 redirect 回后台。
- 云端项目同步：前端项目 Store 改为调用 `/api/projects`，画布 `nodes`、`edges`、`viewport` 自动保存到服务端；文件上传图片经 `/api/upload/image` 写入服务端文件库，生成图片/视频请求携带 `project_id` 以关联生成记录。保存前会清理 `base64`、`maskData`、`blob:`、`data:`、`upload://` 等浏览器本地数据。
- 项目 API 回归：`POST /api/projects` 创建含文本/图片节点项目，`GET /api/projects/:id` 回读 `canvasData.nodes.Count=2` 且提示词为“云端同步测试提示词”，`DELETE /api/projects/:id` 返回 `code=0`；`PUT /api/projects/:id` 保存后回读提示词“PUT 保存后的提示词”和 `viewport.zoom=1.2`，测试项目均已删除。
- 浏览器云同步回归：通过 in-app Browser 访问 `/` 可见官网内容；登录后进入 `/canvas/567818cd-bcf4-406a-ba25-62d2fcf5a804`，页面显示积分与用户信息且控制台 error 数为 0；点击“文本”创建节点后，后端 `GET /api/projects/:id` 回读 `nodeCount=1`、`nodeTypes=text`；刷新画布后文本节点仍存在，访问 `/projects` 可见该云端项目。浏览器验证项目已在测试结束后删除。
- 最新构建与语法检查：`node --check server/src/services/project.js`、`server/src/services/generation.js`、`server/src/app.js` 均通过；`npm run build` 通过。
- 图片生成后台可见性修复：`b64_json`/裸 base64 图片结果会转换为 `data:image/png;base64,...` 并通过 `StorageService.saveDataUrl()` 落入 `files`，避免被误当远程 URL 导致转存失败；生成结果返回 `/storage/generated/image/...` 与 `file_id`，后台文件列表、生成记录详情均可看到关联文件。
- 后台追溯信息增强：`/api/admin/files` 现在带出用户、生成记录、项目、模型、渠道；`/api/admin/records` 带出项目；`/api/admin/coins/transactions` 对 `generation` 引用回填生成记录、项目、模型、渠道和文件。管理端文件页增加图片预览/项目/生成记录列，生成记录页增加项目列和结果预览，金币流水页增加业务详情列和详情抽屉。
- 金币流水上下文增强：生成扣费写入 `metadata.generation_id/project_id/project_name/model_key/model_display_name/prompt`，`description` 格式调整为“图片生成消费 / 项目「...」 / 模型「...」”；退款流水同样回填项目和模型上下文。流水关键词现在也会搜索 `metadata` 和 `cost_snapshot`。
- 登录流调整：登录、注册和已登录访问登录页默认进入 `/projects`；普通用户误入后台无权限时也回到 `/projects`，不再自动创建 `/canvas/new`。
- 登录 redirect 兜底修复：登录/注册页只允许保留 `/admin...` 回跳，若 URL 携带 `redirect=/canvas/new` 或其他用户侧路径，登录完成后统一进入 `/projects`；浏览器复测 `/login?redirect=/canvas/new` 使用测试账号登录后 URL 为 `/projects`。
- 最新完整生成回归：临时启动本地图片上游返回 `b64_json`，通过后台 API 创建临时图片渠道/模型/项目并调用 `/api/generate/image`；验证生成 URL 为 `/storage/generated/image/...`，`/api/admin/files` 可按 `generated_image` 找到文件且 `generation.project.name` 正确，`/api/admin/records/:id` 返回 `recordFileCount=1` 和项目名，`/api/admin/coins/transactions?keyword=<项目名>` 返回扣费流水且 `coinDescription`、`metadata.project_name`、`generation.files` 均正确。临时项目、模型、渠道、记录、文件和余额变动已清理。
- 图片生成外链回填：生成结果转存失败时不再保留上游 URL 作为成功结果，改为写入 `storage` 错误日志、标记生成失败并触发退款；新增 `npm --prefix server run backfill-generated-files`，可将历史 `generation_records.result` 中的上游图片/视频 URL 下载到本地 `server/storage`，并同步替换项目画布中的旧 URL。
- 真实外链回填验证：对现有 4 条 `image.jiyongai.org` 历史图片记录执行回填，全部写入 `files` 表并更新生成记录为 `http://localhost:3000/storage/generated/image/...`，其中 2 个项目画布同步替换缩略图/节点 URL；`/api/admin/records/:id` 返回 `record.files.Count=1`，`/api/admin/files?type=generated_image` 返回 `totalFiles=4`。
- 浏览器后台验证：通过 in-app Browser 登录 `codex-admin@example.com` / `CodexAdmin123` 后访问 `/admin/files`，页面渲染 4 张本地 storage 缩略图且 `upstreamCount=0`；访问 `/admin/records` 并打开图片记录详情，结果预览与关联文件均显示本地 storage 图片，未继续渲染 `image.jiyongai.org` 外链。
- 后台 429 修复：全局限流改为只作用于 `/api`，静态资源加载不再消耗 API 额度；默认 `RATE_LIMIT_GLOBAL` 从 100/min 调整为 600/min，并切换 Redis key 前缀避开旧窗口计数。头部积分余额增加 30 秒 session 缓存，普通后台页面切换不再重复请求 `/api/coins/balance`，生成完成事件仍强制刷新。
- 429 回归验证：重启后端后使用管理 token 连续请求余额、仪表盘、用户、用户组等 140 次全部返回 200，最低剩余额度 458；通过 in-app Browser 访问 `/admin/dashboard`、`/admin/users`、`/admin/user-groups` 再回到仪表盘，页面正常渲染，控制台 error 数为 0，未出现 `429` 或 `Too Many Requests`。

未执行：

- 未调用真实第三方模型接口验证生成转存，因为需要有效渠道 API Key 和外部服务配额。

## 后续未完成

- 充值订单与卡密兑换完整流程。
- 内容审核、举报、风控规则与封禁流水。
- 公告与站内消息系统。
- 审计日志、访问日志完整落库。
- 管理后台新增页面：Review、Risk、Announcements、Messages、RedeemCards、RechargeOrders、AuditLogs、Reports、Settings。
- 用户中心页面：Profile、Balance、Messages。
- 数据迁移 API：`/api/migrate/*`。
