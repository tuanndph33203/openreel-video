import { describe, expect, it } from "vitest";
import { AudioTimeStretcher } from "./time-stretching";

type TestAudioBuffer = AudioBuffer & {
  readonly data: Float32Array[];
};

const sampleRate = 48000;

const createAudioBuffer = (samples: Float32Array[], rate: number = sampleRate): TestAudioBuffer => {
  return {
    data: samples,
    length: samples[0].length,
    duration: samples[0].length / rate,
    sampleRate: rate,
    numberOfChannels: samples.length,
    getChannelData: (channel: number) => samples[channel],
  } as unknown as TestAudioBuffer;
};

const createContext = (): BaseAudioContext => {
  return {
    createBuffer: (numberOfChannels: number, length: number, rate: number = sampleRate) => {
      const channels = Array.from(
        { length: numberOfChannels },
        () => new Float32Array(length),
      );

      return {
        data: channels,
        length,
        duration: length / rate,
        sampleRate: rate,
        numberOfChannels,
        getChannelData: (channel: number) => channels[channel],
        copyToChannel: (source: Float32Array, channel: number) => {
          channels[channel].set(source);
        }
      } as unknown as TestAudioBuffer;
    },
  } as unknown as BaseAudioContext;
};

describe("AudioTimeStretcher", () => {
  it("returns the original buffer unmodified when speed is 1.0", () => {
    const context = createContext();
    const originalSamples = [new Float32Array(1000)];
    const originalBuffer = createAudioBuffer(originalSamples);

    const result = AudioTimeStretcher.stretch(context, originalBuffer, 1.0);
    expect(result).toBe(originalBuffer);
  });

  it("scales output buffer length correctly for slow speeds (e.g. 0.5x)", () => {
    const context = createContext();
    // 8192 samples (approx. 170ms)
    const samples = [new Float32Array(8192)];
    samples[0].fill(0.5); // Fill with some dummy audio data
    const originalBuffer = createAudioBuffer(samples);

    const result = AudioTimeStretcher.stretch(context, originalBuffer, 0.5);
    
    // When speed is 0.5, length should double
    expect(result.length).toBe(16384);
    expect(result.numberOfChannels).toBe(1);
    expect(result.sampleRate).toBe(sampleRate);
  });

  it("scales output buffer length correctly for fast speeds (e.g. 2.0x)", () => {
    const context = createContext();
    // 8192 samples
    const samples = [new Float32Array(8192)];
    const originalBuffer = createAudioBuffer(samples);

    const result = AudioTimeStretcher.stretch(context, originalBuffer, 2.0);
    
    // When speed is 2.0, length should halve
    expect(result.length).toBe(4096);
  });

  it("preserves phase synchronization across multiple channels (stereo)", () => {
    const context = createContext();
    const length = 8192;
    const channel1 = new Float32Array(length);
    const channel2 = new Float32Array(length);
    
    // Create highly correlated stereo channels
    for (let i = 0; i < length; i++) {
      channel1[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
      channel2[i] = Math.cos((2 * Math.PI * 440 * i) / sampleRate);
    }
    
    const originalBuffer = createAudioBuffer([channel1, channel2]);

    const result = AudioTimeStretcher.stretch(context, originalBuffer, 0.75);
    
    expect(result.numberOfChannels).toBe(2);
    expect(result.length).toBe(Math.floor(length / 0.75));
    
    // Check that both channels are stretched to the same length (no channel phase drift!)
    expect(result.getChannelData(0).length).toBe(result.getChannelData(1).length);
  });
});
