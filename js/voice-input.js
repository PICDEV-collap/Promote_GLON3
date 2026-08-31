/* ==========================================================================
   GLO N3 - Voice-to-Text Dream Input Engine (Web Speech API)
   Supports Thai Speech Recognition (th-TH) with Audio Feedback & State Hooks
   ========================================================================== */

const VoiceInputEngine = (function () {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let isListening = false;

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
        if (onStateChangeCallback) onStateChangeCallback(true);
      };

      recognition.onresult = function (event) {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        if (onResultCallback) onResultCallback(transcript, event.results[0].isFinal);
      };

      recognition.onerror = function (event) {
        console.warn('Speech recognition error:', event.error);
        isListening = false;
        if (onStateChangeCallback) onStateChangeCallback(false);
        if (onErrorCallback) onErrorCallback(event.error);
      };

      recognition.onend = function () {
        isListening = false;
        if (onStateChangeCallback) onStateChangeCallback(false);
      };

      return recognition;
    } catch (e) {
      console.warn('Speech recognition init error:', e);
      return null;
    }
  }

  function startListening() {
    if (!recognition || isListening) return;
    try {
      recognition.start();
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

  function toggleListening() {
    if (isListening) {
      stopListening();
    } else {
      startListening();
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
