-- ============================================
-- Doodle-Canvas 2026-06-21 功能升级脚本
-- 适用：已部署过旧版 server/sql/init.sql 的存量数据库。
-- 内容：
--   1. 新增 announcements 公告表
--   2. 清理历史用户组多分配数据，使每个用户只保留一个用户组
-- ============================================

USE `canvas`;

-- 1. 公告表
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

-- 2. 历史用户组数据清理
-- 新代码分配用户组时会自动替换旧组。这里将已有多组用户清理为一组：
-- 优先保留 joined_at 最新的记录；同一时间下保留 id 较大的记录。
CREATE TEMPORARY TABLE IF NOT EXISTS `tmp_user_group_member_keep` (
    `user_id` CHAR(36) NOT NULL PRIMARY KEY,
    `keep_id` CHAR(36) NOT NULL
) ENGINE=Memory;

TRUNCATE TABLE `tmp_user_group_member_keep`;

INSERT INTO `tmp_user_group_member_keep` (`user_id`, `keep_id`)
SELECT m.`user_id`, MAX(m.`id`) AS `keep_id`
FROM `user_group_members` m
JOIN (
    SELECT `user_id`, MAX(`joined_at`) AS `joined_at`
    FROM `user_group_members`
    GROUP BY `user_id`
) latest
    ON latest.`user_id` = m.`user_id`
    AND latest.`joined_at` = m.`joined_at`
GROUP BY m.`user_id`;

DELETE m
FROM `user_group_members` m
JOIN `tmp_user_group_member_keep` k ON k.`user_id` = m.`user_id`
WHERE m.`id` <> k.`keep_id`;

UPDATE `users` u
LEFT JOIN `user_group_members` m ON m.`user_id` = u.`id`
SET u.`user_group_id` = m.`group_id`;

DROP TEMPORARY TABLE IF EXISTS `tmp_user_group_member_keep`;
