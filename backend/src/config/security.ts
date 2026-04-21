const INSECURE_DEFAULT_JWT_SECRET = 'super_secret_jwt_key_for_development';

export const getJwtSecret = (): string => {
  const secret = String(process.env.JWT_SECRET || '').trim();
  const isProduction = process.env.NODE_ENV === 'production';

  if (secret && (!isProduction || secret !== INSECURE_DEFAULT_JWT_SECRET)) return secret;

  if (isProduction) {
    throw new Error('A secure JWT_SECRET is required in production.');
  }

  return INSECURE_DEFAULT_JWT_SECRET;
};

export const isUsingInsecureDefaultJwtSecret = () =>
  getJwtSecret() === INSECURE_DEFAULT_JWT_SECRET;
