import { useState, useEffect, useRef, useCallback } from 'react';

interface UseVoiceSearchOptions {
  onResult: (query: string) => void;
  onError?: (error: string) => void;
}

export function useVoiceSearch({ onResult, onError }: UseVoiceSearchOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Keep latest callbacks in refs to avoid stale closures
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    // 1. Check AndroidBridge voice support
    const hasBridgeVoice =
      typeof (window as any).AndroidBridge !== 'undefined' &&
      typeof (window as any).AndroidBridge?.startVoiceSearch === 'function';

    // 2. Check Web Speech API support
    const hasWebSpeech =
      typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

    setIsSupported(hasBridgeVoice || hasWebSpeech);

    // Listen for native AndroidBridge voice events
    const handleBridgeResult = (e: Event) => {
      const customEvent = e as CustomEvent<{ query: string }>;
      const query = customEvent.detail?.query?.trim();
      setIsListening(false);
      if (query && onResultRef.current) {
        onResultRef.current(query);
      }
    };

    const handleBridgeEnd = () => {
      setIsListening(false);
    };

    const handleBridgeError = (e: Event) => {
      const customEvent = e as CustomEvent<{ error: string }>;
      const err = customEvent.detail?.error || 'Voice search failed';
      setIsListening(false);
      if (onErrorRef.current) {
        onErrorRef.current(err);
      }
    };

    window.addEventListener('tmdb_voice_search_result', handleBridgeResult);
    window.addEventListener('tmdb_voice_search_end', handleBridgeEnd);
    window.addEventListener('tmdb_voice_search_error', handleBridgeError);

    return () => {
      window.removeEventListener('tmdb_voice_search_result', handleBridgeResult);
      window.removeEventListener('tmdb_voice_search_end', handleBridgeEnd);
      window.removeEventListener('tmdb_voice_search_error', handleBridgeError);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore cleanup errors
        }
      }
    };
  }, []);

  const startListening = useCallback(() => {
    // A. Native Android Bridge
    const hasBridgeVoice =
      typeof (window as any).AndroidBridge !== 'undefined' &&
      typeof (window as any).AndroidBridge?.startVoiceSearch === 'function';

    if (hasBridgeVoice) {
      setIsListening(true);
      try {
        (window as any).AndroidBridge.startVoiceSearch();
      } catch (err: any) {
        setIsListening(false);
        if (onErrorRef.current) {
          onErrorRef.current(err?.message || 'Failed to start voice search');
        }
      }
      return;
    }

    // B. Web Speech API Fallback
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      if (onErrorRef.current) {
        onErrorRef.current('Voice search is not supported in this browser');
      }
      return;
    }

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;

      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = navigator.language || 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        setIsListening(false);
        const transcript = event.results?.[0]?.[0]?.transcript?.trim();
        if (transcript && onResultRef.current) {
          onResultRef.current(transcript);
        }
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        // Do not display error toast if user simply cancelled/didn't speak
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          if (onErrorRef.current) {
            onErrorRef.current(`Voice error: ${event.error}`);
          }
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err: any) {
      setIsListening(false);
      if (onErrorRef.current) {
        onErrorRef.current(err?.message || 'Failed to start voice recognition');
      }
    }
  }, []);

  const stopListening = useCallback(() => {
    setIsListening(false);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop errors
      }
    }
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  return {
    isListening,
    isSupported,
    startListening,
    stopListening,
    toggleListening
  };
}
