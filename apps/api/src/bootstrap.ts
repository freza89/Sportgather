import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';

export async function createApp(env: Env): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(env),
    new FastifyAdapter({ trustProxy: env.NODE_ENV === 'production' }),
    { logger: env.NODE_ENV === 'test' ? false : ['log', 'warn', 'error'] },
  );
  await app.register(helmet, { contentSecurityPolicy: env.NODE_ENV === 'production' });
  await app.register(cookie);
  // Batas kasar per IP; batas OTP per nomor ditegakkan di OtpService.
  await app.register(rateLimit, {
    max: env.NODE_ENV === 'test' ? 10_000 : 300,
    timeWindow: '1 minute',
  });
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  app.enableShutdownHooks();

  const openapi = new DocumentBuilder()
    .setTitle('SportGather API')
    .setDescription('REST API SportGather — manajemen klub olahraga usia muda (KU7–KU16)')
    .setVersion('0.1.0')
    .addCookieAuth('sg_session')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, openapi));

  return app;
}
