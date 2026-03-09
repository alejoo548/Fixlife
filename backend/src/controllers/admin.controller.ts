import { Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { AuthRequest } from '../middlewares/auth.middleware';

// ─── Services CRUD ───────────────────────────────────────────────────────────

export const createService = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, description, icon } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Service name is required.' });
      return;
    }

    const trimmedName = name.trim().slice(0, 100);
    const trimmedDesc = description ? String(description).trim().slice(0, 500) : null;
    const trimmedIcon = icon ? String(icon).trim().slice(0, 255) : null;

    // Check duplicate name
    const [existing] = await pool.execute<RowDataPacket[]>(
      `SELECT id_service FROM services WHERE LOWER(name) = LOWER(?) LIMIT 1`,
      [trimmedName]
    );

    if (existing.length > 0) {
      res.status(400).json({ error: 'A service with this name already exists.' });
      return;
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO services (name, description, icon, is_active) VALUES (?, ?, ?, 1)`,
      [trimmedName, trimmedDesc, trimmedIcon]
    );

    res.status(201).json({
      success: true,
      message: 'Service created successfully.',
      service: {
        id_service: result.insertId,
        name: trimmedName,
        description: trimmedDesc,
        icon: trimmedIcon,
        is_active: true,
      },
    });
  } catch (error: any) {
    console.error('Error in createService:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

type HeroSlideRow = RowDataPacket & {
  id_slide: number;
  sort_order: number;
  image_url: string;
  tag: string;
  title: string;
  description: string;
  cta: string;
};

let heroSlidesTableChecked = false;

const ensureHeroSlidesTable = async () => {
  if (heroSlidesTableChecked) return;

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS hero_slides (
      id_slide INT NOT NULL AUTO_INCREMENT,
      sort_order INT NOT NULL,
      image_url VARCHAR(255) NOT NULL,
      tag VARCHAR(50) NOT NULL,
      title VARCHAR(120) NOT NULL,
      description VARCHAR(255) NOT NULL,
      cta VARCHAR(80) NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_slide),
      UNIQUE KEY ux_hero_slides_sort (sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM hero_slides`
  );
  const total = Number(rows[0]?.total || 0);

  if (total === 0) {
    await pool.execute(
      `INSERT INTO hero_slides (sort_order, image_url, tag, title, description, cta)
       VALUES
       (1, ?, ?, ?, ?, ?),
       (2, ?, ?, ?, ?, ?),
       (3, ?, ?, ?, ?, ?)`,
      [
        'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?q=80&w=2070&auto=format&fit=crop',
        'PREMIUM',
        'Home Experts',
        'Find certified electricians, plumbers, and technicians ready to solve any problem.',
        'Find Technician',
        'https://images.unsplash.com/photo-1581578731117-10d52b43cc0a?q=80&w=2070&auto=format&fit=crop',
        'RENOVATION',
        'Transform Your Space',
        'From a fresh coat of paint to complete remodels. Make your dream home a reality.',
        'Get a Quote',
        'https://images.unsplash.com/photo-1556911220-bff31c812dba?q=80&w=2668&auto=format&fit=crop',
        'CLEANING',
        'Spotless Homes',
        'Deep cleaning and regular maintenance services so you can enjoy your free time.',
        'Book Cleaning',
      ]
    );
  }

  heroSlidesTableChecked = true;
};

const toSlidesDto = (rows: HeroSlideRow[]) =>
  rows.map((row) => ({
    id: Number(row.id_slide),
    image: row.image_url,
    tag: row.tag,
    title: row.title,
    description: row.description,
    cta: row.cta,
  }));

export const getHeroSlidesPublic = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureHeroSlidesTable();
    const [rows] = await pool.execute<HeroSlideRow[]>(
      `SELECT id_slide, sort_order, image_url, tag, title, description, cta
       FROM hero_slides
       ORDER BY sort_order ASC`
    );
    res.json({ success: true, slides: toSlidesDto(rows) });
  } catch (error) {
    console.error('Error in getHeroSlidesPublic:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAllServices = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_service, name, description, icon, is_active, created_at FROM services ORDER BY created_at DESC`
    );
    res.json({ success: true, services: rows });
  } catch (error: any) {
    console.error('Error in getAllServices:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateService = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const idService = Number(req.params.id);
    if (!idService || isNaN(idService)) {
      res.status(400).json({ error: 'Invalid service ID.' });
      return;
    }

    const { name, description, icon, is_active } = req.body;
    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) {
      const trimmedName = String(name).trim().slice(0, 100);
      if (trimmedName.length === 0) {
        res.status(400).json({ error: 'Service name cannot be empty.' });
        return;
      }
      // Check duplicate name (excluding current)
      const [existing] = await pool.execute<RowDataPacket[]>(
        `SELECT id_service FROM services WHERE LOWER(name) = LOWER(?) AND id_service != ? LIMIT 1`,
        [trimmedName, idService]
      );
      if (existing.length > 0) {
        res.status(400).json({ error: 'A service with this name already exists.' });
        return;
      }
      updates.push('name = ?');
      values.push(trimmedName);
    }

    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description ? String(description).trim().slice(0, 500) : null);
    }

    if (icon !== undefined) {
      updates.push('icon = ?');
      values.push(icon ? String(icon).trim().slice(0, 255) : null);
    }

    if (is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(is_active ? 1 : 0);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update.' });
      return;
    }

    values.push(idService);
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE services SET ${updates.join(', ')} WHERE id_service = ?`,
      values
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Service not found.' });
      return;
    }

    res.json({ success: true, message: 'Service updated successfully.' });
  } catch (error: any) {
    console.error('Error in updateService:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteService = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const idService = Number(req.params.id);
    if (!idService || isNaN(idService)) {
      res.status(400).json({ error: 'Invalid service ID.' });
      return;
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `DELETE FROM services WHERE id_service = ?`,
      [idService]
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Service not found.' });
      return;
    }

    res.json({ success: true, message: 'Service deleted successfully.' });
  } catch (error: any) {
    console.error('Error in deleteService:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Worker Approval ─────────────────────────────────────────────────────────

export const getPendingWorkers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT 
        u.id_user, u.name, u.lastname, u.email, u.phone_number, u.username, u.profile_image, u.created_at,
        wp.id_worker_profile, wp.bio, wp.dui_document, wp.cert_document, wp.is_verified
       FROM users u
       INNER JOIN worker_profiles wp ON wp.id_user = u.id_user
       WHERE u.rol = 'worker'
         AND u.verification_token IS NULL
         AND wp.is_verified = 0
       ORDER BY u.created_at DESC`
    );

    // Also fetch selected services for each worker
    const workersWithServices = await Promise.all(
      rows.map(async (worker) => {
        const [services] = await pool.execute<RowDataPacket[]>(
          `SELECT s.id_service, s.name
           FROM worker_services ws
           INNER JOIN services s ON s.id_service = ws.id_service
           WHERE ws.id_worker_profile = ?`,
          [worker.id_worker_profile]
        );
        return { ...worker, services };
      })
    );

    // Build document URLs
    const buildUrl = (fileName: string | null) => {
      if (!fileName) return null;
      const protocol = req.protocol;
      const host = req.get('host');
      return `${protocol}://${host}/uploads/${encodeURIComponent(fileName)}`;
    };

    const result = workersWithServices.map((w: any) => ({
      ...w,
      dui_document_url: buildUrl(w.dui_document),
      cert_document_url: buildUrl(w.cert_document),
    }));

    res.json({ success: true, workers: result });
  } catch (error: any) {
    console.error('Error in getPendingWorkers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const approveWorker = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = Number(req.params.id);
    if (!userId || isNaN(userId)) {
      res.status(400).json({ error: 'Invalid user ID.' });
      return;
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE worker_profiles SET is_verified = 1 WHERE id_user = ? AND is_verified = 0`,
      [userId]
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Worker not found or already processed.' });
      return;
    }

    res.json({ success: true, message: 'Worker approved successfully.' });
  } catch (error: any) {
    console.error('Error in approveWorker:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const rejectWorker = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = Number(req.params.id);
    if (!userId || isNaN(userId)) {
      res.status(400).json({ error: 'Invalid user ID.' });
      return;
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE worker_profiles SET is_verified = 2 WHERE id_user = ? AND is_verified = 0`,
      [userId]
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Worker not found or already processed.' });
      return;
    }

    res.json({ success: true, message: 'Worker rejected successfully.' });
  } catch (error: any) {
    console.error('Error in rejectWorker:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export const getDashboardStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [[{ total_services }]] = await pool.execute<RowDataPacket[]>(`SELECT COUNT(*) as total_services FROM services`);
    
    const [[{ total_pros }]] = await pool.execute<RowDataPacket[]>(`
      SELECT COUNT(*) as total_pros FROM users u
      INNER JOIN worker_profiles wp ON u.id_user = wp.id_user
      WHERE u.rol = 'worker' AND wp.is_verified = 1
    `);
    
    const [[{ pending_pros }]] = await pool.execute<RowDataPacket[]>(`
      SELECT COUNT(*) as pending_pros FROM users u
      INNER JOIN worker_profiles wp ON u.id_user = wp.id_user
      WHERE u.rol = 'worker' AND wp.is_verified = 0 AND u.verification_token IS NULL
    `);
    
    const [[{ total_users }]] = await pool.execute<RowDataPacket[]>(`SELECT COUNT(*) as total_users FROM users WHERE rol = 'user'`);

    // Traffic Data - last 7 days of registrations
    const [trafficRows] = await pool.execute<RowDataPacket[]>(`
      SELECT 
        DATE_FORMAT(created_at, '%a') as name,
        SUM(CASE WHEN rol = 'user' THEN 1 ELSE 0 END) as Users,
        SUM(CASE WHEN rol = 'worker' THEN 1 ELSE 0 END) as Pros
      FROM users
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY DATE(created_at), DATE_FORMAT(created_at, '%a')
      ORDER BY DATE(created_at) ASC
    `);

    res.json({
      success: true,
      stats: {
        total_services: Number(total_services),
        total_pros: Number(total_pros),
        pending_pros: Number(pending_pros),
        total_users: Number(total_users),
        trafficData: trafficRows
      }
    });

  } catch (error: any) {
    console.error('Error in getDashboardStats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateHeroSlides = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureHeroSlidesTable();

    const slides = Array.isArray(req.body?.slides) ? req.body.slides : null;
    if (!slides || slides.length === 0) {
      res.status(400).json({ error: 'slides array is required (min 1 slide)' });
      return;
    }

    if (slides.length > 10) {
      res.status(400).json({ error: 'Maximum 10 slides allowed.' });
      return;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.execute(`DELETE FROM hero_slides`);

      for (let idx = 0; idx < slides.length; idx += 1) {
        const slide = slides[idx];
        const sortOrder = idx + 1;
        const image = String(slide?.image || '').trim();
        const tag = String(slide?.tag || '').trim().slice(0, 50);
        const title = String(slide?.title || '').trim().slice(0, 120);
        const description = String(slide?.description || '').trim().slice(0, 255);
        const cta = String(slide?.cta || '').trim().slice(0, 80);

        if (!image || !tag || !title || !description || !cta) {
          throw new Error(`Invalid slide payload at index ${idx}`);
        }

        await connection.execute<ResultSetHeader>(
          `INSERT INTO hero_slides (sort_order, image_url, tag, title, description, cta)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [sortOrder, image, tag, title, description, cta]
        );
      }

      await connection.commit();
    } catch (error: any) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const [rows] = await pool.execute<HeroSlideRow[]>(
      `SELECT id_slide, sort_order, image_url, tag, title, description, cta
       FROM hero_slides
       ORDER BY sort_order ASC`
    );

    res.json({ success: true, slides: toSlidesDto(rows) });
  } catch (error: any) {
    console.error('Error in updateHeroSlides:', error);
    res.status(400).json({ error: error?.message || 'Could not update slides' });
  }
};

export const uploadHeroSlideImage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureHeroSlidesTable();

    const idSlide = Number(req.params.idSlide);
    if (!idSlide) {
      res.status(400).json({ error: 'Invalid slide id' });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Image file is required' });
      return;
    }

    const allowed = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
    if (!allowed.has(file.mimetype)) {
      res.status(400).json({ error: 'Only PNG/JPG/WEBP images are allowed.' });
      return;
    }

    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${encodeURIComponent(file.filename)}`;

    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE hero_slides SET image_url = ? WHERE id_slide = ?`,
      [imageUrl, idSlide]
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Slide not found' });
      return;
    }

    const [rows] = await pool.execute<HeroSlideRow[]>(
      `SELECT id_slide, sort_order, image_url, tag, title, description, cta
       FROM hero_slides
       ORDER BY sort_order ASC`
    );

    res.json({ success: true, image: imageUrl, slides: toSlidesDto(rows) });
  } catch (error: any) {
    console.error('Error in uploadHeroSlideImage:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const uploadHeroImageAsset = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Image file is required' });
      return;
    }

    const allowed = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
    if (!allowed.has(file.mimetype)) {
      res.status(400).json({ error: 'Only PNG/JPG/WEBP images are allowed.' });
      return;
    }

    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${encodeURIComponent(file.filename)}`;
    res.json({ success: true, image: imageUrl });
  } catch (error: any) {
    console.error('Error in uploadHeroImageAsset:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
