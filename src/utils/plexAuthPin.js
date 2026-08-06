const isValidPinId = (id) => (
  (typeof id === 'string' && id.length > 0)
  || (Number.isSafeInteger(id) && id > 0)
);

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
