import { Request, Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { AuthRequest } from '../middlewares/auth.middleware';

const SAFE_TEXT_RE = /^[a-zA-Z0-9\s.,!?'"""''()\-–—@#&*+=/\\:;áéíóúüñÁÉÍÓÚÜÑàèìòùÀÈÌÒÙâêîôûÂÊÎÔÛ]+$/u;
const MAX_CHARS = 500;
const MIN_CHARS = 10;

export const initReviewsTable = async (): Promise<void> => {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS platform_reviews (
      id_review       INT NOT NULL AUTO_INCREMENT,
      id_user         INT NOT NULL,
      author_name     VARCHAR(100) NOT NULL,
      author_role     ENUM('client','worker') NOT NULL DEFAULT 'client',
      service_category VARCHAR(120) NULL,
      rating          TINYINT UNSIGNED NOT NULL,
      review_text     TEXT NOT NULL,
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_review),
      KEY idx_pr_created (created_at),
      KEY idx_pr_user (id_user),
      CONSTRAINT fk_pr_user FOREIGN KEY (id_user) REFERENCES users(id_user) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

export const getPublicReviews = async (_req: Request, res: Response): Promise<void> => {
  try {
    // Pool of recent 10 days. Return up to 10 random.
    const [rows] = await pool.execute<RowDataPacket[]>(`
      SELECT id_review, author_name, author_role, service_category, rating, review_text, created_at
      FROM platform_reviews
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 10 DAY)
      ORDER BY RAND()
      LIMIT 10
    `);

    const [statsRows] = await pool.execute<RowDataPacket[]>(`
      SELECT
        COUNT(*) AS total_reviews,
        COALESCE(ROUND(AVG(rating), 1), 0) AS average_rating,
        COALESCE(SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END), 0) AS five_star_reviews
      FROM platform_reviews
    `);

    const [jobRows] = await pool.execute<RowDataPacket[]>(`
      SELECT COUNT(*) AS completed_jobs
      FROM service_requests
      WHERE status = 'done'
    `);

    const reviewStats = statsRows[0];
    const totalReviews = Number(reviewStats?.total_reviews || 0);
    const fiveStarReviews = Number(reviewStats?.five_star_reviews || 0);
    const satisfactionRate = totalReviews > 0
      ? Math.round((fiveStarReviews / totalReviews) * 100)
      : 0;

    res.json({
      success: true,
      reviews: rows,
      stats: {
        total_reviews: totalReviews,
        average_rating: Number(reviewStats?.average_rating || 0),
        completed_jobs: Number(jobRows[0]?.completed_jobs || 0),
        satisfaction_rate: satisfactionRate,
      },
    });
  } catch (error) {
    console.error('getPublicReviews error:', error);
    res.status(500).json({ success: false, message: 'Could not load reviews.' });
  }
};

export const submitPlatformReview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const idUser = req.user?.user_id;
    if (!idUser) {
      res.status(401).json({ success: false, message: 'Authentication required.' });
      return;
    }

    const { rating, review_text } = req.body as {
      rating: unknown;
      review_text: unknown;
    };

    // Validate rating
    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      res.status(400).json({ success: false, message: 'Rating must be between 1 and 5 stars.' });
      return;
    }

    // Validate text
    const text = typeof review_text === 'string' ? review_text.trim() : '';
    if (text.length < MIN_CHARS) {
      res.status(400).json({ success: false, message: `Review must be at least ${MIN_CHARS} characters.` });
      return;
    }
    if (text.length > MAX_CHARS) {
      res.status(400).json({ success: false, message: `Review must be at most ${MAX_CHARS} characters.` });
      return;
    }
    if (!SAFE_TEXT_RE.test(text)) {
      res.status(400).json({ success: false, message: 'Review contains unsupported characters. Please use letters, numbers, and common punctuation only.' });
      return;
    }

    // Determine author role
    const userRole = req.user?.rol ?? 'client';
    const authorRole = String(userRole) === 'worker' ? 'worker' : 'client';

    // Service category is never taken from the client; auto-derive it from the
    // worker's registered services (most experience first) so it can't be spoofed.
    let category: string | null = null;
    if (authorRole === 'worker') {
      const [categoryRows] = await pool.execute<RowDataPacket[]>(
        `SELECT s.name
         FROM worker_services ws
         INNER JOIN worker_profiles wp ON wp.id_worker_profile = ws.id_worker_profile
         INNER JOIN services s ON s.id_service = ws.id_service
         WHERE wp.id_user = ?
         ORDER BY ws.years_experience DESC
         LIMIT 1`,
        [idUser]
      );
      category = (categoryRows[0]?.name as string) ?? null;
    }

    // Get author name from users table
    const [userRows] = await pool.execute<RowDataPacket[]>(
      `SELECT name FROM users WHERE id_user = ? LIMIT 1`,
      [idUser]
    );
    const authorName = (userRows[0]?.name as string) ?? 'Anonymous';

    // Enforce 1 review per user per 24 hours atomically: the NOT EXISTS check and
    // the insert run as a single statement, so two concurrent requests (e.g. fired
    // from devtools) can't both pass a separate SELECT before either INSERT lands.
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO platform_reviews (id_user, author_name, author_role, service_category, rating, review_text)
       SELECT ?, ?, ?, ?, ?, ?
       FROM DUAL
       WHERE NOT EXISTS (
         SELECT 1 FROM platform_reviews WHERE id_user = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
       )`,
      [idUser, authorName, authorRole, category, ratingNum, text, idUser]
    );

    if (result.affectedRows === 0) {
      res.status(429).json({ success: false, message: 'You have already submitted a review in the last 24 hours. Thank you!' });
      return;
    }

    res.status(201).json({ success: true, id_review: result.insertId });
  } catch (error) {
    console.error('submitPlatformReview error:', error);
    res.status(500).json({ success: false, message: 'Could not submit your review. Please try again.' });
  }
};
