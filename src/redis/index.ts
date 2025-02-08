import Redis from "ioredis";

export let redis: Redis | null = null;

export const initRedis = () => {
  console.log('process.env.IS_PRODUCTION:', !!process.env.IS_PRODUCTION);
  if (process.env.IS_PRODUCTION) {
    redis = new Redis();
    console.log('✅ Redis connected in production mode');
  } else {
    console.log('🚨 Redis not connected in development mode');
  }
}; 