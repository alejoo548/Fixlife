let databaseSchemaReady = false;

export const markDatabaseSchemaReady = () => {
  databaseSchemaReady = true;
};

export const isDatabaseSchemaReady = () => databaseSchemaReady;
