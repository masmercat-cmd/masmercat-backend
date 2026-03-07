import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

const isProd = process.env.NODE_ENV === 'production';

const options: DataSourceOptions = process.env.DATABASE_URL
  ? {
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: ['dist/**/*.entity.js'],
      migrations: ['dist/migrations/*.js'],
      synchronize: false,
      ssl: isProd ? { rejectUnauthorized: false } : false,
    }
  : {
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'postgres',
      entities: ['dist/**/*.entity.js'],
      migrations: ['dist/migrations/*.js'],
      synchronize: false,
      ssl: isProd ? { rejectUnauthorized: false } : false,
    };

export const AppDataSource = new DataSource(options);
export default AppDataSource;