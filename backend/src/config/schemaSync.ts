export const shouldRunRuntimeSchemaSync = () =>
  String(process.env.ENABLE_RUNTIME_SCHEMA_SYNC || '').trim().toLowerCase() === 'true';
