-- ============================================
-- Doodle-Canvas 数据库初始化脚本
-- 引擎：MySQL InnoDB
-- 字符集：utf8mb4 / 排序规则：utf8mb4_unicode_ci
-- 说明：本脚本包含认证相关 4 张表（users / refresh_tokens / email_verifications / login_logs）
--       其他业务表（用户组、计费、文件、生成记录、审计等）将在后续 Task 中补充
-- ============================================

-- 数据库创建
CREATE DATABASE IF NOT EXISTS `doodle_canvas`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `doodle_canvas`;

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
    `email`                 VARCHAR(255) NOT NULL,
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
    `risk_tags`             JSON         DEFAULT NULL COMMENT '风险标签数组（如 ["刷量","异地登录"]）',
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
    `token_hash`      VARCHAR(255) NOT NULL COMMENT '令牌哈希（SHA-256）',
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
    `email`               VARCHAR(255) NOT NULL COMMENT '待认证邮箱（也用于注册前预校验）',
    `code`                VARCHAR(10)  DEFAULT NULL COMMENT '6 位验证码（bcrypt 存储，code 模式）',
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
    `email_or_username`   VARCHAR(255) DEFAULT NULL COMMENT '登录账号输入值（脱敏存储）',
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
