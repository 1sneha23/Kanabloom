// Client side of active-learning-time tracking. The server (heartbeat RPC) decides how much
// time to credit; this class only decides WHETHER the learner is active enough to send a beat.
//
//  * Active = tab visible AND user input (or media playing) within the last IDLE_MS.
//  * One heartbeat every BEAT_MS while active. Idle or hidden tabs send nothing, so idle time is never credited.
//  * Only one tab per browser tracks (Web Locks), so duplicate tabs never double-count.
//  * The tab's clientId lives in sessionStorage, so a reload resumes the same server session.
//  * pagehide sends a keepalive end_session; if that is lost, the server times the session out
//    at its last heartbeat, so a closed browser never accrues extra time.

export const BEAT_MS = 30_000;
export const IDLE_MS = 60_000;

export interface TrackerDeps {
  now: () => number;
  isVisible: () => boolean;
  startSession: (clientId: string) => Promise<string>;
  heartbeat: (sessionId: string) => Promise<{ status: 'ok' | 'ended' }>;
  endSession: (sessionId: string, reason: 'logout' | 'closed', keepalive: boolean) => Promise<void>;
  clientId: string;
  onError?: (e: unknown) => void;
}

export function isActive(now: number, lastInput: number, visible: boolean, idleMs = IDLE_MS): boolean {
  return visible && now - lastInput < idleMs;
}

export class ActivityTracker {
  private sessionId: string | null = null;
  private lastInput: number;
  private stopped = false;
  private beating = false;

  constructor(private deps: TrackerDeps) {
    this.lastInput = deps.now();
  }

  get currentSessionId() { return this.sessionId; }

  markActive() { this.lastInput = this.deps.now(); }

  async start() {
    this.stopped = false;
    this.sessionId = await this.deps.startSession(this.deps.clientId);
  }

  /** Called on every BEAT_MS tick. Returns true if a heartbeat was sent. */
  async tick(): Promise<boolean> {
    if (this.stopped || this.beating) return false;
    if (!isActive(this.deps.now(), this.lastInput, this.deps.isVisible())) return false;
    this.beating = true;
    try {
      if (!this.sessionId) await this.start();
      const res = await this.deps.heartbeat(this.sessionId!);
      if (res.status === 'ended') {
        // Superseded or timed out (e.g. laptop slept). Start a fresh session; nothing is back-credited.
        await this.start();
      }
      return true;
    } catch (e) {
      this.deps.onError?.(e); // network blip: next tick retries; the server ignores long gaps
      return false;
    } finally {
      this.beating = false;
    }
  }

  async stop(reason: 'logout' | 'closed', keepalive = false) {
    this.stopped = true;
    const sid = this.sessionId;
    this.sessionId = null;
    if (sid) {
      try { await this.deps.endSession(sid, reason, keepalive); } catch (e) { this.deps.onError?.(e); }
    }
  }
}
