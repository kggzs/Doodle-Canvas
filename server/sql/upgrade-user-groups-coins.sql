-- -*- coding: utf-8 -*-
-- 用户组与金币系统升级脚本
-- 适用于已经执行过 server/sql/init.sql 的旧数据库，可重复执行。

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

CREATE TABLE IF NOT EXISTS `user_balances` (
    `id`              CHAR(36)      NOT NULL,
    `user_id`         CHAR(36)      NOT NULL,
    `balance`         DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '当前可用金币余额',
    `total_recharge`  DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '累计充值金币',
    `total_gift`      DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '累计赠送金币',
    `total_consumed`  DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '累计消费金币',
    `total_refunded`  DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '累计退款金币',
    `version`         INT           NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
    `created_at`      DATETIME      DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user_balance_user` (`user_id`),
    CONSTRAINT `fk_user_balances_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户金币余额表';

CREATE TABLE IF NOT EXISTS `coin_transactions` (
    `id`              CHAR(36)      NOT NULL,
    `user_id`         CHAR(36)      NOT NULL,
    `type`            ENUM('recharge','gift','consume','refund','adjust','freeze','unfreeze','expire') NOT NULL,
    `direction`       ENUM('in','out') NOT NULL,
    `amount`          DECIMAL(12,2) NOT NULL,
    `balance_before`  DECIMAL(12,2) NOT NULL,
    `balance_after`   DECIMAL(12,2) NOT NULL,
    `ref_type`        VARCHAR(40)   DEFAULT NULL,
    `ref_id`          CHAR(36)      DEFAULT NULL,
    `operator_id`     CHAR(36)      DEFAULT NULL,
    `operator_type`   ENUM('admin','user','system') DEFAULT 'admin',
    `reason`          VARCHAR(255)  DEFAULT NULL,
    `metadata`        LONGTEXT      DEFAULT NULL COMMENT '扩展 JSON',
    `request_id`      VARCHAR(50)   DEFAULT NULL,
    `created_at`      DATETIME      DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    KEY `idx_user_time` (`user_id`, `created_at`),
    KEY `idx_type_time` (`type`, `created_at`),
    KEY `idx_operator` (`operator_id`),
    KEY `idx_ref` (`ref_type`, `ref_id`),
    CONSTRAINT `fk_coin_transactions_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='金币流水表';
