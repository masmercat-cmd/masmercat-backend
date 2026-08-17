import { DataSource } from 'typeorm';
import type { DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

const isProd = process.env.NODE_ENV === 'production';

const options: DataSourceOptions = process.env.DATABASE_URL
  ? {
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: ['dist/**/*.entity.js'],
      migrations: ['dist/src/migrations/178*.js'],
      synchronize: false,
      ssl: isProd ? { rejectUnauthorized: false } : false,
    }
  : {
      type: 'postgres',
      host: process.env.DATABASE_HOST || process.env.DB_HOST || 'localhost',
      port: process.env.DATABASE_PORT
        ? parseInt(process.env.DATABASE_PORT, 10)
        : process.env.DB_PORT
          ? parseInt(process.env.DB_PORT, 10)
          : 5432,
      username:
        process.env.DATABASE_USER || process.env.DB_USERNAME || 'postgres',
      password:
        process.env.DATABASE_PASSWORD || process.env.DB_PASSWORD || '',
      database:
        process.env.DATABASE_NAME || process.env.DB_NAME || 'postgres',
      entities: ['dist/**/*.entity.js'],
      migrations: ['dist/src/migrations/178*.js'],
      synchronize: false,
      ssl: isProd ? { rejectUnauthorized: false } : false,
    };

export default new DataSource(options);
