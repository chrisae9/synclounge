function createDisconnectController(req, res) {
  const controller = new AbortController();
  const abort = () => controller.abort();

  req.once('aborted', abort);
  res.once('close', abort);

  if (req.aborted || req.destroyed || res.destroyed || res.writableEnded) {
    abort();
  }

  return {
    signal: controller.signal,
    cleanup() {
      req.removeListener('aborted', abort);
      res.removeListener('close', abort);
    },
  };
}

module.exports = { createDisconnectController };
