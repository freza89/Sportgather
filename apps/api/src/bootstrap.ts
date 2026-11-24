import helmet from '@fastify/helmet';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';

export async function createApp(env: Env): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: env.NODE_ENV === 'test' ? false : ['log', 'warn', 'error'],
  });
  await app.register(helmet, { contentSecurityPolicy: env.NODE_ENV === 'production' });
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
  app.setGlobalPrefix('v1', { exclude: ['health'] });

  const openapi = new DocumentBuilder()
    .setTitle('SportGather API')
    .setDescription('REST API SportGather — manajemen klub olahraga usia muda (KU7–KU16)')
    .setVersion('0.0.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, openapi));

  return app;
}
