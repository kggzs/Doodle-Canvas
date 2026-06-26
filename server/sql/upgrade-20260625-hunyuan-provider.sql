-- ============================================
-- Doodle-Canvas 混元(Hunyuan)提供商升级脚本
-- 日期：2026-06-25
-- 用途：
--   在 model_channels 表 provider_type ENUM 中增加 'hunyuan'
--   以支持腾讯混元图片生成能力。
--
-- 适用场景：
--   已有存量数据库（已部署过 init.sql 或旧版本）的增量升级。
--
-- 执行方式：
--   mysql -u root -p canvas < server/sql/upgrade-20260625-hunyuan-provider.sql
--
-- 或登录 MySQL 后执行：
--   source server/sql/upgrade-20260625-hunyuan-provider.sql
-- ============================================

-- Step 1: 更新 model_channels 表 provider_type 枚举，加入 hunyuan
-- 使用 MODIFY COLUMN 重新定义 ENUM（MySQL 追加 ENUM 值为快速操作，不重建表）
-- 先检查当前定义是否已包含 hunyuan，防止重复执行报错

SET @has_hunyuan = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'model_channels'
    AND COLUMN_NAME = 'provider_type'
    AND COLUMN_TYPE LIKE '%hunyuan%'
);

SET @sql = IF(
  @has_hunyuan = 0,
  "ALTER TABLE `model_channels`
   MODIFY COLUMN `provider_type`
   ENUM('openai','aliyun','doubao','stepfun','agnes','hunyuan','custom')
   NOT NULL COMMENT '适配器类型'",
  'SELECT 1 AS status'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 2: 如果通过 JS 脚本 upgrade-core-features.js 更新过，也需要同步
-- 使用相同方式更新，不会重复执行（已通过上一步的检查保障）

-- 完成提示
SELECT 'upgrade-20260625-hunyuan-provider.sql completed successfully' AS result;