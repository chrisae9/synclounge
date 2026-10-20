// Playback may advance while a seek settles. A seeked event alone does not
// guarantee that a decoder accepted the requested position (DASH gaps can clamp it).
const isSeekLandingValid = ({
  target, actual, elapsedMs, paused, rate = 1, tolerance = 250,
}) => {
  if (![target, actual, elapsedMs, rate, tolerance].every(Number.isFinite)
    || target < 0 || actual < 0 || elapsedMs < 0 || rate <= 0 || tolerance < 0) return false;
  const progress = paused ? 0 : elapsedMs * rate;
  return actual >= target - tolerance && actual <= target + progress + tolerance;
};

export default isSeekLandingValid;
