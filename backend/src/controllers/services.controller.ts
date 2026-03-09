import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';

export const getActiveServices = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_service, name, description, icon FROM services WHERE is_active = 1 ORDER BY name ASC`
    );
    res.json({ success: true, services: rows });
  } catch (error: any) {
    console.error('Error in getActiveServices:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
