import { describe, expect, it, vi } from 'vitest';
import { ActivityTracker, IDLE_MS, isActive } from '../src/lib/activityTracker';

function setup(overrides: Partial<ConstructorParameters<typeof ActivityTracker>[0]> = {}) {
  let now = 1_000_000;
  let visible = true;
  let starts = 0;
  const deps = {
    now: () => now,
    isVisible: () => visible,
    clientId: 'tab-test-0001',
    startSession: vi.fn(async (): Promise<string> => `s${++starts}`),
    heartbeat: vi.fn(async () => ({ status: 'ok' as const })),
    endSession: vi.fn(async () => {}),
    ...overrides,
  };
  const t = new ActivityTracker(deps);
  return { t, deps, advance: (ms: number) => { now += ms; }, setVisible: (v: boolean) => { visible = v; } };
}

describe('isActive', () => {
  it('requires a visible tab and recent input', () => {
    expect(isActive(100_000, 90_000, true)).toBe(true);
    expect(isActive(100_000, 90_000, false)).toBe(false);
    expect(isActive(100_000, 100_000 - IDLE_MS, true)).toBe(false);
  });
});

describe('ActivityTracker', () => {
  it('sends heartbeats only while the learner is active', async () => {
    const { t, deps, advance } = setup();
    await t.start();
    advance(30_000); t.markActive();
    expect(await t.tick()).toBe(true);
    advance(30_000);                 // 30 s since input: still active
    expect(await t.tick()).toBe(true);
    advance(31_000);                 // 61 s since input: idle
    expect(await t.tick()).toBe(false);
    advance(300_000);
    expect(await t.tick()).toBe(false);
    expect(deps.heartbeat).toHaveBeenCalledTimes(2);
  });
  it('sends nothing while the tab is hidden', async () => {
    const { t, deps, setVisible } = setup();
    await t.start(); t.markActive(); setVisible(false);
    expect(await t.tick()).toBe(false);
    expect(deps.heartbeat).not.toHaveBeenCalled();
  });
  it('starts a new session when the server says the old one ended', async () => {
    const { t, deps, advance } = setup({ heartbeat: vi.fn(async () => ({ status: 'ended' as const })) });
    await t.start(); advance(1000); t.markActive();
    await t.tick();
    expect(deps.startSession).toHaveBeenCalledTimes(2);
    expect(t.currentSessionId).toBe('s2');
  });
  it('survives network errors and retries on the next tick', async () => {
    const onError = vi.fn();
    let fail = true;
    const { t, deps } = setup({ onError, heartbeat: vi.fn(async () => { if (fail) throw new Error('offline'); return { status: 'ok' as const }; }) });
    await t.start(); t.markActive();
    expect(await t.tick()).toBe(false);
    expect(onError).toHaveBeenCalled();
    fail = false;
    expect(await t.tick()).toBe(true);
    expect(deps.heartbeat).toHaveBeenCalledTimes(2);
  });
  it('ends the session once on logout and stops ticking', async () => {
    const { t, deps } = setup();
    await t.start(); t.markActive();
    await t.stop('logout');
    await t.stop('logout');
    expect(deps.endSession).toHaveBeenCalledTimes(1);
    expect(deps.endSession).toHaveBeenCalledWith('s1', 'logout', false);
    expect(await t.tick()).toBe(false);
  });
  it('does not overlap heartbeats', async () => {
    let release!: () => void;
    const { t, deps } = setup({ heartbeat: vi.fn(() => new Promise<{ status: 'ok' }>((r) => { release = () => r({ status: 'ok' }); })) });
    await t.start(); t.markActive();
    const first = t.tick();
    expect(await t.tick()).toBe(false);
    release(); await first;
    expect(deps.heartbeat).toHaveBeenCalledTimes(1);
  });
});
