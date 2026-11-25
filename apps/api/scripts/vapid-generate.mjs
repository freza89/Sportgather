// Buat pasangan kunci VAPID untuk Web Push. Simpan di secret manager / .env (jangan di-commit).
import { generateVAPIDKeys } from 'web-push';
const k = generateVAPIDKeys();
console.log(
  `PUSH_PROVIDER=real\nVAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}`,
);
