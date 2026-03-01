import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import pool from '../config/db';

export const uploadDocuments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (!files || !files.dui_document) {
      res.status(400).json({ error: 'DUI Document is required for verification' });
      return;
    }

    if (!files.cert_document || files.cert_document.length === 0) {
      res.status(400).json({ error: 'Certification document is required for verification' });
      return;
    }

    const duiPath = files.dui_document[0].filename;
    const certPath = files.cert_document && files.cert_document.length > 0 ? files.cert_document[0].filename : null;
    
    await pool.execute(
      `UPDATE worker_profiles 
       SET dui_document = ?, cert_document = ?
       WHERE id_user = ?`,
      [duiPath, certPath, userId]
    );

    res.json({
      success: true,
      message: 'Documents uploaded successfully. Pending verification.',
      dui_path: duiPath,
      cert_path: certPath
    });

  } catch (error: any) {
    console.error('Error uploading documents:', error);
    res.status(500).json({ error: 'Error processing files' });
  }
};