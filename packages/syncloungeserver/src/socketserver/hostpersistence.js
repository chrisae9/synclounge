import {
  chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const TTL_MS = 24 * 60 * 60 * 1000;
const RECOVERY_MS = 60000;
const MAX_ROOMS = 2048;
const IDENTITY = /^[a-f0-9-]{36}$/;

// This file contains a signing secret. It must live on private, durable, single-writer storage.
export const createHostPersistence = (filePath, now = Date.now) => {
  if (!filePath) return null;
  let secret = randomBytes(32).toString('hex');
  let entries = [];
  if (existsSync(filePath)) {
    if (statSync(filePath).size > 4 * 1024 * 1024) throw new Error('Room state file is too large');
    const saved = JSON.parse(readFileSync(filePath, 'utf8'));
    if (saved.version !== 1 || !/^[a-f0-9]{64}$/.test(saved.secret)
      || !Array.isArray(saved.rooms)) throw new Error('Invalid room state file');
    secret = saved.secret;
    entries = saved.rooms.filter(([roomId, record]) => typeof roomId === 'string'
      && roomId.length <= 256 && record && IDENTITY.test(record.identity)
      && Number.isFinite(record.updatedAt) && record.updatedAt > now() - TTL_MS
      && record.updatedAt <= now() + 60000).slice(-MAX_ROOMS);
  }
  const records = new Map(entries);
  const recovery = new Map(entries);
  const deadline = now() + RECOVERY_MS;
  let shuttingDown = false;
  let dirty = false;
  const persist = (strict = false) => {
    if (shuttingDown) return;
    for (const [roomId, record] of records) {
      if (record.updatedAt <= now() - TTL_MS) records.delete(roomId);
    }
    while (records.size > MAX_ROOMS) records.delete(records.keys().next().value);
    try {
      mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
      const temporary = `${filePath}.${process.pid}.tmp`;
      writeFileSync(temporary, JSON.stringify({ version: 1, secret, rooms: [...records] }), { mode: 0o600 });
      chmodSync(temporary, 0o600);
      renameSync(temporary, filePath);
      dirty = false;
    } catch (error) {
      dirty = true;
      if (strict) throw error;
      // Storage trouble must not interrupt an active watch party. Later updates retry.
      console.error('Unable to persist room ownership:', error.message);
    }
  };
  persist(true);
  return {
    secret: Buffer.from(secret, 'hex'),
    getRecovery: (roomId) => {
      if (now() >= deadline) {
        recovery.clear();
        return null;
      }
      return recovery.get(roomId) || null;
    },
    remember: (roomId, record, { force = false, revokeRecovery = false } = {}) => {
      if (shuttingDown || !IDENTITY.test(record.identity)) return;
      if (revokeRecovery) recovery.delete(roomId);
      const old = records.get(roomId);
      if (!force && !dirty && old && now() - old.updatedAt < 60000) return;
      records.delete(roomId);
      records.set(roomId, { ...record, updatedAt: now() });
      persist();
    },
    remove: (roomId) => {
      if (shuttingDown) return;
      recovery.delete(roomId);
      if (records.delete(roomId)) persist();
    },
    close: () => { shuttingDown = true; },
  };
};

export default createHostPersistence;
