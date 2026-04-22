import crypto from 'crypto';

let generatedDevelopmentJwtSecret: string | null = null;

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
