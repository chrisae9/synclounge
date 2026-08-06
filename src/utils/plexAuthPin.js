const isValidPinId = (id) => {
  if (Number.isSafeInteger(id)) return id > 0;
  if (typeof id !== 'string' || !/^[1-9]\d*$/.test(id)) return false;
  return Number.isSafeInteger(Number(id));
};

const parseSavedPlexAuthPin = (serializedPin) => {
  try {
    const parsed = JSON.parse(serializedPin);
    if (!parsed || typeof parsed !== 'object' || !isValidPinId(parsed.id)) return null;
    return {
      id: parsed.id,
      redirect: typeof parsed.redirect === 'string' ? parsed.redirect : '/',
    };
  } catch {
    return null;
  }
};

export default parseSavedPlexAuthPin;
