import Redis from "ioredis";

export let redis: Redis | null = null;

export const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  // Add any additional Redis configuration here
};

export const initRedis = () => {
  try {
    // Always initialize Redis in both production and development
    redis = new Redis(redisConfig);

    redis.on('connect', () => {
      console.log('✅ Redis connected successfully');
    });

    redis.on('error', (error) => {
      console.error('🚨 Redis connection error:', error);
      // Don't exit the process, let the application handle reconnection
    });

    return redis;
  } catch (error) {
    console.error('🚨 Failed to initialize Redis:', error);
    return null;
  }
}; 