// -*- coding: utf-8 -*-
/**
 * 存量数据库核心功能升级脚本
 * 用法：node src/scripts/upgrade-core-features.js
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const dbName = process.env.DB_NAME || 'canvas';

const connection = await mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'canvas',
  password: process.env.DB_PASS || '',
  database: dbName,
  multipleStatements: true
});

async function hasColumn(table, column) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return Number(rows[0]?.count || 0) > 0;
}

async function addColumn(table, column, ddl) {
  if (await hasColumn(table, column)) return;
  await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  console.log(`added ${table}.${column}`);
}

async function tableExists(table) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, table]
  );
  return Number(rows[0]?.count || 0) > 0;
}

async function run() {
  await addColumn('user_balances', 'coins_frozen', "`coins_frozen` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '冻结金币' AFTER `balance`");
  await addColumn('user_balances', 'total_recharged', "`total_recharged` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '累计充值金币' AFTER `coins_frozen`");
  await addColumn('user_balances', 'total_gifted', "`total_gifted` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '累计赠送金币' AFTER `total_recharged`");
  await addColumn('user_balances', 'total_expired', "`total_expired` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '累计过期金币' AFTER `total_refunded`");
  await addColumn('user_balances', 'last_transaction_at', "`last_transaction_at` DATETIME DEFAULT NULL COMMENT '最近一次变动时间' AFTER `total_expired`");
  await addColumn('user_balances', 'low_balance_alert', "`low_balance_alert` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用低余额提醒' AFTER `last_transaction_at`");
  await addColumn('user_balances', 'low_balance_threshold', "`low_balance_threshold` DECIMAL(12,2) NOT NULL DEFAULT 1.00 COMMENT '低余额提醒阈值' AFTER `low_balance_alert`");

  if (await hasColumn('user_balances', 'total_recharge')) {
    await connection.query('UPDATE `user_balances` SET `total_recharged` = GREATEST(`total_recharged`, IFNULL(`total_recharge`, 0))');
  }
  if (await hasColumn('user_balances', 'total_gift')) {
    await connection.query('UPDATE `user_balances` SET `total_gifted` = GREATEST(`total_gifted`, IFNULL(`total_gift`, 0))');
  }

  await connection.query(`
    ALTER TABLE \`coin_transactions\`
    MODIFY COLUMN \`type\` ENUM(
      'recharge','recharge_bonus','redeem','gift','register_gift','adjust',
      'consume','refund','adjust_add','adjust_deduct','freeze','unfreeze',
      'forfeit','expire','transfer_in','transfer_out','rollback'
    ) NOT NULL,
    MODIFY COLUMN \`operator_type\` ENUM('admin','user','system','cron') DEFAULT 'system'
  `);
  await addColumn('coin_transactions', 'tx_no', "`tx_no` VARCHAR(40) DEFAULT NULL COMMENT '流水号' AFTER `id`");
  await addColumn('coin_transactions', 'related_tx_id', '`related_tx_id` CHAR(36) DEFAULT NULL AFTER `ref_id`');
  await addColumn('coin_transactions', 'reason_code', '`reason_code` VARCHAR(50) DEFAULT NULL AFTER `related_tx_id`');
  await addColumn('coin_transactions', 'description', '`description` VARCHAR(500) DEFAULT NULL AFTER `reason_code`');
  await addColumn('coin_transactions', 'client_ip', '`client_ip` VARCHAR(45) DEFAULT NULL AFTER `reason`');
  await addColumn('coin_transactions', 'user_agent', '`user_agent` TEXT DEFAULT NULL AFTER `client_ip`');
  await addColumn('coin_transactions', 'cost_snapshot', "`cost_snapshot` LONGTEXT DEFAULT NULL COMMENT '费用快照 JSON' AFTER `request_id`");
  await addColumn('coin_transactions', 'is_reversed', '`is_reversed` TINYINT(1) NOT NULL DEFAULT 0 AFTER `cost_snapshot`');

  await connection.query(`
    UPDATE \`coin_transactions\`
    SET
      \`type\` = CASE
        WHEN \`type\` = 'adjust' AND \`direction\` = 'in' THEN 'adjust_add'
        WHEN \`type\` = 'adjust' AND \`direction\` = 'out' THEN 'adjust_deduct'
        ELSE \`type\`
      END,
      \`tx_no\` = IFNULL(\`tx_no\`, CONCAT('T', UPPER(REPLACE(UUID(), '-', '')))),
      \`description\` = IFNULL(\`description\`, \`reason\`)
    WHERE \`tx_no\` IS NULL OR \`description\` IS NULL OR \`type\` = 'adjust'
  `);
  await connection.query(`
    ALTER TABLE \`coin_transactions\`
    MODIFY COLUMN \`type\` ENUM(
      'recharge','recharge_bonus','redeem','gift','register_gift',
      'consume','refund','adjust_add','adjust_deduct','freeze','unfreeze',
      'forfeit','expire','transfer_in','transfer_out','rollback'
    ) NOT NULL,
    MODIFY COLUMN \`tx_no\` VARCHAR(40) NOT NULL COMMENT '流水号',
    MODIFY COLUMN \`ref_type\` VARCHAR(30) NOT NULL DEFAULT 'manual'
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`billing_rules\` (
      \`id\` CHAR(36) NOT NULL,
      \`model_id\` CHAR(36) NOT NULL,
      \`rule_type\` ENUM('fixed','param_tiered') NOT NULL DEFAULT 'fixed',
      \`fixed_amount\` DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
      \`param_rules\` LONGTEXT DEFAULT NULL,
      \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
      \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uk_billing_rule_model\` (\`model_id\`),
      CONSTRAINT \`fk_billing_rules_model\` FOREIGN KEY (\`model_id\`) REFERENCES \`models\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='计费规则表'
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`generation_records\` (
      \`id\` CHAR(36) NOT NULL,
      \`user_id\` CHAR(36) NOT NULL,
      \`model_id\` CHAR(36) NOT NULL,
      \`channel_id\` CHAR(36) DEFAULT NULL,
      \`type\` ENUM('image','video','chat') NOT NULL,
      \`status\` ENUM('pending','processing','completed','failed','cancelled') DEFAULT 'pending',
      \`input_params\` LONGTEXT NOT NULL,
      \`prompt_text\` MEDIUMTEXT DEFAULT NULL,
      \`result\` LONGTEXT DEFAULT NULL,
      \`cost_amount\` DECIMAL(12,2) DEFAULT 0.00,
      \`cost_breakdown\` LONGTEXT DEFAULT NULL,
      \`coin_tx_id\` CHAR(36) DEFAULT NULL,
      \`refund_tx_id\` CHAR(36) DEFAULT NULL,
      \`review_status\` ENUM('pending','pass','review','reject','hidden') DEFAULT 'pending',
      \`error_message\` TEXT DEFAULT NULL,
      \`duration_ms\` INT DEFAULT NULL,
      \`project_id\` CHAR(36) DEFAULT NULL,
      \`client_ip\` VARCHAR(45) DEFAULT NULL,
      \`user_agent\` TEXT DEFAULT NULL,
      \`ua_browser\` VARCHAR(50) DEFAULT NULL,
      \`ua_os\` VARCHAR(50) DEFAULT NULL,
      \`ua_device\` VARCHAR(50) DEFAULT NULL,
      \`device_fingerprint\` VARCHAR(64) DEFAULT NULL,
      \`user_group_snapshot\` VARCHAR(50) DEFAULT NULL,
      \`is_deleted\` TINYINT(1) NOT NULL DEFAULT 0,
      \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      \`completed_at\` DATETIME DEFAULT NULL,
      PRIMARY KEY (\`id\`),
      KEY \`idx_generation_user_status\` (\`user_id\`, \`status\`, \`created_at\`),
      KEY \`idx_generation_model\` (\`model_id\`),
      KEY \`idx_generation_review\` (\`review_status\`, \`created_at\`),
      KEY \`idx_generation_client_ip\` (\`client_ip\`),
      KEY \`idx_generation_coin_tx\` (\`coin_tx_id\`),
      CONSTRAINT \`fk_generation_records_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`fk_generation_records_model\` FOREIGN KEY (\`model_id\`) REFERENCES \`models\` (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='生成记录表'
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`files\` (
      \`id\` CHAR(36) NOT NULL,
      \`user_id\` CHAR(36) NOT NULL,
      \`generation_id\` CHAR(36) DEFAULT NULL,
      \`type\` ENUM('upload','generated_image','generated_video','thumbnail') NOT NULL,
      \`file_name\` VARCHAR(255) NOT NULL,
      \`storage_path\` VARCHAR(500) NOT NULL,
      \`file_url\` VARCHAR(500) NOT NULL,
      \`file_size\` BIGINT NOT NULL,
      \`mime_type\` VARCHAR(100) NOT NULL,
      \`width\` INT DEFAULT NULL,
      \`height\` INT DEFAULT NULL,
      \`duration\` FLOAT DEFAULT NULL,
      \`sha256\` CHAR(64) DEFAULT NULL,
      \`status\` ENUM('active','deleted','quarantined') DEFAULT 'active',
      \`deleted_at\` DATETIME DEFAULT NULL,
      \`deleted_by\` CHAR(36) DEFAULT NULL,
      \`deleted_by_type\` ENUM('user','admin','system') DEFAULT NULL,
      \`delete_reason\` VARCHAR(255) DEFAULT NULL,
      \`related_review_id\` CHAR(36) DEFAULT NULL,
      \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`idx_file_user_status\` (\`user_id\`, \`status\`, \`created_at\`),
      KEY \`idx_file_generation\` (\`generation_id\`),
      KEY \`idx_file_status\` (\`status\`),
      KEY \`idx_file_sha256\` (\`sha256\`),
      KEY \`idx_file_deleted\` (\`deleted_at\`, \`deleted_by\`),
      CONSTRAINT \`fk_files_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文件表'
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`projects\` (
      \`id\` CHAR(36) NOT NULL,
      \`user_id\` CHAR(36) NOT NULL,
      \`name\` VARCHAR(200) NOT NULL,
      \`description\` TEXT DEFAULT NULL,
      \`canvas_data\` LONGTEXT NOT NULL,
      \`thumbnail_file_id\` CHAR(36) DEFAULT NULL,
      \`node_count\` INT DEFAULT 0,
      \`is_public\` TINYINT(1) DEFAULT 0,
      \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`idx_project_user_time\` (\`user_id\`, \`updated_at\`),
      CONSTRAINT \`fk_projects_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='项目表'
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`system_settings\` (
      \`id\` BIGINT NOT NULL AUTO_INCREMENT,
      \`key\` VARCHAR(100) NOT NULL,
      \`value\` MEDIUMTEXT DEFAULT NULL,
      \`value_type\` ENUM('string','number','boolean','json','secret') DEFAULT 'string',
      \`category\` ENUM('site','registration','billing','model','storage','security','email','risk','content') DEFAULT 'site',
      \`description\` VARCHAR(255) DEFAULT NULL,
      \`is_public\` TINYINT(1) DEFAULT 0,
      \`is_editable\` TINYINT(1) DEFAULT 1,
      \`updated_by\` CHAR(36) DEFAULT NULL,
      \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uk_system_setting_key\` (\`key\`),
      KEY \`idx_system_setting_category\` (\`category\`),
      KEY \`idx_system_setting_public\` (\`is_public\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统设置表'
  `);

  if (!(await tableExists('migrate_imports'))) {
    await connection.query(`
      CREATE TABLE \`migrate_imports\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`user_id\` CHAR(36) NOT NULL,
        \`client_id\` VARCHAR(100) NOT NULL,
        \`project_id\` CHAR(36) NOT NULL,
        \`imported_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_migrate_user_client\` (\`user_id\`, \`client_id\`),
        CONSTRAINT \`fk_migrate_imports_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_migrate_imports_project\` FOREIGN KEY (\`project_id\`) REFERENCES \`projects\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='迁移导入映射表'
    `);
  }

  console.log('core feature upgrade ok');
}

try {
  await run();
} finally {
  await connection.end();
}
