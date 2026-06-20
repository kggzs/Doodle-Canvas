# Doodle-Canvas 代码审计记录

> 原审计日期：2026-06-19
> 更新日期：2026-06-20
> 范围：认证、文件存储、项目归属、模型渠道代理、计费和错误日志

## 审计结论

2026-06-19 审计发现的高/中风险问题已完成修复，并已纳入当前架构文档。本文件保留问题、修复和验证摘要，方便后续追溯。

## 问题与修复状态

### A-01 高危：Refresh Token 可被当作 Access Token 使用

- 位置：`server/src/services/auth.js`、`server/src/middleware/auth.js`
- 风险：Refresh Token 泄露后可直接访问业务 API，扩大有效攻击窗口。
- 修复：签发 token 时加入 `token_type`；业务鉴权只接受 `access`，刷新流程只接受 `refresh`。
- 状态：已修复。

### A-02 高危：上传/转存文件过度信任 MIME Header

- 位置：`server/src/services/storage.js`、`server/src/routes/files.js`
- 风险：伪装成图片/视频的任意字节被保存并对外提供。
- 修复：增加 PNG/JPEG/WebP/GIF/MP4/WebM 魔数识别，写盘前按类型校验，Data URL 和远程文件均有大小限制。
- 状态：已修复。

### A-03 中危：远程文件转存存在 DNS 重绑定窗口

- 位置：`server/src/services/storage.js`
- 风险：校验域名和实际连接之间可能发生 DNS 重绑定，削弱 SSRF 防护。
- 修复：HTTP/HTTPS agent 增加安全 `lookup`，实际连接阶段再次阻断受限地址。
- 状态：已修复。

### A-04 中危：生成记录的 `project_id` 未校验用户归属

- 位置：`server/src/services/generation.js`、`server/src/routes/generate.js`、`server/src/routes/chat.js`
- 风险：用户可提交其他用户项目 ID，造成跨用户关联污染。
- 修复：路由校验 UUID；服务层只写入当前用户拥有的项目 ID；计费元数据也只记录已归属项目。
- 状态：已修复。

### A-05 低危：依赖审计命令受镜像源限制

- 现象：`npmmirror` 不支持 npm audit bulk advisory 接口。
- 修复：审计命令固定官方 registry。
- 状态：已验证。

## 后续新增改进

审计后又落地了以下相关改进：

- 上游认证错误和超时写入 `error_logs`，用户侧仅返回友好文案。
- API 客户端断开连接记录为 499 类错误日志。
- 图片生成外链转存失败时不再保留上游 URL，改为失败并退款。
- 后台文件、生成记录、金币流水补齐项目、模型、渠道和文件追溯信息。
- 全局限流只作用于 `/api`，避免静态资源触发 429。

## 验证摘要

历史验证通过：

- `git diff --check`
- `node --check` 覆盖认证、存储、生成、计费、路由等关键文件
- 模块导入检查
- `npm run build`
- 官方 registry 生产依赖审计，根项目与 `server` 均为 0 vulnerabilities
- 存储软删除回归
- SSRF 负向测试
- 项目归属校验
- 超时与错误日志回归
- 后台页面浏览器冒烟

## 当前建议

继续推进以下审计相关能力：

- 管理员操作审计日志。
- 关键 API 访问日志。
- 内容审核与举报。
- 风控规则和封禁流水。
- 自动化测试脚本。
