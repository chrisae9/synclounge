const MAX_DEPTH = 4;
const MAX_ARRAY_LENGTH = 8;
const MAX_STRING_LENGTH = 300;
const MAX_LEAVES = 140;

const allowedTopLevelKeys = new Set([
  'event',
  'clientTimestamp',
  'details',
  'browser',
  'sessions',
  'playback',
  'stream',
]);

const sanitizeString = (value) => [...value.slice(0, MAX_STRING_LENGTH)]
  .map((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 31 || codePoint === 127 ? ' ' : character;
  })
  .join('');

const sanitizeValue = (value, depth, budget) => {
  if (!budget.hasRemaining() || depth > MAX_DEPTH || value == null) {
    return value == null ? null : undefined;
  }

  if (typeof value === 'string') {
    budget.consume();
    return sanitizeString(value);
  }

  if (typeof value === 'number') {
    budget.consume();
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'boolean') {
    budget.consume();
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH)
      .map((item) => sanitizeValue(item, depth + 1, budget))
      .filter((item) => item !== undefined);
  }

  if (typeof value === 'object') {
    const sanitized = {};
    Object.entries(value).slice(0, 40).forEach(([key, item]) => {
      if (!/^[A-Za-z0-9_.-]{1,64}$/.test(key)) return;
      const cleanItem = sanitizeValue(item, depth + 1, budget);
      if (cleanItem !== undefined) sanitized[key] = cleanItem;
    });
    return sanitized;
  }

  return undefined;
};

export const sanitizePlaybackDiagnostic = (data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

  let remainingLeaves = MAX_LEAVES;
  const budget = {
    hasRemaining: () => remainingLeaves > 0,
    consume: () => { remainingLeaves -= 1; },
  };
  const sanitized = {};
  allowedTopLevelKeys.forEach((key) => {
    if (!(key in data)) return;
    const value = sanitizeValue(data[key], 0, budget);
    if (value !== undefined) sanitized[key] = value;
  });

  if (typeof sanitized.event !== 'string' || sanitized.event.length === 0) return null;
  sanitized.event = sanitized.event.toLowerCase().replace(/[^a-z0-9._-]/g, '-').slice(0, 64);
  return sanitized;
};

export default sanitizePlaybackDiagnostic;
