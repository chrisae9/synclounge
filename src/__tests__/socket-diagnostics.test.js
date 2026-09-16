import {
  beforeEach, afterEach, describe, it, expect, vi,
} from 'vitest';
import { open, close, waitForEvent } from '@/socket';
import { beginRecovery, connectionStatus } from '@/utils/connectionstatus';
import { rememberDiagnostic } from '@/utils/problemreport';

const mocks = vi.hoisted(() => {
  const handlers = {};
  const client = {
    on: vi.fn((event, callback) => { handlers[event] = callback; }),
    once: vi.fn((event, callback) => { handlers[event] = callback; }),
    close: vi.fn(),
    off: vi.fn(),
  };
  return { handlers, client, connect: vi.fn(() => client) };
});
vi.mock('socket.io-client', () => ({ connect: mocks.connect }));
vi.mock('@/utils/problemreport', () => ({ rememberDiagnostic: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(mocks.handlers).forEach((event) => { delete mocks.handlers[event]; });
});
afterEach(() => { close(); vi.useRealTimers(); });

describe('connection diagnostics', () => {
  it('cancels connection setup when closed before the client library resolves', async () => {
    const pending = open('https://fixture.invalid', { path: '/socket.io' });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    close();
    await rejected;
  }, 500);

  it('settles a cancelled handshake instead of leaving its caller waiting forever', async () => {
    const previousConnections = mocks.connect.mock.calls.length;
    const pending = open('https://fixture.invalid', { path: '/socket.io' });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(mocks.connect).toHaveBeenCalledTimes(previousConnections + 1));
    close();
    await rejected;
  }, 500);

  it('records unexpected disconnects but not intentional departures', async () => {
    const pending = open('https://fixture.invalid', { path: '/socket.io' });
    await vi.waitFor(() => expect(mocks.handlers.connect).toBeTypeOf('function'));
    mocks.handlers.connect();
    await pending;
    mocks.handlers.disconnect('io client disconnect');
    expect(rememberDiagnostic).not.toHaveBeenCalled();
    mocks.handlers.disconnect('transport close');
    expect(rememberDiagnostic).toHaveBeenCalledWith(expect.objectContaining({ event: 'connection-lost' }));
    close();
  });

  it('treats intentionally closed event waits as cancellation, not a new connection failure', async () => {
    const pending = open('https://fixture.invalid', { path: '/socket.io' });
    await vi.waitFor(() => expect(mocks.handlers.connect).toBeTypeOf('function'));
    mocks.handlers.connect();
    await pending;
    const waiting = waitForEvent('slPing', 100);
    const rejected = expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    mocks.handlers.disconnect('io client disconnect');
    await rejected;
  });

  it('cleans up a pending wait on its original socket after close', async () => {
    const previousConnections = mocks.connect.mock.calls.length;
    const pending = open('https://fixture.invalid', { path: '/socket.io' });
    await vi.waitFor(() => expect(mocks.connect).toHaveBeenCalledTimes(previousConnections + 1));
    mocks.handlers.connect();
    await pending;
    vi.useFakeTimers();
    const waiting = waitForEvent('joinResult', 100);
    const rejection = expect(waiting).rejects.toThrow('Timed out waiting for joinResult');
    close();
    await vi.advanceTimersByTimeAsync(100);
    await rejection;
    expect(mocks.client.off).toHaveBeenCalledWith('joinResult', expect.any(Function));
  });

  it('clears recovery after close synchronously emits disconnect', async () => {
    const previousConnections = mocks.connect.mock.calls.length;
    const pending = open('https://fixture.invalid', { path: '/socket.io' });
    await vi.waitFor(() => expect(mocks.connect).toHaveBeenCalledTimes(previousConnections + 1));
    mocks.handlers.connect();
    await pending;
    vi.useFakeTimers();
    mocks.client.close.mockImplementationOnce(() => beginRecovery());

    close();
    await vi.advanceTimersByTimeAsync(2000);

    expect(connectionStatus.recovering).toBe(false);
  });
});
