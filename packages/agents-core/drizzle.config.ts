import { defineConfig } from 'drizzle-kit';
import * as path from 'path';

// Allow configuration through environment variables
const dbUrl = process.env.DATABASE_URL || process.env.DB_FILE_NAME || "file:./database.db";
export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'sqlite',
  dbCredentials: {
    url: dbUrl,
  },
});