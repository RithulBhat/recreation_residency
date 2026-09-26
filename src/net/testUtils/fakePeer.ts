/**
 * In-process PeerJS stand-in: two (or more) peers that talk to each other through a fake
 * signalling registry with asynchronous delivery. Used by the duel tests so nothing touches the
 * network, and available to dev harnesses that want a second player without a second browser.
 *
 * Messages are cloned through JSON on the way out, exactly like a real data channel, so a test
 * fails loudly if a payload is not serialisable.
 *
 * ```ts
 * const net = createFakeNetwork();
 * const host = createDuelSession({ role: 'host', code: 'ABCDEF', me: hostMe, peerFactory: net.peerFactory });
 * const guest = createDuelSession({ role: 'guest', code: 'ABCDEF', me: guestMe, peerFactory: net.peerFactory });
 * await net.flush();   // real timers only — under fake timers use vi.advanceTimersByTimeAsync
 * ```
 */

import type { ConnLike, NetErrorLike, PeerFactory, PeerLike } from '../duel';

type Listener = (...args: never[]) => void;

class Emitter {
  private readonly map = new Map<string, Set<Listener>>();

  add(event: string, cb: Listener): void {
    const set = this.map.get(event) ?? new Set<Listener>();
    this.map.set(event, set);
    set.add(cb);
  }

  fire(event: string, ...args: unknown[]): void {
    const set = this.map.get(event);
    if (!set) return;
    for (const cb of Array.from(set)) (cb as unknown as (...a: unknown[]) => void)(...args);
  }

  clear(): void {
    this.map.clear();
  }
}

function clone(data: unknown): unknown {
  return JSON.parse(JSON.stringify(data)) as unknown;
}

export class FakeConn implements ConnLike {
  open = false;
  closed = false;
  /** Everything this side has sent, for assertions. */
  readonly sent: unknown[] = [];
  partner: FakeConn | null = null;
  private readonly bus = new Emitter();

  constructor(
    private readonly net: FakeNetwork,
    /** id of the peer that owns this end */
    readonly ownerId: string,
    /** id of the peer on the other end */
    readonly peer: string,
  ) {}

  send(data: unknown): void {
    if (!this.open || this.closed) return;
    this.sent.push(data);
    if (this.net.isMuted(this.ownerId)) return;
    const payload = clone(data);
    this.net.deliver(() => {
      const other = this.partner;
      if (other && other.open) other.bus.fire('data', payload);
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.open = false;
    this.bus.fire('close');
    const other = this.partner;
    this.net.deliver(() => {
      if (other && !other.closed) other.forceClose();
    });
  }

  on(event: 'open', cb: () => void): void;
  on(event: 'data', cb: (data: unknown) => void): void;
  on(event: 'close', cb: () => void): void;
  on(event: 'error', cb: (err: NetErrorLike) => void): void;
  on(event: string, cb: Listener): void {
    this.bus.add(event, cb);
  }

  /** @internal — the network opens both ends together. */
  forceOpen(): void {
    if (this.closed || this.open) return;
    this.open = true;
    this.bus.fire('open');
  }

  /** @internal */
  forceClose(): void {
    if (this.closed) return;
    this.closed = true;
    this.open = false;
    this.bus.fire('close');
  }

  /** Simulate a data-channel error on this end. */
  emitError(type: string, message = type): void {
    this.bus.fire('error', { type, message });
  }
}

export class FakePeer implements PeerLike {
  open = false;
  destroyed = false;
  reconnectCount = 0;
  readonly conns: FakeConn[] = [];
  private readonly bus = new Emitter();

  constructor(
    private readonly net: FakeNetwork,
    readonly id: string,
  ) {}

  connect(peerId: string, _options?: { reliable?: boolean }): ConnLike {
    const local = new FakeConn(this.net, this.id, peerId);
    this.conns.push(local);
    this.net.deliver(() => {
      const remote = this.net.peers.get(peerId);
      if (this.destroyed || local.closed) return;
      if (!remote || remote.destroyed || !remote.open) {
        this.bus.fire('error', { type: 'peer-unavailable', message: `Could not connect to peer ${peerId}` });
        return;
      }
      const other = new FakeConn(this.net, remote.id, this.id);
      remote.conns.push(other);
      local.partner = other;
      other.partner = local;
      remote.acceptConnection(other);
      this.net.deliver(() => {
        other.forceOpen();
        local.forceOpen();
      });
    });
    return local;
  }

  reconnect(): void {
    this.reconnectCount++;
    this.net.deliver(() => {
      if (this.destroyed) return;
      this.open = true;
      this.bus.fire('open', this.id);
    });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.open = false;
    for (const c of this.conns) c.close();
    if (this.net.peers.get(this.id) === this) this.net.peers.delete(this.id);
    this.bus.fire('close');
    this.bus.clear();
  }

  on(event: 'open', cb: (id: string) => void): void;
  on(event: 'connection', cb: (conn: ConnLike) => void): void;
  on(event: 'disconnected', cb: (currentId: string) => void): void;
  on(event: 'close', cb: () => void): void;
  on(event: 'error', cb: (err: NetErrorLike) => void): void;
  on(event: string, cb: Listener): void {
    this.bus.add(event, cb);
  }

  /** @internal */
  acceptConnection(conn: FakeConn): void {
    this.bus.fire('connection', conn);
  }

  /** @internal */
  forceOpen(): void {
    if (this.destroyed || this.open) return;
    this.open = true;
    this.bus.fire('open', this.id);
  }

  /** Simulate losing the signalling socket (PeerJS 'disconnected'). */
  emitDisconnected(): void {
    this.open = false;
    this.bus.fire('disconnected', this.id);
  }

  /** Simulate a PeerJS peer error, e.g. 'network' or 'unavailable-id'. */
  emitError(type: string, message = type): void {
    this.bus.fire('error', { type, message });
  }
}

export interface FakeNetworkOptions {
  /** Peer ids that are already claimed — claiming them yields 'unavailable-id'. */
  taken?: readonly string[];
  /** Every id is taken (to exercise the host's retry ceiling). */
  takeAll?: boolean;
  /** Deliver over `setTimeout(delayMs)` instead of a microtask (simulated latency). */
  delayMs?: number;
}

export class FakeNetwork {
  readonly peers = new Map<string, FakePeer>();
  /** Every peer ever created, in order. */
  readonly created: FakePeer[] = [];
  private readonly taken = new Set<string>();
  private readonly muted = new Set<string>();
  private readonly delayMs: number;
  private readonly takeAll: boolean;
  private pending = 0;
  private anonymous = 0;

  constructor(options: FakeNetworkOptions = {}) {
    this.delayMs = options.delayMs ?? 0;
    this.takeAll = options.takeAll === true;
    for (const id of options.taken ?? []) this.taken.add(id);
  }

  /** Pass as `peerFactory` to `createDuelSession`. */
  readonly peerFactory: PeerFactory = (id) => {
    const peerId = id ?? `anon-${++this.anonymous}`;
    const peer = new FakePeer(this, peerId);
    this.created.push(peer);
    const clash = this.takeAll || this.taken.has(peerId) || this.peers.has(peerId);
    if (clash) {
      this.deliver(() => peer.emitError('unavailable-id', `ID "${peerId}" is taken`));
      return peer;
    }
    this.peers.set(peerId, peer);
    this.deliver(() => peer.forceOpen());
    return peer;
  };

  /** Mark an id as already registered on the signalling server. */
  take(id: string): void {
    this.taken.add(id);
  }

  /** Stop delivering anything this peer sends (simulates a silent, half-dead connection). */
  mute(id: string): void {
    this.muted.add(id);
  }

  unmute(id: string): void {
    this.muted.delete(id);
  }

  isMuted(id: string): boolean {
    return this.muted.has(id);
  }

  /** @internal */
  deliver(fn: () => void): void {
    this.pending++;
    const run = (): void => {
      this.pending--;
      fn();
    };
    if (this.delayMs > 0) setTimeout(run, this.delayMs);
    else void Promise.resolve().then(run);
  }

  /** Drain every queued delivery (real timers only). */
  async flush(): Promise<void> {
    for (let i = 0; i < 500 && this.pending > 0; i++) {
      if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
      else await Promise.resolve();
    }
    // One extra turn so handlers scheduled by the last delivery also run.
    await Promise.resolve();
  }

  peer(id: string): FakePeer | undefined {
    return this.peers.get(id);
  }
}

export function createFakeNetwork(options: FakeNetworkOptions = {}): FakeNetwork {
  return new FakeNetwork(options);
}
