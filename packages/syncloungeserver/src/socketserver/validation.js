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

const assertUrlEncodableString = (eventName, fieldName, value, bounds) => {
  assertString(eventName, fieldName, value, bounds);
  try {
    encodeURIComponent(value);
  } catch {
    fail(eventName, `${fieldName} must contain well-formed Unicode`);
  }
};

const assertMetadataIdentifier = (eventName, fieldName, value) => {
  let validString = false;
  if (typeof value === 'string' && value.length > 0 && value.length <= 500) {
    try {
      encodeURIComponent(value);
      validString = true;
    } catch {
      validString = false;
    }
  }
  const validNumber = Number.isSafeInteger(value) && value >= 0;
  if (!validString && !validNumber) {
    fail(
      eventName,
      `${fieldName} must be a non-negative safe integer or a well-formed string up to 500 characters`,
    );
  }
};

const assertMedia = (eventName, media) => {
  assertObject(eventName, media);
  ['ratingKey', 'machineIdentifier'].forEach((fieldName) => {
    const value = media[fieldName];
    if (value == null) return;
    const validType = typeof value === 'string' || (Number.isSafeInteger(value) && value >= 0);
    if (!validType || !/^[A-Za-z0-9_-]{1,500}$/.test(String(value))) {
      fail(eventName, `media.${fieldName} must be a Plex identifier without URL syntax`);
    }
  });
  assertOptionalString(eventName, 'media.title', media.title, 1000);
  assertOptionalString(eventName, 'media.type', media.type, 64);
};

const MAX_METADATA_YEAR = 9999;
const MAX_METADATA_INDEX = 999_999_999_999;

const assertOptionalMetadataYear = (eventName, fieldName, value) => {
  if (value == null) return;
  const validString = typeof value === 'string' && /^\d{1,4}$/.test(value);
  const validNumber = Number.isSafeInteger(value) && value >= 0 && value <= MAX_METADATA_YEAR;
  if (!validString && !validNumber) {
    fail(eventName, `${fieldName} must be a year between 0 and ${MAX_METADATA_YEAR}`);
  }
};

const assertOptionalMetadataIndex = (eventName, fieldName, value) => {
  if (value == null) return;
  const validNumber = Number.isSafeInteger(value) && value >= 0 && value <= MAX_METADATA_INDEX;
  const validString = typeof value === 'string' && /^\d{1,12}$/.test(value);
  if (!validNumber && !validString) {
    fail(eventName, `${fieldName} must be a non-negative safe integer or numeric string`);
  }
};

const ROOM_PREVIEW_FIELDS = new Set([
  'title',
  'year',
  'summary',
  'type',
  'posterUrl',
  'machineIdentifier',
  'ratingKey',
  'grandparentTitle',
  'parentIndex',
  'index',
]);

const assertRoomPreview = (eventName, roomPreview, media) => {
  if (roomPreview == null) return;
  assertObject(eventName, roomPreview);
  const unexpectedField = Object.keys(roomPreview)
    .find((fieldName) => !ROOM_PREVIEW_FIELDS.has(fieldName));
  if (unexpectedField) {
    fail(eventName, `roomPreview.${unexpectedField} is not supported`);
  }

  assertMetadataIdentifier(eventName, 'roomPreview.machineIdentifier', roomPreview.machineIdentifier);
  assertMetadataIdentifier(eventName, 'roomPreview.ratingKey', roomPreview.ratingKey);
  assertObject(eventName, media);
  for (const fieldName of ['machineIdentifier', 'ratingKey']) {
    assertMetadataIdentifier(eventName, `media.${fieldName}`, media[fieldName]);
    if (String(media[fieldName]) !== String(roomPreview[fieldName])) {
      fail(eventName, `roomPreview.${fieldName} must match media.${fieldName}`);
    }
  }
  for (const fieldName of ['title', 'summary', 'type', 'grandparentTitle']) {
    assertOptionalString(eventName, `roomPreview.${fieldName}`, roomPreview[fieldName], 500);
  }
  assertOptionalString(eventName, 'roomPreview.posterUrl', roomPreview.posterUrl, 2048);
  assertOptionalMetadataYear(eventName, 'roomPreview.year', roomPreview.year);
  assertOptionalMetadataIndex(eventName, 'roomPreview.parentIndex', roomPreview.parentIndex);
  assertOptionalMetadataIndex(eventName, 'roomPreview.index', roomPreview.index);
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
  if (data.userInitiatedSeek !== undefined) {
    assertBoolean(eventName, 'userInitiatedSeek', data.userInitiatedSeek);
  }
};

const validators = {
  join: (eventName, data) => {
    assertPlayerState(eventName, data);
    assertUrlEncodableString(eventName, 'roomId', data.roomId, { min: 1, max: 256 });
    assertString(eventName, 'desiredUsername', data.desiredUsername, { min: 1, max: 128 });
    assertBoolean(eventName, 'desiredPartyPausingEnabled', data.desiredPartyPausingEnabled);
    assertBoolean(eventName, 'desiredAutoHostEnabled', data.desiredAutoHostEnabled);
    assertOptionalString(eventName, 'thumb', data.thumb, 2048);
    assertOptionalString(eventName, 'playerProduct', data.playerProduct, 128);
    if (data.media != null) {
      assertMedia(eventName, data.media);
    }
    assertRoomPreview(eventName, data.roomPreview, data.media);
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
      assertMedia(eventName, data.media);
    }
    assertRoomPreview(eventName, data.roomPreview, data.media);
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
  playbackDiagnostic: assertObject,
  kick: (eventName, data) => assertString(eventName, 'socketId', data, { min: 1, max: 256 }),
};

export const validateEvent = (eventName, data) => {
  const validator = validators[eventName];
  if (validator) {
    validator(eventName, data);
  }
};
