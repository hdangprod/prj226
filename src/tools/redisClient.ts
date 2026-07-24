import { Redis } from '@upstash/redis';

const isTest = process.env.NODE_ENV === 'test';

let redisInstance: Redis | null = null;
const getRedisClient = (): Redis => {
  if (!redisInstance) {
    const url = process.env.UPSTASH_REDIS_REST_URL || '';
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || '';
    redisInstance = new Redis({ url, token });
  }
  return redisInstance;
};

const getTtl = () => parseInt(process.env.DEBOUNCE_REDIS_TTL_S || '30', 10);

// --- Test Mock State ---
let mockStrings = new Map<string, { value: string; expiresAt: number }>();
let mockLists = new Map<string, { value: string[]; expiresAt: number }>();

const isExpired = (expiresAt: number) => expiresAt < Date.now();

export function resetMockState(): void {
  mockStrings.clear();
  mockLists.clear();
}

// --- Implementation ---

export async function rpushBuffer(chatId: number | string, text: string): Promise<number> {
  const key = `buffer:${chatId}`;
  const ttl = getTtl();
  if (isTest) {
    let item = mockLists.get(key);
    if (item && isExpired(item.expiresAt)) {
      mockLists.delete(key);
      item = undefined;
    }
    if (!item) {
      item = { value: [], expiresAt: 0 };
      mockLists.set(key, item);
    }
    item.value.push(text);
    item.expiresAt = Date.now() + ttl * 1000;
    return item.value.length;
  }

  try {
    const redis = getRedisClient();
    const length = await redis.rpush(key, text);
    await redis.expire(key, ttl);
    return length;
  } catch (err) {
    console.error('[RedisClient] rpushBuffer error:', err);
    throw err;
  }
}

export async function getBufferLength(chatId: number | string): Promise<number> {
  const key = `buffer:${chatId}`;
  if (isTest) {
    const item = mockLists.get(key);
    if (item && isExpired(item.expiresAt)) {
      mockLists.delete(key);
      return 0;
    }
    return item ? item.value.length : 0;
  }

  try {
    const redis = getRedisClient();
    return await redis.llen(key);
  } catch (err) {
    console.error('[RedisClient] getBufferLength error:', err);
    return 0;
  }
}

export async function setBufferTime(chatId: number | string): Promise<void> {
  const key = `buffer_time:${chatId}`;
  const ttl = getTtl();
  const now = Date.now().toString();
  if (isTest) {
    mockStrings.set(key, { value: now, expiresAt: Date.now() + ttl * 1000 });
    return;
  }

  try {
    const redis = getRedisClient();
    await redis.set(key, now);
    await redis.expire(key, ttl);
  } catch (err) {
    console.error('[RedisClient] setBufferTime error:', err);
    throw err;
  }
}

export async function getBufferTime(chatId: number | string): Promise<number | null> {
  const key = `buffer_time:${chatId}`;
  if (isTest) {
    const item = mockStrings.get(key);
    if (item && isExpired(item.expiresAt)) {
      mockStrings.delete(key);
      return null;
    }
    return item ? parseInt(item.value, 10) : null;
  }

  try {
    const redis = getRedisClient();
    const val = await redis.get<string | number>(key);
    if (val === null || val === undefined) return null;
    return typeof val === 'number' ? val : parseInt(val, 10);
  } catch (err) {
    console.error('[RedisClient] getBufferTime error:', err);
    return null;
  }
}

export async function flushBuffer(chatId: number | string): Promise<string[]> {
  const bufferKey = `buffer:${chatId}`;
  const timeKey = `buffer_time:${chatId}`;
  if (isTest) {
    const item = mockLists.get(bufferKey);
    let messages: string[] = [];
    if (item && !isExpired(item.expiresAt)) {
      messages = [...item.value];
    }
    mockLists.delete(bufferKey);
    mockStrings.delete(timeKey);
    return messages;
  }

  try {
    const redis = getRedisClient();
    const messages = await redis.lrange<string>(bufferKey, 0, -1);
    await redis.del(bufferKey, timeKey);
    return messages || [];
  } catch (err) {
    console.error('[RedisClient] flushBuffer error:', err);
    return [];
  }
}

export async function setTranscribingLock(chatId: number | string): Promise<void> {
  const key = `is_transcribing:${chatId}`;
  const ttl = getTtl();
  if (isTest) {
    mockStrings.set(key, { value: '1', expiresAt: Date.now() + ttl * 1000 });
    return;
  }

  try {
    const redis = getRedisClient();
    await redis.set(key, '1');
    await redis.expire(key, ttl);
  } catch (err) {
    console.error('[RedisClient] setTranscribingLock error:', err);
    throw err;
  }
}

export async function clearTranscribingLock(chatId: number | string): Promise<void> {
  const key = `is_transcribing:${chatId}`;
  if (isTest) {
    mockStrings.delete(key);
    return;
  }

  try {
    const redis = getRedisClient();
    await redis.del(key);
  } catch (err) {
    console.error('[RedisClient] clearTranscribingLock error:', err);
    throw err;
  }
}

export async function isTranscribing(chatId: number | string): Promise<boolean> {
  const key = `is_transcribing:${chatId}`;
  if (isTest) {
    const item = mockStrings.get(key);
    if (item && isExpired(item.expiresAt)) {
      mockStrings.delete(key);
      return false;
    }
    return !!item;
  }

  try {
    const redis = getRedisClient();
    const val = await redis.get(key);
    return !!val;
  } catch (err) {
    console.error('[RedisClient] isTranscribing error:', err);
    return false;
  }
}

export async function isRedisAvailable(): Promise<boolean> {
  if (isTest) return true;

  try {
    const redis = getRedisClient();
    await redis.ping();
    return true;
  } catch (err) {
    console.error('[RedisClient] isRedisAvailable error:', err);
    return false;
  }
}
