
/**
 * AudioTimeStretcher provides high-quality pitch-preserving time stretching
 * using the Waveform Similarity Overlap-Add (WSOLA) algorithm.
 * 
 * When changing the playback speed of an audio buffer, this class resamples
 * the frames in the time domain, searching for the most similar waveform shapes
 * in nearby regions to align phases, avoiding metallic echo, comb filtering, and clicks.
 */
export class AudioTimeStretcher {
  /**
   * Stretches or compresses an AudioBuffer to a new speed while preserving the original pitch.
   * 
   * @param context - The AudioContext or BaseAudioContext to create the new buffer.
   * @param sourceBuffer - The original input AudioBuffer.
   * @param speed - The speed multiplier (e.g. 0.5 for half speed, 2.0 for double speed).
   * @returns A new AudioBuffer with the speed adjusted and pitch preserved.
   */
  static stretch(
    context: BaseAudioContext,
    sourceBuffer: AudioBuffer,
    speed: number,
  ): AudioBuffer {
    if (speed === 1.0 || speed <= 0) {
      return sourceBuffer; // No change needed
    }

    const numChannels = sourceBuffer.numberOfChannels;
    const sampleRate = sourceBuffer.sampleRate;
    const originalLength = sourceBuffer.length;
    
    // Output length will be originalLength / speed
    const outputLength = Math.max(1, Math.floor(originalLength / speed));
    
    const outputBuffer = context.createBuffer(
      numChannels,
      outputLength,
      sampleRate
    );

    // If the speed difference is tiny, just copy
    if (Math.abs(speed - 1.0) < 0.01) {
      for (let channel = 0; channel < numChannels; channel++) {
        outputBuffer.copyToChannel(sourceBuffer.getChannelData(channel), channel);
      }
      return outputBuffer;
    }

    // Extract channel data arrays
    const inputChannels: Float32Array[] = [];
    const outputChannels: Float32Array[] = [];
    for (let channel = 0; channel < numChannels; channel++) {
      inputChannels.push(sourceBuffer.getChannelData(channel));
      outputChannels.push(outputBuffer.getChannelData(channel));
    }

    // WSOLA Parameters
    // Tuning N=1024 (~21ms) and Ho=128 (87.5% overlap) yields excellent speech quality 
    // and runs 4x faster than N=2048, preventing long processing times.
    const N = 2048; 
    const Ho = Math.floor(N / 8); // Synthesis Hop Size (256 samples, high overlap for smoothness)
    const delta = Math.floor(N / 4); // Search tolerance (512 samples)
    const L = Math.floor(N / 2); // Similarity correlation window (1024 samples)

    // Window function: Hann window for smooth fading
    const hannWindow = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      hannWindow[i] = 0.5 * (1.0 - Math.cos((2 * Math.PI * i) / (N - 1)));
    }

    // Overlap-add accumulation buffers
    const normBuffer = new Float32Array(outputLength);
    
    // We will search for phase alignment on Channel 0 (or average) to keep channels in phase.
    // Searching independently per channel would destroy the stereo field (phase cancellation!).
    const searchChannel = inputChannels[0];

    // Initialization
    let pPrevious = 0; // The actual input offset chosen in the previous step
    let pTarget = 0;   // The target input offset for the current step
    
    // First frame overlap-add directly
    for (let i = 0; i < N; i++) {
      if (i < outputLength && i < originalLength) {
        for (let c = 0; c < numChannels; c++) {
          outputChannels[c][i] += inputChannels[c][i] * hannWindow[i];
        }
        normBuffer[i] += hannWindow[i] * hannWindow[i];
      }
    }

    // Main WSOLA overlap-add loop
    // Synthesize output frame by frame
    for (let outPos = Ho; outPos < outputLength - N; outPos += Ho) {
      // Ideal target in input corresponding to current outPos
      pTarget = Math.floor(outPos * speed);

      // We want to find a starting point 'q' in the range [pTarget - delta, pTarget + delta]
      // such that the segment x[q ... q + L] is most similar to the natural continuation
      // of the previous segment, which would start at (pPrevious + Ho).
      const templateStart = pPrevious + Ho;
      
      let bestQ = pTarget;
      
      // Only perform similarity search if we are within valid bounds
      if (templateStart + L < originalLength) {
        const startSearch = Math.max(0, pTarget - delta);
        const endSearch = Math.min(originalLength - N, pTarget + delta);

        let bestQCoarse = pTarget;
        let maxCorrelationCoarse = -Infinity;

        // 1. Coarse Search with step of 8 to quickly scan the search window
        for (let q = startSearch; q < endSearch; q += 8) {
          let correlation = 0;
          let energy = 0;
          
          let j = 0;
          const limit = L - 3;
          for (; j < limit; j += 4) {
            // Sample 1
            const t1 = searchChannel[templateStart + j];
            const c1 = searchChannel[q + j];
            correlation += t1 * c1;
            energy += c1 * c1;

            // Sample 2
            const t2 = searchChannel[templateStart + j + 1];
            const c2 = searchChannel[q + j + 1];
            correlation += t2 * c2;
            energy += c2 * c2;

            // Sample 3
            const t3 = searchChannel[templateStart + j + 2];
            const c3 = searchChannel[q + j + 2];
            correlation += t3 * c3;
            energy += c3 * c3;

            // Sample 4
            const t4 = searchChannel[templateStart + j + 3];
            const c4 = searchChannel[q + j + 3];
            correlation += t4 * c4;
            energy += c4 * c4;
          }

          // Process remaining elements
          for (; j < L; j++) {
            const t = searchChannel[templateStart + j];
            const c = searchChannel[q + j];
            correlation += t * c;
            energy += c * c;
          }

          // Normalize correlation to avoid bias towards high-amplitude zones
          const score = energy > 1e-4 ? correlation / Math.sqrt(energy) : correlation;
          
          if (score > maxCorrelationCoarse) {
            maxCorrelationCoarse = score;
            bestQCoarse = q;
          }
        }

        // 2. Fine Local Search around bestQCoarse candidate (+/- 7 samples)
        const startFine = Math.max(startSearch, bestQCoarse - 7);
        const endFine = Math.min(endSearch, bestQCoarse + 8);
        
        let maxCorrelation = maxCorrelationCoarse;
        bestQ = bestQCoarse;

        for (let q = startFine; q < endFine; q++) {
          if (q === bestQCoarse) continue; // Already evaluated

          let correlation = 0;
          let energy = 0;
          
          let j = 0;
          const limit = L - 3;
          for (; j < limit; j += 4) {
            // Sample 1
            const t1 = searchChannel[templateStart + j];
            const c1 = searchChannel[q + j];
            correlation += t1 * c1;
            energy += c1 * c1;

            // Sample 2
            const t2 = searchChannel[templateStart + j + 1];
            const c2 = searchChannel[q + j + 1];
            correlation += t2 * c2;
            energy += c2 * c2;

            // Sample 3
            const t3 = searchChannel[templateStart + j + 2];
            const c3 = searchChannel[q + j + 2];
            correlation += t3 * c3;
            energy += c3 * c3;

            // Sample 4
            const t4 = searchChannel[templateStart + j + 3];
            const c4 = searchChannel[q + j + 3];
            correlation += t4 * c4;
            energy += c4 * c4;
          }

          // Process remaining elements
          for (; j < L; j++) {
            const t = searchChannel[templateStart + j];
            const c = searchChannel[q + j];
            correlation += t * c;
            energy += c * c;
          }

          const score = energy > 1e-4 ? correlation / Math.sqrt(energy) : correlation;
          
          if (score > maxCorrelation) {
            maxCorrelation = score;
            bestQ = q;
          }
        }
      }

      // Overlap-add the selected frame (bestQ) into output channels
      for (let i = 0; i < N; i++) {
        const inIdx = bestQ + i;
        const outIdx = outPos + i;

        if (inIdx < originalLength && outIdx < outputLength) {
          const winValue = hannWindow[i];
          for (let c = 0; c < numChannels; c++) {
            outputChannels[c][outIdx] += inputChannels[c][inIdx] * winValue;
          }
          normBuffer[outIdx] += winValue * winValue;
        }
      }

      // Save history for the next iteration
      pPrevious = bestQ;
    }

    // Normalize output channels by the overlapping window weights
    for (let i = 0; i < outputLength; i++) {
      const norm = normBuffer[i];
      if (norm > 1e-5) {
        for (let c = 0; c < numChannels; c++) {
          outputChannels[c][i] = Math.max(-1.0, Math.min(1.0, outputChannels[c][i] / norm));
        }
      } else {
        // If normalization is zero, fallback to input directly or silence
        const originalInputIndex = Math.min(originalLength - 1, Math.floor(i * speed));
        for (let c = 0; c < numChannels; c++) {
          outputChannels[c][i] = inputChannels[c][originalInputIndex] || 0;
        }
      }
    }

    return outputBuffer;
  }
}
