const INPUT_SAMPLE_RATE = 16_000;
const OUTPUT_SAMPLE_RATE = 24_000;

/**
 * Plays streamed 24 kHz PCM chunks back to back. Each chunk is buffered until
 * the first one starts, so consecutive chunks never overlap or gap.
 */
export class PcmPlayer {
  private context: AudioContext | null = null;
  private nextStart = 0;
  private readonly sources = new Set<AudioBufferSourceNode>();

  constructor(private readonly AudioContextImpl: typeof AudioContext = AudioContext) {}

  play(base64: string): void {
    const context = (this.context ??= new this.AudioContextImpl({
      sampleRate: OUTPUT_SAMPLE_RATE,
    }));
    if (context.state === "suspended") void context.resume().catch(() => {});

    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const samples = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
    const buffer = context.createBuffer(1, samples.length, OUTPUT_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);

    for (let i = 0; i < samples.length; i++) {
      channel[i] = (samples[i] ?? 0) / 32768;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const startAt = Math.max(context.currentTime, this.nextStart);
    source.start(startAt);
    this.nextStart = startAt + buffer.duration;

    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
  }

  /** Drops queued audio without tearing the context down (barge-in). */
  flush(): void {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* Already stopped. */
      }
    }

    this.sources.clear();
    this.nextStart = 0;
  }

  stop(): void {
    this.flush();
    const context = this.context;
    this.context = null;
    if (context) void context.close().catch(() => {});
  }
}

/** Resamples to 16 kHz and quantises to signed 16-bit PCM. */
export function toPcm16(float32: Float32Array, fromRate: number): Int16Array {
  const ratio = fromRate / INPUT_SAMPLE_RATE;
  const length = Math.floor(float32.length / ratio);
  const output = new Int16Array(length);

  for (let i = 0; i < length; i++) {
    const sample = float32[Math.floor(i * ratio)] ?? 0;
    const clamped = Math.max(-1, Math.min(1, sample));
    output[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }

  return output;
}

export function toBase64(bytes: Int16Array): string {
  const view = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let binary = "";

  // ponytail: per-byte loop; swap for a chunked apply() if profiling says so.
  for (let i = 0; i < view.length; i++) {
    binary += String.fromCharCode(view[i] ?? 0);
  }

  return btoa(binary);
}

/**
 * Realtime server frames are JSON, but the browser hands them over as a string,
 * a Blob, or an ArrayBuffer depending on `binaryType` and the user agent.
 */
export async function readFrame(data: unknown): Promise<string | null> {
  if (typeof data === "string") return data;
  if (data instanceof Blob) return data.text();
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  }
  return null;
}

export type MicrophoneCapture = {
  stop(): void;
};

/**
 * Streams microphone audio as base64 PCM16 chunks of `chunkSamples`. The input
 * is resampled once per window and then cut, because resampling a pre-cut chunk
 * would change its length.
 */
export function startMicrophone(options: {
  stream: MediaStream;
  chunkSamples: number;
  isActive: () => boolean;
  onChunk: (base64Pcm: string) => void;
  AudioContextImpl?: typeof AudioContext;
}): MicrophoneCapture {
  const AudioContextImpl = options.AudioContextImpl ?? AudioContext;
  const context = new AudioContextImpl();
  const source = context.createMediaStreamSource(options.stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  let carry: Float32Array = new Float32Array(0);

  processor.onaudioprocess = (event) => {
    if (!options.isActive()) return;

    const input = event.inputBuffer.getChannelData(0);
    const merged = new Float32Array(carry.length + input.length);
    merged.set(carry);
    merged.set(input, carry.length);

    const pcm = toPcm16(merged, context.sampleRate);
    const wholeSamples = pcm.length - (pcm.length % options.chunkSamples);

    for (let offset = 0; offset < wholeSamples; offset += options.chunkSamples) {
      options.onChunk(toBase64(pcm.subarray(offset, offset + options.chunkSamples)));
    }

    carry = merged.slice(Math.round(wholeSamples * (context.sampleRate / INPUT_SAMPLE_RATE)));
  };

  source.connect(processor);
  processor.connect(context.destination);

  return {
    stop() {
      processor.onaudioprocess = null;
      try {
        processor.disconnect();
      } catch {
        /* Already disconnected. */
      }
      void context.close().catch(() => {});
    },
  };
}
