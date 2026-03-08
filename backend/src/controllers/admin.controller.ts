import { Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { AuthRequest } from '../middlewares/auth.middleware';

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
