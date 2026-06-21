# Doodle-Canvas 文档索引

更新时间：2026-06-21

本目录集中维护项目运行、部署、架构、接口、数据库、审计与后续计划文档。根目录 `README.md` 用于项目介绍，详细工程文档统一放在 `doc/`。

## 文档列表

| 文档 | 说明 |
| --- | --- |
| [代码审计报告](./code-audit-2026-06-21.md) | 当前代码安全、可靠性与运维风险审计结论 |
| [运行指南](./RUN-GUIDE.md) | 本地开发、启动、构建、常见问题 |
| [部署流程](./DEPLOYMENT.md) | 生产环境部署、环境变量、Nginx、PM2 |
| [服务端设计](./server-design.md) | Express/Sequelize 服务端架构与核心模块 |
| [API 参考](./API.md) | 用户侧与管理侧 API 概览 |
| [数据库说明](./database.md) | MySQL 表结构、初始化与升级策略 |
| [SQL 合并说明](./sql-merge.md) | 已合并 SQL 文件、来源顺序与使用注意 |
| [工作流说明](./workflow.md) | 画布节点、工作流编排与模型调用链路 |
| [开发进度](./development-progress.md) | 当前功能完成度与验证记录 |
| [缺失功能与待办](./missing-features.md) | 后续建议补齐的工程任务 |
| [模型与渠道配置](./model-provider-guide.md) | OpenAI、阿里云、豆包、StepFun、Agnes、自定义渠道配置要点 |

## 生成产物

| 文件 | 说明 |
| --- | --- |
| [all-sql-merged.sql](./all-sql-merged.sql) | `server/sql/*.sql` 按顺序合并后的完整 SQL 文件 |

## 最近验证

| 项目 | 结果 |
| --- | --- |
| 前端构建 | `npm run build` 通过 |
| 前端依赖审计 | `npm audit --omit=dev --registry=https://registry.npmjs.org`：0 vulnerabilities |
| 后端依赖审计 | `npm --prefix server audit --omit=dev --registry=https://registry.npmjs.org`：0 vulnerabilities |

