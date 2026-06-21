-- ============================================
-- Doodle-Canvas 数据库初始化脚本（当前合并版）
-- 引擎：MySQL InnoDB
-- 字符集：utf8mb4 / 排序规则：utf8mb4_unicode_ci
-- 适用：新服务器首次部署。已合并历史升级脚本中的当前项目所需表结构。
-- 数据：仅写入程序启动所需的默认用户组与系统设置；不包含测试用户、渠道 Key、
--       模型配置、生成记录、文件记录、金币流水、登录日志等业务/测试数据。
-- ============================================

-- 数据库创建
CREATE DATABASE IF NOT EXISTS `canvas`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `canvas`;

-- ============================================
-- 1. users 用户表
-- ============================================
-- v3.0 增强：邮箱认证状态、注册来源信息（IP/UA）、封禁关联、风控标记字段
-- 字段说明：
--   status='pending_email' 的账号不能登录、不能生成内容，仅能查看公开页面
--   完成邮箱认证后自动转为 'active'
--   coins_frozen 在封禁时由系统把当前余额转入冻结字段，解封后可退还
--   risk_tags 由风控引擎写入，供管理后台高亮显示
--   user_group_id 仅为冗余展示字段（存"主组"用于徽章/列表快速渲染），不参与计费
CREATE TABLE IF NOT EXISTS `users` (
    `id`                    CHAR(36)     NOT NULL,
    `username`              VARCHAR(50)  NOT NULL,
    `email`                 VARCHAR(191) NOT NULL,
    `email_verified_at`     DATETIME     DEFAULT NULL COMMENT '邮箱认证时间（NULL=未认证）',
    `password_hash`         VARCHAR(255) NOT NULL COMMENT 'bcrypt 加密',
    `role`                  ENUM('user','admin') DEFAULT 'user',
    `status`                ENUM('active','disabled','banned','pending_email') DEFAULT 'pending_email'
                            COMMENT 'pending_email=待邮箱认证；active=正常；disabled=管理员禁用；banned=风控封禁',
    `avatar_url`            TEXT         DEFAULT NULL,

    -- 计费分组（用户组）：冗余字段，仅为快速展示用户徽章
    `user_group_id`         CHAR(36)     DEFAULT NULL COMMENT '主组（冗余字段，权威关系见 user_group_members）',

    -- 风控与封禁信息
    `ban_reason`            VARCHAR(500) DEFAULT NULL COMMENT '封禁原因',
    `banned_at`             DATETIME     DEFAULT NULL COMMENT '封禁时间',
    `banned_until`          DATETIME     DEFAULT NULL COMMENT '临时封禁截止时间（NULL=永久）',
    `banned_by`             CHAR(36)     DEFAULT NULL COMMENT '封禁操作人（admin user_id）',
    `unban_at`              DATETIME     DEFAULT NULL COMMENT '解封时间',
    `risk_level`            ENUM('low','medium','high') DEFAULT 'low' COMMENT '风险等级',
    `risk_tags`             LONGTEXT     DEFAULT NULL COMMENT '风险标签 JSON 字符串（如 ["刷量","异地登录"]）',
    `violation_count`       INT          DEFAULT 0 COMMENT '累计违规次数',
    `coins_frozen`          DECIMAL(12,2) DEFAULT 0.00 COMMENT '被冻结的金币（封禁时锁定）',

    -- 来源与登录信息（注册时记录）
    `register_ip`           VARCHAR(45)  DEFAULT NULL COMMENT '注册 IP（兼容 IPv6）',
    `register_user_agent`   TEXT         DEFAULT NULL COMMENT '注册时浏览器 UA',
    `register_referer`      VARCHAR(500) DEFAULT NULL COMMENT '注册来源页',
    `register_source`       VARCHAR(50)  DEFAULT NULL COMMENT '注册渠道（web/invite/oauth...）',

    `last_login_at`         DATETIME     DEFAULT NULL,
    `last_login_ip`         VARCHAR(45)  DEFAULT NULL,
    `last_login_user_agent` TEXT         DEFAULT NULL,

    `created_at`            DATETIME     DEFAULT CURRENT_TIMESTAMP,
    `updated_at`            DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `deleted_at`            DATETIME     DEFAULT NULL COMMENT '软删除（保留审计）',

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_username` (`username`),
    UNIQUE KEY `uk_email` (`email`),
    KEY `idx_email` (`email`),
    KEY `idx_status` (`status`),
    KEY `idx_user_group` (`user_group_id`),
    KEY `idx_register_ip` (`register_ip`),
    KEY `idx_risk` (`risk_level`, `violation_count`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- ============================================
-- 2. refresh_tokens 刷新令牌表
-- ============================================
-- 外键关联 users(id)，ON DELETE CASCADE：用户删除时同步清理令牌
CREATE TABLE IF NOT EXISTS `refresh_tokens` (
    `id`              CHAR(36)     NOT NULL,
    `user_id`         CHAR(36)     NOT NULL,
    `token_hash`      VARCHAR(64)  NOT NULL COMMENT '令牌哈希（SHA-256）',
    `device_info`     TEXT         DEFAULT NULL COMMENT '设备信息（UA 解析后的简要描述）',
    `expires_at`      DATETIME     NOT NULL COMMENT '过期时间',
    `revoked_at`      DATETIME     DEFAULT NULL COMMENT '撤销时间（NULL=未撤销）',
    `created_at`      DATETIME     DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_token_hash` (`token_hash`),
    KEY `idx_user` (`user_id`),
    KEY `idx_hash` (`token_hash`),
    CONSTRAINT `fk_refresh_tokens_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='刷新令牌表';

-- ============================================
-- 3. email_verifications 邮箱认证表
-- ============================================
-- 支持两种认证方式：验证码（6 位，邮件正文）和验证链接（一次性 Token）
-- 同一邮箱同一用途的旧记录在新记录生成时失效
-- purpose 取值：register / reset_password / change_email / login
CREATE TABLE IF NOT EXISTS `email_verifications` (
    `id`                  CHAR(36)     NOT NULL,
    `user_id`             CHAR(36)     DEFAULT NULL COMMENT '已注册但未认证的用户（pending_email）',
    `email`               VARCHAR(191) NOT NULL COMMENT '待认证邮箱（也用于注册前预校验）',
    `code`                VARCHAR(255) DEFAULT NULL COMMENT '6 位验证码（bcrypt 存储，code 模式）',
    `token_hash`          VARCHAR(255) DEFAULT NULL COMMENT '验证链接 Token 哈希（链接模式）',
    `purpose`             ENUM('register','reset_password','change_email','login') NOT NULL,
    `expires_at`          DATETIME     NOT NULL COMMENT '过期时间（默认 30 分钟）',
    `consumed_at`         DATETIME     DEFAULT NULL COMMENT '已使用时间',
    `attempts`            INT          DEFAULT 0 COMMENT '尝试次数（防爆破，上限 5）',
    `request_ip`          VARCHAR(45)  DEFAULT NULL,
    `request_user_agent`  TEXT         DEFAULT NULL,
    `sent_at`             DATETIME     DEFAULT NULL COMMENT '邮件实际发送时间',
    `created_at`          DATETIME     DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    KEY `idx_email_purpose` (`email`, `purpose`),
    KEY `idx_user` (`user_id`),
    KEY `idx_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='邮箱认证表';

-- ============================================
-- 4. login_logs 登录日志表（全量记录）
-- ============================================
-- 每一次登录尝试（无论成功失败）都落库，是风控和账号安全审计的核心数据源
-- 失败原因、IP、设备、地理位置均需记录
CREATE TABLE IF NOT EXISTS `login_logs` (
    `id`                  BIGINT       NOT NULL AUTO_INCREMENT,
    `user_id`             CHAR(36)     DEFAULT NULL COMMENT '失败时若能识别用户则记录',
    `email_or_username`   VARCHAR(191) DEFAULT NULL COMMENT '登录账号输入值（脱敏存储）',
    `login_type`          ENUM('password','email_code','oauth','refresh') DEFAULT 'password',
    `status`              ENUM('success','failed','locked','disabled','banned','pending_email') NOT NULL,
    `fail_reason`         VARCHAR(100) DEFAULT NULL COMMENT 'WRONG_PASSWORD / NOT_FOUND / LOCKED / BANNED...',
    `ip`                  VARCHAR(45)  NOT NULL,
    `ip_country`          VARCHAR(50)  DEFAULT NULL COMMENT '解析后的国家',
    `ip_region`           VARCHAR(50)  DEFAULT NULL COMMENT '省/州',
    `ip_city`             VARCHAR(50)  DEFAULT NULL COMMENT '城市',
    `ip_isp`              VARCHAR(100) DEFAULT NULL COMMENT '运营商',
    `user_agent`          TEXT         DEFAULT NULL,
    `ua_browser`          VARCHAR(50)  DEFAULT NULL COMMENT '解析后的浏览器',
    `ua_os`               VARCHAR(50)  DEFAULT NULL COMMENT '解析后的操作系统',
    `ua_device`           VARCHAR(50)  DEFAULT NULL COMMENT '解析后的设备类型（PC/Mobile/Tablet/Bot）',
    `ua_is_bot`           TINYINT(1)   DEFAULT 0,
    `device_fingerprint`  VARCHAR(64)  DEFAULT NULL COMMENT '前端指纹（可选）',
    `refresh_token_id`    CHAR(36)     DEFAULT NULL COMMENT '成功登录对应的会话',
    `created_at`          DATETIME     DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    KEY `idx_user_time` (`user_id`, `created_at`),
    KEY `idx_ip_time` (`ip`, `created_at`),
    KEY `idx_status_time` (`status`, `created_at`),
    KEY `idx_email` (`email_or_username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='登录日志表（全量记录）';

-- ============================================
-- 5. model_channels 模型渠道表（API 地址池）
-- ============================================
-- 每条记录代表一个可复用的 API 地址 + Key 组合。
-- api_key 使用 AES 加密后的 JSON 字符串存储，不保存明文。
CREATE TABLE IF NOT EXISTS `model_channels` (
    `id`              CHAR(36)     NOT NULL,
    `name`            VARCHAR(100) NOT NULL COMMENT '渠道名称（如 OpenAI-主、阿里云万相-备用）',
    `provider_type`   ENUM('openai','aliyun','doubao','stepfun','agnes','custom') NOT NULL COMMENT '适配器类型',
    `model_type`      ENUM('image','video','chat') NOT NULL DEFAULT 'chat' COMMENT '渠道用途类型',
    `api_base_url`    VARCHAR(500) NOT NULL COMMENT 'API 基础地址',
    `api_key`         TEXT         NOT NULL COMMENT 'API Key（AES 加密 JSON）',
    `is_active`       TINYINT(1)   DEFAULT 1 COMMENT '是否启用',
    `priority`        INT          DEFAULT 0 COMMENT '优先级（数值越小越优先）',
    `weight`          INT          DEFAULT 1 COMMENT '轮换权重',
    `max_concurrent`  INT          DEFAULT 10 COMMENT '最大并发数',
    `timeout_ms`      INT          DEFAULT 60000 COMMENT '超时时间（毫秒）',
    `config`          LONGTEXT     DEFAULT NULL COMMENT '渠道特有配置 JSON 字符串',
    `total_requests`  BIGINT       DEFAULT 0 COMMENT '累计请求数',
    `success_count`   BIGINT       DEFAULT 0 COMMENT '成功次数',
    `fail_count`      BIGINT       DEFAULT 0 COMMENT '失败次数',
    `last_used_at`    DATETIME     DEFAULT NULL COMMENT '最后使用时间',
    `last_fail_at`    DATETIME     DEFAULT NULL COMMENT '最后失败时间',
    `circuit_open`    TINYINT(1)   DEFAULT 0 COMMENT '熔断器状态（0=关闭/1=打开）',
    `circuit_open_at` DATETIME     DEFAULT NULL COMMENT '熔断打开时间',
    `created_at`      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    KEY `idx_provider` (`provider_type`),
    KEY `idx_channel_type_active` (`model_type`, `is_active`, `priority`),
    KEY `idx_active` (`is_active`, `priority`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='模型渠道表';

-- ============================================
-- 6. models 模型配置表
-- ============================================
-- 每条记录代表一个具体模型，按 image / video / chat 三类独立管理。
CREATE TABLE IF NOT EXISTS `models` (
    `id`              CHAR(36)     NOT NULL,
    `model_key`       VARCHAR(100) NOT NULL COMMENT '模型标识（如 wan2.7-image-pro）',
    `display_name`    VARCHAR(100) NOT NULL COMMENT '展示名称',
    `model_type`      ENUM('image','video','chat') NOT NULL COMMENT '模型类型',
    `is_active`       TINYINT(1)   DEFAULT 1 COMMENT '是否对用户可见',
    `default_params`  LONGTEXT     DEFAULT NULL COMMENT '默认参数 JSON 字符串',
    `max_params`      LONGTEXT     DEFAULT NULL COMMENT '参数限制 JSON 字符串',
    `sort_order`      INT          DEFAULT 0 COMMENT '排序（越小越靠前）',
    `description`     TEXT         DEFAULT NULL COMMENT '模型描述/标签',
    `created_at`      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_model_key` (`model_key`),
    KEY `idx_type_active` (`model_type`, `is_active`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='模型配置表';

-- ============================================
-- 7. model_channel_bindings 模型-渠道绑定表
-- ============================================
-- 多地址轮换核心表：一个模型可绑定多个渠道地址，每个绑定独立配置轮换策略。
CREATE TABLE IF NOT EXISTS `model_channel_bindings` (
    `id`                CHAR(36) NOT NULL,
    `model_id`          CHAR(36) NOT NULL COMMENT '关联模型',
    `channel_id`        CHAR(36) NOT NULL COMMENT '关联渠道地址',
    `rotation_weight`   INT      DEFAULT 1 COMMENT '轮换权重（1-10）',
    `rotation_strategy` ENUM('round_robin','weighted_random','priority','failover')
                        DEFAULT 'round_robin' COMMENT '轮换策略',
    `is_active`         TINYINT(1) DEFAULT 1 COMMENT '是否启用',
    `last_used_index`   INT      DEFAULT 0 COMMENT '上次轮换索引（Redis 状态的持久化备份）',
    `created_at`        DATETIME DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_model_channel` (`model_id`, `channel_id`),
    KEY `idx_model_active` (`model_id`, `is_active`),
    CONSTRAINT `fk_model_channel_bindings_model` FOREIGN KEY (`model_id`)
        REFERENCES `models` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_model_channel_bindings_channel` FOREIGN KEY (`channel_id`)
        REFERENCES `model_channels` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='模型-渠道绑定表';

-- ============================================
-- 8. user_groups 用户计费分组表
-- ============================================
CREATE TABLE IF NOT EXISTS `user_groups` (
    `id`                    CHAR(36)     NOT NULL,
    `name`                  VARCHAR(50)  NOT NULL COMMENT '组名',
    `code`                  VARCHAR(30)  NOT NULL COMMENT '组代码',
    `description`           VARCHAR(255) DEFAULT NULL,
    `is_default`            TINYINT(1)   DEFAULT 0 COMMENT '是否默认组',
    `is_system`             TINYINT(1)   DEFAULT 0 COMMENT '系统内置组不可删除',
    `cost_multiplier`       DECIMAL(4,3) DEFAULT 1.000 COMMENT '模型价格倍率，最终费用=模型价格*倍率',
    `daily_generate_limit`  INT          DEFAULT 0 COMMENT '每日生成次数上限，0=不限',
    `priority`              INT          DEFAULT 0 COMMENT '优先级',
    `badge_color`           VARCHAR(20)  DEFAULT NULL COMMENT '徽章颜色',
    `is_active`             TINYINT(1)   DEFAULT 1,
    `created_at`            DATETIME     DEFAULT CURRENT_TIMESTAMP,
    `updated_at`            DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user_group_name` (`name`),
    UNIQUE KEY `uk_user_group_code` (`code`),
    KEY `idx_default` (`is_default`),
    KEY `idx_active` (`is_active`, `priority`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户计费分组表';

INSERT INTO `user_groups`
(`id`, `name`, `code`, `description`, `is_default`, `is_system`, `badge_color`, `created_at`, `updated_at`)
VALUES
('00000000-0000-0000-0000-000000000101', '普通用户', 'normal', '系统默认用户组', 1, 1, '#64748b', NOW(), NOW())
ON DUPLICATE KEY UPDATE
    `is_default` = VALUES(`is_default`),
    `is_system` = VALUES(`is_system`);

-- ============================================
-- 9. user_group_members 用户-组关系表
-- ============================================
CREATE TABLE IF NOT EXISTS `user_group_members` (
    `id`            CHAR(36)     NOT NULL,
    `user_id`       CHAR(36)     NOT NULL,
    `group_id`      CHAR(36)     NOT NULL,
    `joined_at`     DATETIME     DEFAULT CURRENT_TIMESTAMP,
    `expires_at`    DATETIME     DEFAULT NULL COMMENT '成员资格有效期',
    `granted_by`    CHAR(36)     DEFAULT NULL COMMENT '授权管理员',
    `grant_reason`  VARCHAR(255) DEFAULT NULL,
    `created_at`    DATETIME     DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user_group_member` (`user_id`, `group_id`),
    KEY `idx_group` (`group_id`),
    CONSTRAINT `fk_user_group_members_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_user_group_members_group` FOREIGN KEY (`group_id`)
        REFERENCES `user_groups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户-组关系表';

-- ============================================
-- 10. user_balances 用户金币余额表
-- ============================================
CREATE TABLE IF NOT EXISTS `user_balances` (
    `id`                      CHAR(36)      NOT NULL,
    `user_id`                 CHAR(36)      NOT NULL,
    `balance`                 DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '当前可用金币余额',
    `coins_frozen`            DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '冻结金币',
    `total_recharged`         DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '累计充值金币',
    `total_consumed`          DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '累计消费金币',
    `total_gifted`            DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '累计赠送金币',
    `total_refunded`          DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '累计退款金币',
    `total_expired`           DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '累计过期金币',
    `last_transaction_at`     DATETIME      DEFAULT NULL COMMENT '最近一次变动时间',
    `low_balance_alert`       TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '是否启用低余额提醒',
    `low_balance_threshold`   DECIMAL(12,2) NOT NULL DEFAULT 1.00 COMMENT '低余额提醒阈值',
    `version`                 INT           NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
    `created_at`              DATETIME      DEFAULT CURRENT_TIMESTAMP,
    `updated_at`              DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user_balance_user` (`user_id`),
    CONSTRAINT `fk_user_balances_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户金币余额表';

-- ============================================
-- 11. coin_transactions 金币流水表
-- ============================================
CREATE TABLE IF NOT EXISTS `coin_transactions` (
    `id`              CHAR(36)      NOT NULL,
    `tx_no`           VARCHAR(40)   NOT NULL COMMENT '流水号',
    `user_id`         CHAR(36)      NOT NULL,
    `type`            ENUM(
        'recharge','recharge_bonus','redeem','gift','register_gift',
        'consume','refund','adjust_add','adjust_deduct','freeze','unfreeze',
        'forfeit','expire','transfer_in','transfer_out','rollback'
    ) NOT NULL,
    `direction`       ENUM('in','out') NOT NULL,
    `amount`          DECIMAL(12,2) NOT NULL,
    `balance_before`  DECIMAL(12,2) NOT NULL,
    `balance_after`   DECIMAL(12,2) NOT NULL,
    `ref_type`        VARCHAR(30)   NOT NULL DEFAULT 'manual',
    `ref_id`          CHAR(36)      DEFAULT NULL,
    `related_tx_id`   CHAR(36)      DEFAULT NULL,
    `reason_code`     VARCHAR(50)   DEFAULT NULL,
    `description`     VARCHAR(500)  DEFAULT NULL,
    `operator_id`     CHAR(36)      DEFAULT NULL,
    `operator_type`   ENUM('admin','user','system','cron') DEFAULT 'system',
    `reason`          VARCHAR(255)  DEFAULT NULL COMMENT '兼容旧管理端展示',
    `client_ip`       VARCHAR(45)   DEFAULT NULL,
    `user_agent`      TEXT          DEFAULT NULL,
    `metadata`        LONGTEXT      DEFAULT NULL COMMENT '扩展 JSON',
    `request_id`      VARCHAR(50)   DEFAULT NULL,
    `cost_snapshot`   LONGTEXT      DEFAULT NULL COMMENT '费用快照 JSON',
    `is_reversed`     TINYINT(1)    NOT NULL DEFAULT 0,
    `created_at`      DATETIME      DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_tx_no` (`tx_no`),
    KEY `idx_user_time` (`user_id`, `created_at`),
    KEY `idx_type_time` (`type`, `created_at`),
    KEY `idx_direction` (`direction`),
    KEY `idx_operator` (`operator_id`),
    KEY `idx_ref` (`ref_type`, `ref_id`),
    KEY `idx_request` (`request_id`),
    CONSTRAINT `fk_coin_transactions_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='金币流水表';

-- ============================================
-- 12. billing_rules 计费规则表
-- ============================================
CREATE TABLE IF NOT EXISTS `billing_rules` (
    `id`              CHAR(36)      NOT NULL,
    `model_id`        CHAR(36)      NOT NULL,
    `rule_type`       ENUM('fixed','param_tiered') NOT NULL DEFAULT 'fixed',
    `fixed_amount`    DECIMAL(10,4) NOT NULL DEFAULT 0.0000 COMMENT '固定费用（金币）',
    `param_rules`     LONGTEXT      DEFAULT NULL COMMENT '参数差异化规则 JSON',
    `is_active`       TINYINT(1)    NOT NULL DEFAULT 1,
    `created_at`      DATETIME      DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_billing_rule_model` (`model_id`),
    CONSTRAINT `fk_billing_rules_model` FOREIGN KEY (`model_id`)
        REFERENCES `models` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='计费规则表';

-- ============================================
-- 13. generation_records 生成记录表
-- ============================================
CREATE TABLE IF NOT EXISTS `generation_records` (
    `id`                  CHAR(36) NOT NULL,
    `user_id`             CHAR(36) NOT NULL,
    `model_id`            CHAR(36) NOT NULL,
    `channel_id`          CHAR(36) DEFAULT NULL,
    `type`                ENUM('image','video','chat') NOT NULL,
    `status`              ENUM('pending','processing','completed','failed','cancelled') DEFAULT 'pending',
    `input_params`        LONGTEXT NOT NULL COMMENT '输入参数 JSON',
    `prompt_text`         MEDIUMTEXT DEFAULT NULL,
    `result`              LONGTEXT DEFAULT NULL COMMENT '输出结果 JSON',
    `cost_amount`         DECIMAL(12,2) DEFAULT 0.00,
    `cost_breakdown`      LONGTEXT DEFAULT NULL COMMENT '费用明细 JSON',
    `coin_tx_id`          CHAR(36) DEFAULT NULL,
    `refund_tx_id`        CHAR(36) DEFAULT NULL,
    `review_status`       ENUM('pending','pass','review','reject','hidden') DEFAULT 'pending',
    `error_message`       TEXT DEFAULT NULL,
    `duration_ms`         INT DEFAULT NULL,
    `project_id`          CHAR(36) DEFAULT NULL,
    `client_ip`           VARCHAR(45) DEFAULT NULL,
    `user_agent`          TEXT DEFAULT NULL,
    `ua_browser`          VARCHAR(50) DEFAULT NULL,
    `ua_os`               VARCHAR(50) DEFAULT NULL,
    `ua_device`           VARCHAR(50) DEFAULT NULL,
    `device_fingerprint`  VARCHAR(64) DEFAULT NULL,
    `user_group_snapshot` VARCHAR(50) DEFAULT NULL,
    `is_deleted`          TINYINT(1) NOT NULL DEFAULT 0,
    `created_at`          DATETIME DEFAULT CURRENT_TIMESTAMP,
    `completed_at`        DATETIME DEFAULT NULL,

    PRIMARY KEY (`id`),
    KEY `idx_generation_user_status` (`user_id`, `status`, `created_at`),
    KEY `idx_generation_model` (`model_id`),
    KEY `idx_generation_review` (`review_status`, `created_at`),
    KEY `idx_generation_client_ip` (`client_ip`),
    KEY `idx_generation_coin_tx` (`coin_tx_id`),
    CONSTRAINT `fk_generation_records_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_generation_records_model` FOREIGN KEY (`model_id`)
        REFERENCES `models` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='生成记录表';

-- ============================================
-- 14. files 文件表（本地磁盘存储 + 软删除）
-- ============================================
CREATE TABLE IF NOT EXISTS `files` (
    `id`                CHAR(36)     NOT NULL,
    `user_id`           CHAR(36)     NOT NULL,
    `generation_id`     CHAR(36)     DEFAULT NULL,
    `type`              ENUM('upload','generated_image','generated_video','thumbnail') NOT NULL,
    `file_name`         VARCHAR(255) NOT NULL,
    `storage_path`      VARCHAR(500) NOT NULL,
    `file_url`          VARCHAR(500) NOT NULL,
    `file_size`         BIGINT       NOT NULL,
    `mime_type`         VARCHAR(100) NOT NULL,
    `width`             INT          DEFAULT NULL,
    `height`            INT          DEFAULT NULL,
    `duration`          FLOAT        DEFAULT NULL,
    `sha256`            CHAR(64)     DEFAULT NULL,
    `status`            ENUM('active','deleted','quarantined') DEFAULT 'active',
    `deleted_at`        DATETIME     DEFAULT NULL,
    `deleted_by`        CHAR(36)     DEFAULT NULL,
    `deleted_by_type`   ENUM('user','admin','system') DEFAULT NULL,
    `delete_reason`     VARCHAR(255) DEFAULT NULL,
    `related_review_id` CHAR(36)     DEFAULT NULL,
    `created_at`        DATETIME     DEFAULT CURRENT_TIMESTAMP,
    `updated_at`        DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    KEY `idx_file_user_status` (`user_id`, `status`, `created_at`),
    KEY `idx_file_generation` (`generation_id`),
    KEY `idx_file_status` (`status`),
    KEY `idx_file_sha256` (`sha256`),
    KEY `idx_file_deleted` (`deleted_at`, `deleted_by`),
    CONSTRAINT `fk_files_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文件表';

-- ============================================
-- 15. projects 项目表
-- ============================================
CREATE TABLE IF NOT EXISTS `projects` (
    `id`                CHAR(36)     NOT NULL,
    `user_id`           CHAR(36)     NOT NULL,
    `name`              VARCHAR(200) NOT NULL,
    `description`       TEXT         DEFAULT NULL,
    `canvas_data`       LONGTEXT     NOT NULL COMMENT '画布 JSON：nodes + edges + viewport',
    `thumbnail_file_id` CHAR(36)     DEFAULT NULL,
    `node_count`        INT          DEFAULT 0,
    `is_public`         TINYINT(1)   DEFAULT 0,
    `created_at`        DATETIME     DEFAULT CURRENT_TIMESTAMP,
    `updated_at`        DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    KEY `idx_project_user_time` (`user_id`, `updated_at`),
    CONSTRAINT `fk_projects_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='项目表';

-- ============================================
-- 16. system_settings 系统设置表
-- ============================================
CREATE TABLE IF NOT EXISTS `system_settings` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT,
    `key`         VARCHAR(100) NOT NULL,
    `value`       MEDIUMTEXT   DEFAULT NULL,
    `value_type`  ENUM('string','number','boolean','json','secret') DEFAULT 'string',
    `category`    ENUM('site','registration','billing','model','storage','security','email','risk','content') DEFAULT 'site',
    `description` VARCHAR(255) DEFAULT NULL,
    `is_public`   TINYINT(1)   DEFAULT 0,
    `is_editable` TINYINT(1)   DEFAULT 1,
    `updated_by`  CHAR(36)     DEFAULT NULL,
    `created_at`  DATETIME     DEFAULT CURRENT_TIMESTAMP,
    `updated_at`  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_system_setting_key` (`key`),
    KEY `idx_system_setting_category` (`category`),
    KEY `idx_system_setting_public` (`is_public`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统设置表';

INSERT INTO `system_settings` (`key`, `value`, `value_type`, `category`, `description`, `is_public`, `is_editable`)
VALUES
('site.name', 'Doodle Canvas', 'string', 'site', '站点名称', 1, 1),
('registration.gift_coins', '100', 'number', 'registration', '注册邮箱验证赠送金币', 0, 1),
('billing.new_user_balance', '10', 'number', 'billing', '新用户初始金币', 0, 1),
('billing.coin_exchange_rate', '1.0', 'number', 'billing', '金币兑换汇率', 0, 1),
('storage.root', 'server/storage', 'string', 'storage', '本地存储根目录', 0, 1),
('storage.base_url', '/storage', 'string', 'storage', '文件访问基础 URL', 1, 1),
('storage.soft_delete_retain_days', '90', 'number', 'storage', '软删除文件保留天数', 0, 1)
ON DUPLICATE KEY UPDATE
    `description` = VALUES(`description`);

-- ============================================
-- 17. announcements 公告表
-- ============================================
CREATE TABLE IF NOT EXISTS `announcements` (
    `id`           CHAR(36)      NOT NULL,
    `title`        VARCHAR(200)  NOT NULL,
    `content`      LONGTEXT      NOT NULL,
    `status`       ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
    `priority`     INT           NOT NULL DEFAULT 0,
    `published_at` DATETIME      DEFAULT NULL,
    `created_by`   CHAR(36)      DEFAULT NULL,
    `created_at`   DATETIME      DEFAULT CURRENT_TIMESTAMP,
    `updated_at`   DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    KEY `idx_announcement_status_time` (`status`, `published_at`, `priority`),
    KEY `idx_announcement_creator` (`created_by`),
    CONSTRAINT `fk_announcements_creator` FOREIGN KEY (`created_by`)
        REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='公告表';

-- ============================================
-- 18. error_logs 错误日志表
-- ============================================
CREATE TABLE IF NOT EXISTS `error_logs` (
    `id`             CHAR(36) NOT NULL,
    `request_id`     VARCHAR(64) DEFAULT NULL,
    `level`          ENUM('error','warn','info') NOT NULL DEFAULT 'error',
    `scope`          VARCHAR(100) DEFAULT NULL,
    `code`           INT DEFAULT NULL,
    `http_status`    INT DEFAULT NULL,
    `method`         VARCHAR(10) DEFAULT NULL,
    `path`           VARCHAR(500) DEFAULT NULL,
    `user_id`        CHAR(36) DEFAULT NULL,
    `client_ip`      VARCHAR(45) DEFAULT NULL,
    `user_agent`     TEXT DEFAULT NULL,
    `message`        TEXT NOT NULL,
    `public_message` VARCHAR(255) DEFAULT NULL,
    `stack`          LONGTEXT DEFAULT NULL,
    `details`        LONGTEXT DEFAULT NULL,
    `is_resolved`    TINYINT(1) NOT NULL DEFAULT 0,
    `resolved_at`    DATETIME DEFAULT NULL,
    `created_at`     DATETIME DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    KEY `idx_error_logs_created` (`created_at`),
    KEY `idx_error_logs_scope_level` (`scope`, `level`, `created_at`),
    KEY `idx_error_logs_request` (`request_id`),
    KEY `idx_error_logs_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='错误日志表';

-- ============================================
-- 19. migrate_imports 迁移导入映射表
-- ============================================
CREATE TABLE IF NOT EXISTS `migrate_imports` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT,
    `user_id`     CHAR(36)     NOT NULL,
    `client_id`   VARCHAR(100) NOT NULL,
    `project_id`  CHAR(36)     NOT NULL,
    `imported_at` DATETIME     DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_migrate_user_client` (`user_id`, `client_id`),
    CONSTRAINT `fk_migrate_imports_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_migrate_imports_project` FOREIGN KEY (`project_id`)
        REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='迁移导入映射表';
