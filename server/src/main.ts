import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { Logger } from './app/classes/logger';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  if (!process.env.APP_URL) {
    throw new Error('APP_URL is not set');
  }

  app.useLogger(app.get(Logger));

  app.use(cookieParser());

  app.enableCors({
    origin: true,
    methods: 'GET,PUT,POST,DELETE,PATCH',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
  }));

  const portEnv = process.env.APP_PORT;
  const port = portEnv ? parseInt(portEnv, 10) : 5094;
  await app.listen(port);
}
bootstrap();
