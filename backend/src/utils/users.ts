import { RowDataPacket } from 'mysql2';
import pool from '../config/db';

let usersActiveColumnChecked = false;
let usersPendingWorkerColumnChecked = false;
let usersPhoneNullableChecked = false;

export const ensureUsersActiveColumn = async (): Promise<void> => {
  if (usersActiveColumnChecked) return;

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
