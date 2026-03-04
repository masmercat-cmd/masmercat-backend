import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as dotenv from 'dotenv';

dotenv.config();

const configService = new ConfigService();

const dbType = configService.get('DB_TYPE') || 'sqlite';

const config: any = {
  type: dbType,
  database: configService.get('DB_DATABASE') || 'masmercat.db',
  entities: ['src/entities/**/*.entity.ts'],
  migrations: ['src/migrations/**/*.ts'],
  synchronize: true,
  logging: configService.get('NODE_ENV') === 'development'
};

if (dbType === 'postgres') {
  config.host = configService.get('DATABASE_HOST');
  config.port = parseInt(configService.get('DATABASE_PORT') || '5432');
  config.username = configService.get('DATABASE_USER');
  config.password = configService.get('DATABASE_PASSWORD');
}

export default new DataSource(config);