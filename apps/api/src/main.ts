import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  const allowedOrigins = process.env.ADMIN_ALLOWED_ORIGIN
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: allowedOrigins?.length ? allowedOrigins : true });
  await app.listen(Number(process.env.PORT || 3000), '0.0.0.0');
}

void bootstrap();
