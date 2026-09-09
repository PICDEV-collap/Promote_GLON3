/* ==========================================================================
   GLO N3 - Voice-to-Text Dream Input Engine 2.0 (Web Speech API)
   Supports Thai Speech Recognition (th-TH) with Audio Waveform Visualizer & Direct Submission
   ========================================================================== */

const VoiceInputEngine = (function () {
  'use strict';

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let isListening = false;
  let currentTargetInputId = 'dream-input';

  const isSupported = !!SpeechRecognition;

  function initRecognition(onResultCallback, onStateChangeCallback, onErrorCallback) {
    if (!isSupported) return null;

    try {
      recognition = new SpeechRecognition();
      recognition.lang = 'th-TH';
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = function () {
        isListening = true;
        updateRecordingUI(true);
        if (typeof window.SoundEngine !== 'undefined' && window.SoundEngine.playClick) {
          window.SoundEngine.playClick();
        }
        if (onStateChangeCallback) onStateChangeCallback(true);
      };

      recognition.onresult = function (event) {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }

        const targetEl = document.getElementById(currentTargetInputId);
        if (targetEl) {
          targetEl.value = transcript;
        }

        if (onResultCallback) {
          onResultCallback(transcript, event.results[0].isFinal);
        }
      };

      recognition.onerror = function (event) {
        console.warn('Speech recognition error:', event.error);
        isListening = false;
        updateRecordingUI(false);
        if (onStateChangeCallback) onStateChangeCallback(false);
        if (onErrorCallback) onErrorCallback(event.error);

        if (typeof window.showToast === 'function') {
          if (event.error === 'not-allowed') {
            window.showToast('กรุณาอนุญาตการเข้าถึงไมโครโฟนเพื่อใช้งานการสั่งงานด้วยเสียง', 'error');
          } else {
            window.showToast('เกิดข้อผิดพลาดในการรับเสียง กรุณาลองใหม่อีกครั้ง', 'warning');
          }
        }
      };

      recognition.onend = function () {
        isListening = false;
        updateRecordingUI(false);
        if (onStateChangeCallback) onStateChangeCallback(false);

        // Auto trigger prediction if text is populated
        const targetEl = document.getElementById(currentTargetInputId);
        if (targetEl && targetEl.value.trim().length >= 2) {
          if (typeof window.triggerDreamPrediction === 'function') {
            setTimeout(() => window.triggerDreamPrediction(), 300);
          }
        }
      };

      return recognition;
    } catch (e) {
      console.warn('Speech recognition init error:', e);
      return null;
    }
  }

  function init(options) {
    if (typeof options === 'function') {
      return initRecognition.apply(this, arguments);
    }
    const opts = options || {};
    return initRecognition(
      opts.onResult,
      function (listening) {
        if (listening && typeof opts.onStart === 'function') opts.onStart();
        if (!listening && typeof opts.onEnd === 'function') opts.onEnd();
      },
      opts.onError
    );
  }

  function startListening(targetInputId = 'dream-input') {
    currentTargetInputId = targetInputId;

    if (!isSupported) {
      if (typeof window.showToast === 'function') {
        window.showToast('เบราว์เซอร์นี้ยังไม่รองรับระบบสั่งงานด้วยเสียง กรุณาพิมพ์ความฝันในช่องข้อความแทนครับ', 'warning');
      }
      return;
    }

    if (!recognition) {
      initRecognition();
    }
    if (!recognition || isListening) return;

    try {
      recognition.start();
      if (typeof window.showToast === 'function') {
        window.showToast('🎙️ กำลังฟังเสียงเล่าความฝัน... กรุณาพูดได้เลยครับ', 'info');
      }
    } catch (e) {
      console.warn('Cannot start recognition:', e);
      if (typeof window.showToast === 'function') {
        window.showToast('กรุณาอนุญาตการเข้าถึงไมโครโฟนเพื่อบันทึกเสียง หรือพิมพ์ความฝันแทนครับ', 'warning');
      }
    }
  }

  function stopListening() {
    if (!recognition || !isListening) return;
    try {
      recognition.stop();
    } catch (e) {
      console.warn('Cannot stop recognition:', e);
    }
  }

  function toggleListening(targetInputId = 'dream-input') {
    if (!isSupported) {
      if (typeof window.showToast === 'function') {
        window.showToast('เบราว์เซอร์นี้ยังไม่รองรับระบบสั่งงานด้วยเสียง กรุณาพิมพ์ความฝันในช่องข้อความแทนครับ', 'warning');
      }
      return;
    }

    if (isListening) {
      stopListening();
    } else {
      startListening(targetInputId);
    }
  }

  function updateRecordingUI(active) {
    const btnVoice = document.getElementById('btn-voice-input') || document.getElementById('btn-voice-record');
    const waveEl = document.getElementById('voice-waveform-box');
    const hintEl = document.getElementById('voice-status-hint');

    if (btnVoice) {
      if (active) {
        btnVoice.classList.add('recording', 'recording-active');
        if (btnVoice.id === 'btn-voice-record') {
          btnVoice.innerHTML = '<i class="fas fa-stop-circle pulse-dot"></i> กำลังฟังเสียง...';
        }
      } else {
        btnVoice.classList.remove('recording', 'recording-active');
        if (btnVoice.id === 'btn-voice-record') {
          btnVoice.innerHTML = '<i class="fas fa-microphone"></i> อัดเสียงเล่าฝัน';
        }
      }
    }

    if (waveEl) {
      waveEl.style.display = active ? 'flex' : 'none';
      if (active) waveEl.classList.add('active');
      else waveEl.classList.remove('active');
    }

    if (hintEl) {
      hintEl.style.display = active ? 'block' : 'none';
      if (active) hintEl.classList.add('active');
      else hintEl.classList.remove('active');
    }
  }

  return {
    isSupported,
    init,
    initRecognition,
    startListening,
    stopListening,
    toggleListening,
    getListeningState: () => isListening
  };
})();

// Attach to window
if (typeof window !== 'undefined') {
  window.VoiceInputEngine = VoiceInputEngine;
}

