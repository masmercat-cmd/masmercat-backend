import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';
import { MessagesRealtimeService } from './messages/messages-realtime.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

  app.enableCors({
    origin: true,
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
