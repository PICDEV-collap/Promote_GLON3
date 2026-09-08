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

  function startListening(targetInputId = 'dream-input') {
    currentTargetInputId = targetInputId;
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
    if (isListening) {
      stopListening();
    } else {
      startListening(targetInputId);
    }
  }

  function updateRecordingUI(active) {
    const btnVoice = document.getElementById('btn-voice-record');
    const waveEl = document.getElementById('voice-waveform-box');

    if (btnVoice) {
      if (active) {
        btnVoice.classList.add('recording-active');
        btnVoice.innerHTML = '<i class="fas fa-stop-circle pulse-dot"></i> กำลังฟังเสียง...';
      } else {
        btnVoice.classList.remove('recording-active');
        btnVoice.innerHTML = '<i class="fas fa-microphone"></i> อัดเสียงเล่าฝัน';
      }
    }

    if (waveEl) {
      waveEl.style.display = active ? 'flex' : 'none';
    }
  }

  return {
    isSupported,
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
