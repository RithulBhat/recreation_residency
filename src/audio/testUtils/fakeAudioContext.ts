/**
 * Minimal in-memory stand-in for the Web Audio API. jsdom has no Web Audio, so the audio module's
 * tests drive this instead. Only the surface the module uses is implemented; nodes record their
 * connections and AudioParams record their automation calls so tests can assert on the graph.
 */

export interface ParamCall {
  method: string;
  args: number[];
}

export class FakeAudioParam {
  readonly calls: ParamCall[] = [];
  constructor(public value = 1) {}
  private record(method: string, args: number[], value?: number): this {
    this.calls.push({ method, args });
    if (value !== undefined) this.value = value;
    return this;
  }
  setValueAtTime(v: number, t: number): this {
    return this.record('setValueAtTime', [v, t], v);
  }
  linearRampToValueAtTime(v: number, t: number): this {
    return this.record('linearRampToValueAtTime', [v, t], v);
  }
  exponentialRampToValueAtTime(v: number, t: number): this {
    return this.record('exponentialRampToValueAtTime', [v, t], v);
  }
  setTargetAtTime(v: number, t: number, tc: number): this {
    return this.record('setTargetAtTime', [v, t, tc], v);
  }
  cancelScheduledValues(t: number): this {
    return this.record('cancelScheduledValues', [t]);
  }
  cancelAndHoldAtTime(t: number): this {
    return this.record('cancelAndHoldAtTime', [t]);
  }
  /** Last value passed to a scheduling call of `method`. */
  lastArg(method: string): number | undefined {
    for (let i = this.calls.length - 1; i >= 0; i--) if (this.calls[i].method === method) return this.calls[i].args[0];
    return undefined;
  }
}

export class FakeAudioNode {
  readonly outputs = new Set<FakeAudioNode>();
  constructor(
    readonly context: FakeAudioContext,
    readonly kind: string,
  ) {
    context.nodes.push(this);
  }
  connect(dest: FakeAudioNode): FakeAudioNode {
    this.outputs.add(dest);
    return dest;
  }
  disconnect(dest?: FakeAudioNode): void {
    if (dest) this.outputs.delete(dest);
    else this.outputs.clear();
  }
  /** True when `target` is reachable downstream of this node. */
  reaches(target: FakeAudioNode, seen = new Set<FakeAudioNode>()): boolean {
    if (this === target) return true;
    if (seen.has(this)) return false;
    seen.add(this);
    for (const out of this.outputs) if (out.reaches(target, seen)) return true;
    return false;
  }
  /** Node kinds along the single-output path starting here (stops at a fan-out or dead end). */
  pathKinds(limit = 32): string[] {
    const kinds: string[] = [];
    let node: FakeAudioNode | undefined = this;
    while (node && kinds.length < limit) {
      kinds.push(node.kind);
      node = node.outputs.size === 1 ? node.outputs.values().next().value : undefined;
    }
    return kinds;
  }
}

export class FakeGainNode extends FakeAudioNode {
  readonly gain = new FakeAudioParam(1);
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'gain');
  }
}

export class FakeBiquadFilterNode extends FakeAudioNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeAudioParam(350);
  readonly Q = new FakeAudioParam(1);
  readonly gain = new FakeAudioParam(0);
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'biquad');
  }
}

export class FakeWaveShaperNode extends FakeAudioNode {
  curve: Float32Array | null = null;
  oversample: OverSampleType = 'none';
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'waveshaper');
  }
}

export class FakeAnalyserNode extends FakeAudioNode {
  fftSize = 2048;
  smoothingTimeConstant = 0.8;
  minDecibels = -100;
  maxDecibels = -30;
  /** Byte spectrum returned by getByteFrequencyData (missing bins read 0). */
  spectrum: number[] = [];
  /** Byte waveform returned by getByteTimeDomainData (missing samples read 128). */
  waveform: number[] = [];
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'analyser');
  }
  get frequencyBinCount(): number {
    return this.fftSize / 2;
  }
  getByteFrequencyData(array: Uint8Array): void {
    for (let i = 0; i < array.length; i++) array[i] = this.spectrum[i] ?? 0;
  }
  getByteTimeDomainData(array: Uint8Array): void {
    for (let i = 0; i < array.length; i++) array[i] = this.waveform[i] ?? 128;
  }
}

export class FakeAudioBuffer {
  private readonly channels: Array<Float32Array | null>;
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    // Channel data is allocated lazily so tests can "decode" many 30 s buffers cheaply.
    this.channels = new Array<Float32Array | null>(numberOfChannels).fill(null);
  }
  get duration(): number {
    return this.length / this.sampleRate;
  }
  getChannelData(channel: number): Float32Array {
    let data = this.channels[channel];
    if (!data) {
      data = new Float32Array(this.length);
      this.channels[channel] = data;
    }
    return data;
  }
  copyToChannel(source: Float32Array, channel: number, startInChannel = 0): void {
    this.getChannelData(channel).set(source, startInChannel);
  }
  copyFromChannel(destination: Float32Array, channel: number, startInChannel = 0): void {
    destination.set(this.getChannelData(channel).subarray(startInChannel, startInChannel + destination.length));
  }
}

export class FakeScheduledSource extends FakeAudioNode {
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  ended = false;
  onended: ((ev: Event) => void) | null = null;
  start(when = 0): void {
    if (this.startedAt !== null) throw new Error('InvalidStateError: start() called twice');
    this.startedAt = when;
  }
  stop(when = 0): void {
    if (this.startedAt === null) throw new Error('InvalidStateError: stop() before start()');
    this.stoppedAt = when;
  }
  /** Simulate the node reaching the end of its scheduled playback. */
  endNow(): void {
    if (this.ended) return;
    this.ended = true;
    this.onended?.(new Event('ended'));
  }
}

export class FakeAudioBufferSourceNode extends FakeScheduledSource {
  buffer: FakeAudioBuffer | null = null;
  loop = false;
  readonly playbackRate = new FakeAudioParam(1);
  readonly detune = new FakeAudioParam(0);
  startOffset: number | undefined;
  startDuration: number | undefined;
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'buffersource');
  }
  override start(when = 0, offset?: number, duration?: number): void {
    super.start(when);
    this.startOffset = offset;
    this.startDuration = duration;
  }
}

export class FakeOscillatorNode extends FakeScheduledSource {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeAudioParam(440);
  readonly detune = new FakeAudioParam(0);
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'oscillator');
  }
}

export class FakeAudioContext {
  currentTime = 0;
  readonly sampleRate = 48000;
  readonly baseLatency = 0.005;
  state: AudioContextState = 'suspended';
  readonly nodes: FakeAudioNode[] = [];
  readonly destination: FakeAudioNode;
  resumeCalls = 0;
  decodeCalls = 0;
  /** Length in seconds of buffers produced by decodeAudioData. */
  decodeDurationSec = 30;
  /** When set, decodeAudioData fails with this error. */
  decodeError: Error | null = null;
  /** 'callback' mimics old Safari: decodeAudioData returns undefined and only calls the callbacks. */
  decodeStyle: 'promise' | 'callback' = 'promise';

  constructor() {
    this.destination = new FakeAudioNode(this, 'destination');
  }

  resume(): Promise<void> {
    this.resumeCalls++;
    if (this.state !== 'closed') this.state = 'running';
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.state = 'suspended';
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }

  createGain(): FakeGainNode {
    return new FakeGainNode(this);
  }
  createBiquadFilter(): FakeBiquadFilterNode {
    return new FakeBiquadFilterNode(this);
  }
  createWaveShaper(): FakeWaveShaperNode {
    return new FakeWaveShaperNode(this);
  }
  createAnalyser(): FakeAnalyserNode {
    return new FakeAnalyserNode(this);
  }
  createBufferSource(): FakeAudioBufferSourceNode {
    return new FakeAudioBufferSourceNode(this);
  }
  createOscillator(): FakeOscillatorNode {
    return new FakeOscillatorNode(this);
  }
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): FakeAudioBuffer {
    return new FakeAudioBuffer(numberOfChannels, length, sampleRate);
  }

  decodeAudioData(
    _data: ArrayBuffer,
    onSuccess?: ((buffer: AudioBuffer) => void) | null,
    onError?: ((error: Error) => void) | null,
  ): Promise<AudioBuffer> | undefined {
    this.decodeCalls++;
    const error = this.decodeError;
    const buffer = new FakeAudioBuffer(2, Math.round(this.decodeDurationSec * this.sampleRate), this.sampleRate) as unknown as AudioBuffer;
    if (this.decodeStyle === 'callback') {
      queueMicrotask(() => {
        if (error) onError?.(error);
        else onSuccess?.(buffer);
      });
      return undefined;
    }
    if (error) {
      onError?.(error);
      return Promise.reject(error);
    }
    onSuccess?.(buffer);
    return Promise.resolve(buffer);
  }

  // ---- test helpers

  /** Buffer sources that were started, have a real (non-unlock) buffer and have not ended. */
  get liveSources(): FakeAudioBufferSourceNode[] {
    return this.nodes.filter(
      (n): n is FakeAudioBufferSourceNode =>
        n instanceof FakeAudioBufferSourceNode && n.startedAt !== null && !n.ended && (n.buffer?.length ?? 0) > 1,
    );
  }
  get oscillators(): FakeOscillatorNode[] {
    return this.nodes.filter((n): n is FakeOscillatorNode => n instanceof FakeOscillatorNode);
  }
  get analysers(): FakeAnalyserNode[] {
    return this.nodes.filter((n): n is FakeAnalyserNode => n instanceof FakeAnalyserNode);
  }
  /** Fire `onended` on every live source (as if the clock passed their end time). */
  endAllSources(): void {
    for (const src of this.liveSources) src.endNow();
  }
  advance(seconds: number): void {
    this.currentTime += seconds;
  }
  /** The only cast tests need: hand the fake to code typed against the real API. */
  asAudioContext(): AudioContext {
    return this as unknown as AudioContext;
  }
}
