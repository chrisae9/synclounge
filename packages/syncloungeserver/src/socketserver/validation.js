const PLAYER_STATES = new Set(['buffering', 'paused', 'playing', 'stopped']);

export class ValidationError extends Error {}

const fail = (eventName, message) => {
  throw new ValidationError(`${eventName}: ${message}`);
};

const assertObject = (eventName, value) => {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    fail(eventName, 'payload must be an object');
  }
};

const assertString = (eventName, fieldName, value, { min = 0, max }) => {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    fail(eventName, `${fieldName} must be a string between ${min} and ${max} characters`);
  }
};

const assertOptionalString = (eventName, fieldName, value, max) => {
  if (value != null) {
    assertString(eventName, fieldName, value, { max });
  }
};

const assertBoolean = (eventName, fieldName, value) => {
  if (typeof value !== 'boolean') {
    fail(eventName, `${fieldName} must be a boolean`);
  }
};

const assertFiniteNumber = (eventName, fieldName, value, { min, max }) => {
  if (!Number.isFinite(value) || value < min || value > max) {
    fail(eventName, `${fieldName} must be a finite number between ${min} and ${max}`);
  }
};

const assertPlayerState = (eventName, data) => {
  assertObject(eventName, data);
  if (!PLAYER_STATES.has(data.state)) {
    fail(eventName, 'state is not supported');
  }
  assertFiniteNumber(eventName, 'time', data.time, { min: 0, max: Number.MAX_SAFE_INTEGER });
  assertFiniteNumber(eventName, 'duration', data.duration, { min: 0, max: Number.MAX_SAFE_INTEGER });
  assertFiniteNumber(eventName, 'playbackRate', data.playbackRate, { min: 0, max: 16 });
};

const validators = {
  join: (eventName, data) => {
    assertPlayerState(eventName, data);
    assertString(eventName, 'roomId', data.roomId, { min: 1, max: 256 });
    assertString(eventName, 'desiredUsername', data.desiredUsername, { min: 1, max: 128 });
    assertBoolean(eventName, 'desiredPartyPausingEnabled', data.desiredPartyPausingEnabled);
    assertBoolean(eventName, 'desiredAutoHostEnabled', data.desiredAutoHostEnabled);
    assertOptionalString(eventName, 'thumb', data.thumb, 2048);
    assertOptionalString(eventName, 'playerProduct', data.playerProduct, 128);
    if (data.media != null) {
      assertObject(eventName, data.media);
    }
    assertFiniteNumber(eventName, 'syncFlexibility', data.syncFlexibility, {
      min: 0,
      max: 60 * 60 * 1000,
    });
  },
  slPong: (eventName, data) => assertString(eventName, 'secret', data, { min: 1, max: 128 }),
  playerStateUpdate: assertPlayerState,
  mediaUpdate: (eventName, data) => {
    assertPlayerState(eventName, data);
    if (data.media != null) {
      assertObject(eventName, data.media);
    }
    if (data.userInitiated != null) {
      assertBoolean(eventName, 'userInitiated', data.userInitiated);
    }
  },
  syncFlexibilityUpdate: (eventName, data) => assertFiniteNumber(eventName, 'syncFlexibility', data, {
    min: 0,
    max: 60 * 60 * 1000,
  }),
  transferHost: (eventName, data) => assertString(eventName, 'socketId', data, { min: 1, max: 256 }),
  sendMessage: (eventName, data) => assertString(eventName, 'text', data, { min: 1, max: 2000 }),
  setPartyPausingEnabled: (eventName, data) => assertBoolean(eventName, 'enabled', data),
  setAutoHostEnabled: (eventName, data) => assertBoolean(eventName, 'enabled', data),
  partyPause: (eventName, data) => assertBoolean(eventName, 'isPause', data),
  partyPauseAck: (eventName, data) => {
    assertObject(eventName, data);
    assertString(eventName, 'requestId', data.requestId, { min: 1, max: 512 });
  },
  kick: (eventName, data) => assertString(eventName, 'socketId', data, { min: 1, max: 256 }),
};

export const validateEvent = (eventName, data) => {
  const validator = validators[eventName];
  if (validator) {
    validator(eventName, data);
  }
};
