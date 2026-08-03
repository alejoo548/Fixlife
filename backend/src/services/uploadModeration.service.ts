import fs from 'fs/promises';
import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import pool from '../config/db';

type DbExecutor = Pick<Pool | PoolConnection, 'execute'>;

export type UploadModerationDecision = 'allow' | 'review' | 'block' | 'skipped';

export type UploadModerationResult = {
  decision: UploadModerationDecision;
  provider: 'openai' | 'local' | 'none';
  model: string | null;
  reason: string | null;
  categories: Record<string, boolean>;
  categoryScores: Record<string, number>;
  flagged: boolean;
  skippedReason?: string | null;
};

const OPENAI_MODERATION_URL = 'https://api.openai.com/v1/moderations';
const OPENAI_MODERATION_MODEL = process.env.OPENAI_MODERATION_MODEL || 'omni-moderation-latest';
const AI_MODERATION_ENABLED = process.env.AI_IMAGE_MODERATION_ENABLED === 'true';
const AI_MODERATION_BLOCK_THRESHOLD = Number(process.env.AI_IMAGE_MODERATION_BLOCK_THRESHOLD || 0.72);
const AI_MODERATION_REVIEW_THRESHOLD = Number(process.env.AI_IMAGE_MODERATION_REVIEW_THRESHOLD || 0.38);
const AI_MODERATION_FAIL_CLOSED = process.env.AI_IMAGE_MODERATION_FAIL_CLOSED === 'true';
const AI_MODERATION_TIMEOUT_MS = Math.max(1000, Math.min(Number(process.env.AI_IMAGE_MODERATION_TIMEOUT_MS || 8000), 20000));
const AI_MODERATION_BLOCK_CATEGORIES = new Set(
  String(process.env.AI_IMAGE_MODERATION_BLOCK_CATEGORIES || 'sexual,sexual/minors,violence,violence/graphic,illicit,illicit/violent,self-harm,self-harm/intent,self-harm/instructions')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
);

export const ensureUploadModerationTables = async (executor: DbExecutor = pool) => {
  await executor.execute(`
    CREATE TABLE IF NOT EXISTS upload_moderation_reviews (
      id_review INT NOT NULL AUTO_INCREMENT,
      id_user INT NULL,
      id_request INT NULL,
      upload_field VARCHAR(80) NULL,
      file_name VARCHAR(255) NOT NULL,
      original_file_name VARCHAR(255) NULL,
      provider VARCHAR(40) NOT NULL DEFAULT 'none',
      model VARCHAR(80) NULL,
      decision ENUM('allow','review','block','skipped') NOT NULL DEFAULT 'skipped',
      risk_type VARCHAR(80) NULL,
      flagged TINYINT(1) NOT NULL DEFAULT 0,
      categories_json JSON NULL,
      scores_json JSON NULL,
      reason VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TIMESTAMP NULL,
      reviewed_by_user_id INT NULL,
      PRIMARY KEY (id_review),
      KEY idx_upload_moderation_decision (decision, created_at),
      KEY idx_upload_moderation_user (id_user, created_at),
      KEY idx_upload_moderation_request (id_request, created_at),
      CONSTRAINT fk_upload_moderation_user FOREIGN KEY (id_user) REFERENCES users(id_user) ON DELETE SET NULL,
      CONSTRAINT fk_upload_moderation_request FOREIGN KEY (id_request) REFERENCES service_requests(id_request) ON DELETE SET NULL,
      CONSTRAINT fk_upload_moderation_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id_user) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

const toDataUrl = async (filePath: string, mimeType: string) => {
  const buffer = await fs.readFile(filePath);
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
};

const scoreForBlockedCategories = (scores: Record<string, number>) => {
  let maxScore = 0;
  let maxCategory: string | null = null;

  for (const [category, score] of Object.entries(scores)) {
    const numericScore = Number(score || 0);
    if (AI_MODERATION_BLOCK_CATEGORIES.has(category) && numericScore > maxScore) {
      maxScore = numericScore;
      maxCategory = category;
    }
  }

  return { maxScore, maxCategory };
};

const decideFromOpenAi = (
  flagged: boolean,
  categories: Record<string, boolean>,
  categoryScores: Record<string, number>
): UploadModerationResult => {
  const { maxScore, maxCategory } = scoreForBlockedCategories(categoryScores);
  const hasHighConfidenceBlockedCategory = Object.entries(categoryScores).some(
    ([category, score]) => AI_MODERATION_BLOCK_CATEGORIES.has(category) && Number(score || 0) >= AI_MODERATION_BLOCK_THRESHOLD
  );

  if (flagged || hasHighConfidenceBlockedCategory || maxScore >= AI_MODERATION_BLOCK_THRESHOLD) {
    return {
      decision: 'block',
      provider: 'openai',
      model: OPENAI_MODERATION_MODEL,
      reason: maxCategory
        ? `High confidence policy risk: ${maxCategory}`
        : 'OpenAI moderation flagged blocked content.',
      categories,
      categoryScores,
      flagged: true,
    };
  }

  if (maxScore >= AI_MODERATION_REVIEW_THRESHOLD) {
    return {
      decision: 'review',
      provider: 'openai',
      model: OPENAI_MODERATION_MODEL,
      reason: maxCategory ? `Moderation review recommended: ${maxCategory}` : 'OpenAI moderation requested review.',
      categories,
      categoryScores,
      flagged,
    };
  }

  return {
    decision: 'allow',
    provider: 'openai',
    model: OPENAI_MODERATION_MODEL,
    reason: null,
    categories,
    categoryScores,
    flagged: false,
  };
};

export const moderateImageWithAi = async (input: {
  filePath: string;
  mimeType: string;
}): Promise<UploadModerationResult> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!AI_MODERATION_ENABLED) {
    return {
      decision: 'skipped',
      provider: 'none',
      model: null,
      reason: 'AI image moderation is disabled.',
      categories: {},
      categoryScores: {},
      flagged: false,
      skippedReason: 'disabled',
    };
  }
  if (!apiKey) {
    return {
      decision: 'skipped',
      provider: 'none',
      model: null,
      reason: 'OPENAI_API_KEY is not configured.',
      categories: {},
      categoryScores: {},
      flagged: false,
      skippedReason: 'missing_api_key',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_MODERATION_TIMEOUT_MS);

  try {
    const imageUrl = await toDataUrl(input.filePath, input.mimeType);
    const response = await fetch(OPENAI_MODERATION_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODERATION_MODEL,
        input: [
          {
            type: 'image_url',
            image_url: { url: imageUrl },
          },
        ],
      }),
    });

    const payload = (await response.json().catch(() => null)) as any;
    if (!response.ok) {
      return {
        decision: AI_MODERATION_FAIL_CLOSED ? 'block' : 'skipped',
        provider: 'openai',
        model: OPENAI_MODERATION_MODEL,
        reason: payload?.error?.message || 'AI moderation provider failed.',
        categories: {},
        categoryScores: {},
        flagged: AI_MODERATION_FAIL_CLOSED,
        skippedReason: AI_MODERATION_FAIL_CLOSED ? null : 'provider_failed',
      };
    }

    const result = payload?.results?.[0] || {};
    return decideFromOpenAi(
      Boolean(result.flagged),
      result.categories || {},
      result.category_scores || {}
    );
  } catch (error: any) {
    return {
      decision: AI_MODERATION_FAIL_CLOSED ? 'block' : 'skipped',
      provider: 'openai',
      model: OPENAI_MODERATION_MODEL,
      reason: error?.name === 'AbortError' ? 'AI moderation timed out.' : 'AI moderation failed.',
      categories: {},
      categoryScores: {},
      flagged: AI_MODERATION_FAIL_CLOSED,
      skippedReason: AI_MODERATION_FAIL_CLOSED ? null : (error?.name === 'AbortError' ? 'timeout' : 'provider_failed'),
    };
  } finally {
    clearTimeout(timeout);
  }
};

export const recordUploadModerationReview = async (
  input: {
    userId?: number | null;
    requestId?: number | null;
    uploadField?: string | null;
    fileName: string;
    originalFileName?: string | null;
    result: UploadModerationResult;
  },
  executor: DbExecutor = pool
) => {
  await ensureUploadModerationTables(executor);
  const scoresJson = JSON.stringify(input.result.categoryScores || {});
  const categoriesJson = JSON.stringify(input.result.categories || {});
  const riskType = Object.entries(input.result.categoryScores || {})
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))[0]?.[0] || null;

  const [result] = await executor.execute<ResultSetHeader>(
    `INSERT INTO upload_moderation_reviews
       (id_user, id_request, upload_field, file_name, original_file_name, provider, model, decision, risk_type, flagged, categories_json, scores_json, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?)`,
    [
      input.userId ?? null,
      input.requestId ?? null,
      input.uploadField ? String(input.uploadField).slice(0, 80) : null,
      String(input.fileName).slice(0, 255),
      input.originalFileName ? String(input.originalFileName).slice(0, 255) : null,
      input.result.provider,
      input.result.model,
      input.result.decision,
      riskType,
      input.result.flagged ? 1 : 0,
      categoriesJson,
      scoresJson,
      input.result.reason ? String(input.result.reason).slice(0, 255) : null,
    ]
  );

  return Number(result.insertId);
};

export const getUploadModerationReviewSummary = async (executor: DbExecutor = pool) => {
  await ensureUploadModerationTables(executor);
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT decision, COUNT(*) AS total
     FROM upload_moderation_reviews
     GROUP BY decision`
  );
  return rows.map((row) => ({
    decision: String(row.decision),
    total: Number(row.total || 0),
  }));
};
