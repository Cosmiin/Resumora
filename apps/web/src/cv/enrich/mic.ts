/*
 * Microphone audio for live transcription: PCM16 mono 24 kHz little-endian, base64, in ~100 ms chunks.
 * Nothing is recorded or kept; each chunk is handed straight to the caller.
 */

const RATE = 24_000;
const CHUNK = RATE / 10;
const TAP = "resumora-mic-tap";
const WORKLET = `class Tap extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
}
registerProcessor("${TAP}", Tap);`;

/** Base64 of the samples as 16-bit little-endian integers. */
export function encodePcm16(samples: Float32Array): string {
  const view = new DataView(new ArrayBuffer(samples.length * 2));
  samples.forEach((s, i) => {
    const c = Math.max(-1, Math.min(1, s));
    view.setInt16(i * 2, c < 0 ? Math.round(c * 0x8000) : Math.round(c * 0x7fff), true);
  });
  const bytes = new Uint8Array(view.buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Linear resampling from `inRate` to 24 kHz that carries its position across chunks. */
export function makeResampler(inRate: number): (input: Float32Array) => Float32Array {
  if (inRate === RATE) return (input) => input;
  const step = inRate / RATE;
  let pos = 0;
  let prev = 0;
  return (input) => {
    // index 0 is the last sample of the previous chunk, index i + 1 is input[i]
    const at = (i: number) => (i === 0 ? prev : (input[i - 1] ?? 0));
    const last = input.length;
    const out: number[] = [];
    while (pos < last) {
      const i = Math.floor(pos);
      const f = pos - i;
      out.push(at(i) * (1 - f) + at(i + 1) * f);
      pos += step;
    }
    pos -= last;
    prev = input[last - 1] ?? prev;
    return Float32Array.from(out);
  };
}

/** A context at 24 kHz when the browser allows it with a microphone, else at its own rate. */
function openContext(stream: MediaStream): { ctx: AudioContext; source: MediaStreamAudioSourceNode } {
  try {
    const ctx = new AudioContext({ sampleRate: RATE });
    try {
      return { ctx, source: ctx.createMediaStreamSource(stream) };
    } catch {
      void ctx.close(); // e.g. Firefox: the microphone's rate must match the context's
    }
  } catch {
    // this browser can't pick the rate
  }
  const ctx = new AudioContext();
  return { ctx, source: ctx.createMediaStreamSource(stream) };
}

async function addTap(ctx: AudioContext, push: (s: Float32Array) => void): Promise<AudioNode> {
  if (ctx.audioWorklet && typeof AudioWorkletNode !== "undefined") {
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    try {
      await ctx.audioWorklet.addModule(url);
      const node = new AudioWorkletNode(ctx, TAP, { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
      node.port.onmessage = (e: MessageEvent<Float32Array>) => push(e.data);
      return node;
    } catch {
      // fall through to the older processor
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const node = ctx.createScriptProcessor(4096, 1, 1);
  node.onaudioprocess = (e) => push(e.inputBuffer.getChannelData(0).slice(0));
  return node;
}

/**
 * Streams the microphone as base64 chunks. Returns `stop`, which sends what is left, then
 * disconnects and closes the audio context. The caller stops the stream's tracks.
 */
export async function startCapture(stream: MediaStream, onChunk: (audio: string) => void): Promise<() => void> {
  const { ctx, source } = openContext(stream);
  try {
    const resample = makeResampler(ctx.sampleRate);
    let pending = new Float32Array(0);
    let stopped = false;
    const push = (input: Float32Array) => {
      if (stopped) return;
      const next = resample(input);
      const joined = new Float32Array(pending.length + next.length);
      joined.set(pending);
      joined.set(next, pending.length);
      let start = 0;
      for (; joined.length - start >= CHUNK; start += CHUNK) onChunk(encodePcm16(joined.subarray(start, start + CHUNK)));
      pending = joined.slice(start);
    };
    const tap = await addTap(ctx, push);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(tap);
    tap.connect(mute).connect(ctx.destination);
    if (ctx.state === "suspended") await ctx.resume();
    return () => {
      if (stopped) return;
      stopped = true;
      if (pending.length) onChunk(encodePcm16(pending));
      pending = new Float32Array(0);
      source.disconnect();
      tap.disconnect();
      void ctx.close();
    };
  } catch (e) {
    void ctx.close();
    throw e;
  }
}
