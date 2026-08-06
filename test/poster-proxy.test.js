const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {
  fetchPoster,
  PosterProxyError,
  isPrivateAddress,
  resolvePosterTarget,
} = require('../poster-proxy');

describe('poster proxy network validation', () => {
  it('classifies private and special-use IPv4 and IPv6 addresses', () => {
    const blocked = [
      '0.0.0.0',
      '10.0.0.1',
      '100.64.0.1',
      '127.0.0.1',
      '169.254.169.254',
      '172.16.0.1',
      '192.168.0.1',
      '::',
      '::1',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '64:ff9b::7f00:1',
      '2002:7f00:1::',
      'fc00::1',
      'fe80::1',
      '2001:db8::1',
    ];
    blocked.forEach((address) => assert.equal(isPrivateAddress(address), true, address));
    assert.equal(isPrivateAddress('1.1.1.1'), false);
    assert.equal(isPrivateAddress('2606:4700:4700::1111'), false);
  });

  it('rejects a hostname when DNS resolves only to a private address', async () => {
    const lookup = async () => [{ address: '127.0.0.1', family: 4 }];
    await assert.rejects(
      resolvePosterTarget('https://poster.example/image.jpg', { lookup }),
      (error) => error instanceof PosterProxyError && error.statusCode === 403,
    );
  });

  it('pins the outbound request to the approved DNS answer', async () => {
    let receivedRequest = false;
    const fixture = http.createServer((req, res) => {
      receivedRequest = true;
      res.writeHead(200, { 'Content-Type': 'image/jpeg' });
      res.end(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    });
    await new Promise((resolve) => {
      fixture.listen(0, '127.0.0.1', resolve);
    });

    try {
      const origin = `http://poster.example:${fixture.address().port}`;
      let lookupCount = 0;
      const lookup = async (hostname) => {
        lookupCount += 1;
        assert.equal(hostname, 'poster.example');
        if (lookupCount > 1) throw new Error('hostname was resolved more than once');
        return [{ address: '127.0.0.1', family: 4 }];
      };

      const poster = await fetchPoster(`${origin}/image.jpg`, {
        lookup,
        allowedPrivateOrigin: origin,
      });
      assert.equal(receivedRequest, true);
      assert.equal(lookupCount, 1);
      assert.equal(poster.contentType, 'image/jpeg');
      assert.deepEqual(poster.body, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    } finally {
      await new Promise((resolve) => {
        fixture.close(resolve);
      });
    }
  });

  it('rejects non-HTTP protocols and credential-bearing URLs', async () => {
    await assert.rejects(resolvePosterTarget('file:///etc/passwd'), PosterProxyError);
    await assert.rejects(
      resolvePosterTarget('https://user:password@example.com/image.jpg'),
      PosterProxyError,
    );
  });

  it('closes rejected upstream responses instead of draining their bodies', async () => {
    let closedResolve;
    const closed = new Promise((resolve) => {
      closedResolve = resolve;
    });
    const fixture = http.createServer((req, res) => {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      const interval = setInterval(() => res.write(Buffer.alloc(1024)), 10);
      res.on('close', () => {
        clearInterval(interval);
        closedResolve();
      });
    });
    await new Promise((resolve) => fixture.listen(0, '127.0.0.1', resolve));

    try {
      const origin = `http://poster.example:${fixture.address().port}`;
      await assert.rejects(fetchPoster(`${origin}/missing`, {
        lookup: async () => [{ address: '127.0.0.1', family: 4 }],
        allowedPrivateOrigin: origin,
      }), /returned 404/);
      await Promise.race([
        closed,
        new Promise((resolve, reject) => setTimeout(
          () => reject(new Error('upstream response was not closed')),
          500,
        )),
      ]);
    } finally {
      await new Promise((resolve) => fixture.close(resolve));
    }
  });

  it('enforces a total deadline even when the upstream keeps sending data', async () => {
    const fixture = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/jpeg' });
      const interval = setInterval(() => res.write(Buffer.from([0xff])), 10);
      res.on('close', () => clearInterval(interval));
    });
    await new Promise((resolve) => fixture.listen(0, '127.0.0.1', resolve));

    try {
      const origin = `http://poster.example:${fixture.address().port}`;
      await assert.rejects(fetchPoster(`${origin}/slow`, {
        lookup: async () => [{ address: '127.0.0.1', family: 4 }],
        allowedPrivateOrigin: origin,
        timeoutMs: 50,
      }), /timed out/);
    } finally {
      await new Promise((resolve) => fixture.close(resolve));
    }
  });
});
