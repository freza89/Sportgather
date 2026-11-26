import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';

export async function createApp(env: Env): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(env),
    // Hanya proxy di TRUST_PROXY yang dipercaya; trustProxy=true membuat IP klien bisa dipalsukan.
    new FastifyAdapter({ trustProxy: env.TRUST_PROXY || false }),
    {
      logger:
        env.NODE_ENV === 'test' && !process.env.SG_TEST_LOG ? false : ['log', 'warn', 'error'],
      // Gagal start (mis. storage tidak terjangkau) dilempar sebagai error, bukan process.abort(),
      // agar pesan jelas dan proses tes tidak ikut mati.
      abortOnError: false,
    },
  );
  await app.register(helmet, { contentSecurityPolicy: env.NODE_ENV === 'production' });
  await app.register(cookie);
  // Unggah dokumen: maks. 5 MB per file, 6 file (satu per anak) per permintaan.
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 6, fields: 5 } });
  // Batas kasar per IP; batas OTP per nomor ditegakkan di OtpService.
  await app.register(rateLimit, {
    max: env.NODE_ENV === 'test' ? 10_000 : env.RATE_LIMIT_PER_MIN,
    timeWindow: '1 minute',
  });
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
  app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready'] });
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
