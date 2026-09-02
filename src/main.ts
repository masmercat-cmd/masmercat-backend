import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';
import * as express from 'express';
import { join } from 'path';
import { MessagesRealtimeService } from './messages/messages-realtime.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
  app.use('/uploads', express.static(join(process.cwd(), 'tmp', 'uploads')));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const configuredOrigins = [process.env.FRONTEND_URL, process.env.ADMIN_URL]
    .flatMap(value => `${value ?? ''}`.split(','))
    .map(value => value.trim())
    .filter(Boolean);
  app.enableCors({
    origin: (origin, callback) => {
      const isLocalDevelopment =
        process.env.NODE_ENV !== 'production' &&
        Boolean(origin?.match(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/));
      if (!origin || configuredOrigins.includes(origin) || isLocalDevelopment) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin not allowed by CORS'));
    },
    credentials: true,
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;

  await app.listen(port, '0.0.0.0');
  app
    .get(MessagesRealtimeService)
    .attachServer(app.getHttpServer());
  console.log(`Server running on port ${port}`);
}
bootstrap();
