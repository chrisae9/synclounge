const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { createDisconnectController } = require('../request-abort');

function createStream(properties = {}) {
  return Object.assign(new EventEmitter(), properties);
}

describe('request disconnect cancellation', () => {
  it('is aborted before upstream work starts when the request already disconnected', () => {
    const req = createStream({ aborted: true, destroyed: true });
    const res = createStream({ destroyed: false, writableEnded: false });

    const disconnect = createDisconnectController(req, res);

    assert.equal(disconnect.signal.aborted, true);
    disconnect.cleanup();
    assert.equal(req.listenerCount('aborted'), 0);
    assert.equal(res.listenerCount('close'), 0);
  });

  it('aborts future upstream work when the request is aborted', () => {
    const req = createStream({ aborted: false, destroyed: false });
    const res = createStream({ destroyed: false, writableEnded: false });

    const disconnect = createDisconnectController(req, res);
    assert.equal(disconnect.signal.aborted, false);

    req.emit('aborted');
    assert.equal(disconnect.signal.aborted, true);

    disconnect.cleanup();
    assert.equal(req.listenerCount('aborted'), 0);
    assert.equal(res.listenerCount('close'), 0);
  });

  it('aborts future upstream work when the response closes', () => {
    const req = createStream({ aborted: false, destroyed: false });
    const res = createStream({ destroyed: false, writableEnded: false });

    const disconnect = createDisconnectController(req, res);
    res.emit('close');

    assert.equal(disconnect.signal.aborted, true);
    disconnect.cleanup();
  });
});
