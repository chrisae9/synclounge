const createAdmission = ({
  maxConnections = 512, maxPerIp = 32, maxPending = 32,
  attemptsPerMinute = 60, maxBuckets = 10000, now = Date.now,
} = {}) => {
  for (const value of [maxConnections, maxPerIp, maxPending, attemptsPerMinute, maxBuckets]) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new TypeError('Socket admission limits must be positive safe integers');
    }
  }
  const clients = new Map();
  const attempts = new Map();
  let total = 0;
  let pending = 0;
  let pruneAt = 0;

  return (address) => {
    const time = now();
    if (time >= pruneAt) {
      for (const [ip, bucket] of attempts) {
        if (time - bucket.start >= 60000) attempts.delete(ip);
      }
      pruneAt = time + 60000;
    }
    let bucket = attempts.get(address);
    if (!bucket || time - bucket.start >= 60000) {
      if (!bucket && attempts.size >= maxBuckets) throw new Error('Connection capacity reached');
      bucket = { start: time, count: 0 };
      attempts.set(address, bucket);
    }
    bucket.count += 1;
    if (bucket.count > attemptsPerMinute || total >= maxConnections
      || pending >= maxPending || (clients.get(address) || 0) >= maxPerIp) {
      throw new Error('Connection capacity reached');
    }
    total += 1;
    pending += 1;
    clients.set(address, (clients.get(address) || 0) + 1);
    let released = false;
    let authenticating = true;
    const authenticated = () => {
      if (authenticating) pending -= 1;
      authenticating = false;
    };
    return {
      authenticated,
      release: () => {
        if (released) return;
        released = true;
        authenticated();
        total -= 1;
        const count = clients.get(address) - 1;
        if (count) clients.set(address, count);
        else clients.delete(address);
      },
    };
  };
};

export default createAdmission;
