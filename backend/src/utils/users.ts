import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { shouldRunRuntimeSchemaSync } from '../config/schemaSync';
import { isDatabaseSchemaReady } from '../services/schemaState.service';

let usersActiveColumnChecked = false;
let usersPendingWorkerColumnChecked = false;
let usersPhoneNullableChecked = false;
let usersLoginSecurityColumnsChecked = false;

export const ensureUsersActiveColumn = async (): Promise<void> => {
  if (usersActiveColumnChecked) return;
  if (isDatabaseSchemaReady()) {
    usersActiveColumnChecked = true;
    return;
  }
  if (!shouldRunRuntimeSchemaSync()) {
    usersActiveColumnChecked = true;
    return;
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) as total
     FROM information_schema.COLUMNS
     WHERE table_schema = DATABASE()
       AND table_name = 'users'
       AND column_name = 'is_active'`
  );

  const total = Number(rows[0]?.total || 0);
  if (total === 0) {
    await pool.execute(`ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1`);
  }

  usersActiveColumnChecked = true;
};

export const ensureUsersPendingWorkerColumn = async (): Promise<void> => {
  if (usersPendingWorkerColumnChecked) return;
  if (isDatabaseSchemaReady()) {
    usersPendingWorkerColumnChecked = true;
    return;
  }
  if (!shouldRunRuntimeSchemaSync()) {
    usersPendingWorkerColumnChecked = true;
    return;
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) as total
     FROM information_schema.COLUMNS
     WHERE table_schema = DATABASE()
       AND table_name = 'users'
       AND column_name = 'pending_worker'`
  );

  const total = Number(rows[0]?.total || 0);
  if (total === 0) {
    await pool.execute(`ALTER TABLE users ADD COLUMN pending_worker TINYINT(1) NOT NULL DEFAULT 0`);
  }

  usersPendingWorkerColumnChecked = true;
};

export const ensureUsersPhoneNumberNullable = async (): Promise<void> => {
  if (usersPhoneNullableChecked) return;
  if (isDatabaseSchemaReady()) {
    usersPhoneNullableChecked = true;
    return;
  }
  if (!shouldRunRuntimeSchemaSync()) {
    usersPhoneNullableChecked = true;
    return;
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT IS_NULLABLE as isNullable
     FROM information_schema.COLUMNS
     WHERE table_schema = DATABASE()
       AND table_name = 'users'
       AND column_name = 'phone_number'
     LIMIT 1`
  );

  const isNullable = String(rows[0]?.isNullable || '').toUpperCase();
  if (isNullable === 'NO') {
    await pool.execute(`ALTER TABLE users MODIFY COLUMN phone_number VARCHAR(50) NULL`);
  }

  usersPhoneNullableChecked = true;
};

export const ensureUsersLoginSecurityColumns = async (): Promise<void> => {
  if (usersLoginSecurityColumnsChecked) return;
  if (isDatabaseSchemaReady()) {
    usersLoginSecurityColumnsChecked = true;
    return;
  }
  if (!shouldRunRuntimeSchemaSync()) {
    usersLoginSecurityColumnsChecked = true;
    return;
  }

  // failed_login_attempts
  const [attemptsRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) as total
     FROM information_schema.COLUMNS
     WHERE table_schema = DATABASE()
       AND table_name = 'users'
       AND column_name = 'failed_login_attempts'`
  );
  if (Number(attemptsRows[0]?.total || 0) === 0) {
    await pool.execute(
      `ALTER TABLE users ADD COLUMN failed_login_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0`
    );
  }

  // locked_until
  const [lockedRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) as total
     FROM information_schema.COLUMNS
     WHERE table_schema = DATABASE()
       AND table_name = 'users'
       AND column_name = 'locked_until'`
  );
  if (Number(lockedRows[0]?.total || 0) === 0) {
    await pool.execute(
      `ALTER TABLE users ADD COLUMN locked_until DATETIME NULL DEFAULT NULL`
    );
  }

  usersLoginSecurityColumnsChecked = true;
};
