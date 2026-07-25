/* ==========================================================================
   GLO N3 - Web Audio API Sound Effects Synthesizer
   Procedural Mystical Sci-Fi Audio Feedback
   ========================================================================== */

const SoundEngine = (function () {
  let audioCtx = null;
  let isMuted = false;

  function initCtx() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playClick() {
    if (isMuted) return;
    initCtx();
    if (!audioCtx) return;

    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.08);
    } catch (e) {
      console.warn('Audio play error', e);
    }
  }

  function playScanChime() {
    if (isMuted) return;
    initCtx();
    if (!audioCtx) return;

    try {
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + idx * 0.08);

        gain.gain.setValueAtTime(0.1, audioCtx.currentTime + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + idx * 0.08 + 0.25);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(audioCtx.currentTime + idx * 0.08);
        osc.stop(audioCtx.currentTime + idx * 0.08 + 0.25);
      });
    } catch (e) {
      console.warn('Audio play error', e);
    }
  }

  function playRevealFanfare() {
    if (isMuted) return;
    initCtx();
    if (!audioCtx) return;

    try {
      // Mystical chord fanfare
      const chord = [523.25, 659.25, 783.99, 987.77, 1046.50]; // C, E, G, B, C (Cmaj7)
      chord.forEach((freq) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + 1.2);
      });
    } catch (e) {
      console.warn('Audio play error', e);
    }
  }

  function playCopySuccess() {
    if (isMuted) return;
    initCtx();
    if (!audioCtx) return;

    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      osc.frequency.setValueAtTime(1760, audioCtx.currentTime + 0.06);

      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch (e) {
      console.warn('Audio play error', e);
    }
  }

  function toggleMute() {
    isMuted = !isMuted;
    return isMuted;
  }

  function getMutedState() {
    return isMuted;
  }

  return {
    playClick,
    playScanChime,
    playRevealFanfare,
    playCopySuccess,
    toggleMute,
    getMutedState
  };
})();
