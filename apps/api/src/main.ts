import 'reflect-metadata';
import { createApp } from './bootstrap.js';
import { loadEnv } from './config/env.js';

const env = loadEnv();
const app = await createApp(env);
await app.listen(env.API_PORT, '0.0.0.0');
console.log(`SportGather API berjalan di http://localhost:${env.API_PORT} (dokumentasi: /docs)`);
