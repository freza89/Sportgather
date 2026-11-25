import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { BLOB_STORE, DocumentVault, MemoryBlobStore, S3BlobStore } from './storage.js';

@Global()
@Module({
  providers: [
    {
      provide: BLOB_STORE,
      inject: [ENV],
      useFactory: async (env: Env) => {
        if (env.STORAGE_PROVIDER === 'memory') return new MemoryBlobStore();
        const store = new S3BlobStore(env);
        await store.onModuleInit();
        return store;
      },
    },
    DocumentVault,
  ],
  exports: [DocumentVault, BLOB_STORE],
})
export class StorageModule {}
