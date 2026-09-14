import {
  afterEach, describe, it, expect, vi,
} from 'vitest';
import { open, close } from '@/socket';
import { beginRecovery, connectionStatus } from '@/utils/connectionstatus';
import { rememberDiagnostic } from '@/utils/problemreport';

const mocks = vi.hoisted(() => {
  const handlers = {};
  const client = {
    on: vi.fn((event, callback) => { handlers[event] = callback; }),
    once: vi.fn((event, callback) => { handlers[event] = callback; }),
    close: vi.fn(),
  };
  return { handlers, client, connect: vi.fn(() => client) };
});
vi.mock('socket.io-client', () => ({ connect: mocks.connect }));
vi.mock('@/utils/problemreport', () => ({ rememberDiagnostic: vi.fn() }));

afterEach(() => { close(); vi.useRealTimers(); });

describe('connection diagnostics', () => {
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
