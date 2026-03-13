import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { Logger } from './app/classes/logger';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  if (!process.env.APP_URL) {
    throw new Error('APP_URL is not set');
  }

  app.useLogger(app.get(Logger));
  app.use(cookieParser());

  // ─── Helmet: security headers ───
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'wss:', 'https:'],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'", 'https:', 'data:'],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,   // Needed for images from external CDN
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow images from API on other origins
    }),
  );

  // ─── CORS: strict whitelist ───
  const allowedOrigins = [
    'https://sitte2.vercel.app',
    'https://touringexpertsale.ru',
    'https://www.touringexpertsale.ru',
    'https://api.touringexpertsale.ru',
  ];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'), false);
    },
    methods: 'GET,PUT,POST,DELETE,PATCH,OPTIONS',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
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
