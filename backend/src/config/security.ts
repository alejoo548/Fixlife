import crypto from 'crypto';
import jwt, { SignOptions } from 'jsonwebtoken';

let generatedDevelopmentJwtSecret: string | null = null;
const JWT_ALGORITHM = 'HS256' as const;

const canUseGeneratedDevelopmentSecret = () => {
  const runtimeEnv = String(process.env.NODE_ENV || '').trim().toLowerCase();
  return runtimeEnv === 'development' || runtimeEnv === 'test' || (!runtimeEnv && process.env.npm_lifecycle_event === 'dev');
};

export const getJwtSecret = (): string => {
  const secret = String(process.env.JWT_SECRET || '').trim();

  if (secret) return secret;

  if (!canUseGeneratedDevelopmentSecret()) {
    throw new Error('A secure JWT_SECRET is required outside development and test.');
  }

  if (!generatedDevelopmentJwtSecret) {
    generatedDevelopmentJwtSecret = crypto.randomBytes(48).toString('base64url');
  }

  return generatedDevelopmentJwtSecret;
};

export const isUsingGeneratedDevelopmentJwtSecret = () =>
  !String(process.env.JWT_SECRET || '').trim() && canUseGeneratedDevelopmentSecret();

export type AccessTokenPayload = {
  user_id: number;
  rol: string;
  pending_worker?: number;
};

export const signAccessToken = (
  payload: AccessTokenPayload,
  options: Pick<SignOptions, 'expiresIn'> = { expiresIn: '7d' }
) =>
  jwt.sign(payload, getJwtSecret(), {
    algorithm: JWT_ALGORITHM,
    ...options,
  });

export const verifyAccessToken = (token: string) =>
  jwt.verify(token, getJwtSecret(), {
    algorithms: [JWT_ALGORITHM],
  }) as AccessTokenPayload;
