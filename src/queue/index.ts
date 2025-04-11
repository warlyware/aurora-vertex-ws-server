import { Queue, Worker } from 'bullmq';
import { logServerEvent } from '../logging';
import { TradeJob, TradeJobResult } from './types';
import { redisConfig } from '../redis';

// Queue and worker registries
const botQueues = new Map<string, Queue<TradeJob, TradeJobResult>>();
const botWorkers = new Map<string, Worker<TradeJob, TradeJobResult>>();

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Local version of logBotEvent that sends through the IPC channel
const logBotEvent = (botId: string, userId: string, payload: { info: string; meta?: any }) => {
  process.send?.({
    type: 'BOT_LOG_EVENT',
    payload: {
      botId,
      userId,
      ...payload
    }
  });
};

/**
 * Get or create a queue for a specific bot
 */
export const getBotQueue = (botId: string): Queue<TradeJob, TradeJobResult> => {
  if (!botQueues.has(botId)) {
    const queueName = `bot-${botId}`;

    // Create queue if it doesn't exist
    const queue = new Queue<TradeJob, TradeJobResult>(queueName, {
      connection: redisConfig,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: {
          age: 24 * 3600, // Keep completed jobs for 24 hours
          count: 1000, // Keep last 1000 completed jobs
        },
        removeOnFail: {
          age: 24 * 3600, // Keep failed jobs for 24 hours
        },
      },
    });

    // Create worker for this queue
    const worker = new Worker<TradeJob, TradeJobResult>(
      queueName,
      async (job) => {
        const { type, botId, userId } = job.data;

        // logServerEvent(`Processing ${type} job ${job.id} for bot ${botId}`);
        // logServerEvent(`Job data: ${JSON.stringify(job.data)}`);
        console.log(`Processing ${type} job ${job.id} for bot ${botId}`);
        console.log(`Job data: ${JSON.stringify(job.data)}`);

        if (type === 'TEST') {
          logBotEvent(botId, userId, {
            info: `Test job ${job.id} starting 5 second sleep`
          });
          await sleep(5000);
          logBotEvent(botId, userId, {
            info: `Test job ${job.id} completed after 5 seconds`
          });
          return {
            success: true,
            signature: 'test-signature',
          };
        }

        // Return dummy result for other jobs - we'll implement real trade execution later
        return {
          success: true,
          signature: 'dummy-signature',
        };
      },
      {
        connection: redisConfig,
        concurrency: 1, // Process one trade at a time per bot
        lockDuration: 30000, // Lock job for 30 seconds
        autorun: true, // Worker starts processing as soon as it's instantiated
      }
    );

    // Set up worker event handlers
    worker.on('completed', (job) => {
      logServerEvent(`Job ${job.id} completed successfully`);
    });

    worker.on('failed', (job, error) => {
      logServerEvent(`Job ${job?.id} failed: ${error.message}`);
    });

    worker.on('error', (error) => {
      logServerEvent(`Worker error: ${error.message}`);
    });

    // Store references
    botQueues.set(botId, queue);
    botWorkers.set(botId, worker);
  }

  return botQueues.get(botId)!;
};

/**
 * Clean up queues and workers for a specific bot
 */
export const cleanupBotQueue = async (botId: string) => {
  const queue = botQueues.get(botId);
  const worker = botWorkers.get(botId);

  if (worker) {
    await worker.close();
    botWorkers.delete(botId);
  }

  if (queue) {
    await queue.close();
    botQueues.delete(botId);
  }
};

/**
 * Clean up all queues and workers
 */
export const cleanupAllQueues = async () => {
  const botIds = Array.from(botQueues.keys());
  await Promise.all(botIds.map(cleanupBotQueue));
};

// Handle process termination
process.on('SIGTERM', async () => {
  await cleanupAllQueues();
  process.exit(0);
});

