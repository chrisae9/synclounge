const unsafePathParts = new Set(['__proto__', 'constructor', 'prototype']);

const pathParts = (path) => path.split('.');

const isPlainObject = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const mergeStoredValue = (current, stored) => {
  if (!isPlainObject(stored)) {
    return stored;
  }

  const merged = isPlainObject(current) ? { ...current } : {};
  Object.keys(stored).forEach((key) => {
    if (!unsafePathParts.has(key)) {
      merged[key] = mergeStoredValue(merged[key], stored[key]);
    }
  });
  return merged;
};

const readPath = (source, path) => {
  let value = source;

  for (const part of pathParts(path)) {
    if (
      unsafePathParts.has(part)
      || value === null
      || typeof value !== 'object'
      || !Object.prototype.hasOwnProperty.call(value, part)
    ) {
      return { found: false };
    }
    value = value[part];
  }

  return { found: true, value };
};

const writePath = (target, path, value) => {
  const parts = pathParts(path);
  let cursor = target;

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (unsafePathParts.has(part)) {
      return;
    }

    if (index === parts.length - 1) {
      cursor[part] = value;
      break;
    }

    const current = cursor[part];
    cursor[part] = Array.isArray(current) ? [...current] : { ...current };
    cursor = cursor[part];
  }
};

const readStoredState = (storage, key) => {
  try {
    const storedValue = storage.getItem(key);
    return typeof storedValue === 'string' ? JSON.parse(storedValue) : storedValue;
  } catch {
    return undefined;
  }
};

const writeStoredState = (storage, key, value) => {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Persistence is best-effort: storage may be unavailable or over quota.
  }
};

const createPersistedState = ({
  key = 'vuex',
  paths = [],
  storage = window.localStorage,
} = {}) => (store) => {
  const storedState = readStoredState(storage, key);

  if (storedState && typeof storedState === 'object') {
    const restoredState = { ...store.state };
    paths.forEach((path) => {
      const stored = readPath(storedState, path);
      if (stored.found) {
        const current = readPath(restoredState, path);
        writePath(
          restoredState,
          path,
          mergeStoredValue(current.found ? current.value : undefined, stored.value),
        );
      }
    });
    store.replaceState(restoredState);
  }

  store.subscribe((_mutation, state) => {
    const stateToPersist = {};
    paths.forEach((path) => {
      const selected = readPath(state, path);
      if (selected.found) {
        writePath(stateToPersist, path, selected.value);
      }
    });
    writeStoredState(storage, key, stateToPersist);
  });
};

export default createPersistedState;
