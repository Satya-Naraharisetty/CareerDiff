/**
 * CareerDiff Browser-Native Speech Synthesis (TTS) & Real-Time Synchronized Typewriter
 * Speaks interviewer questions with natural voice pacing while streaming the text
 * character-by-character / word-by-word onto the screen in real time.
 */

export interface SpeechSynthesisOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  onStart?: () => void;
  onTypingProgress?: (currentText: string, charIndex: number) => void;
  onEnd?: () => void;
  onError?: (err: unknown) => void;
}

export class BrowserSpeechSynthesizer {
  private static cachedVoices: SpeechSynthesisVoice[] = [];
  private static activeCancel: (() => void) | null = null;
  private static isSpeakingNow: boolean = false;

  static isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  }

  static init(): void {
    if (!this.isSupported()) return;
    this.loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = () => {
        this.loadVoices();
      };
    }
  }

  private static loadVoices(): void {
    try {
      const list = window.speechSynthesis.getVoices();
      if (list && list.length > 0) {
        this.cachedVoices = list;
      }
    } catch {
      // Ignored
    }
  }

  static getAvailableVoices(): SpeechSynthesisVoice[] {
    if (!this.isSupported()) return [];
    if (this.cachedVoices.length === 0) {
      this.loadVoices();
    }
    return this.cachedVoices.filter(
      (v) =>
        v.lang.toLowerCase().startsWith('en') &&
        !v.name.toLowerCase().includes('espeak') &&
        !v.name.toLowerCase().includes('desktop')
    );
  }

  static getBestVoice(): SpeechSynthesisVoice | null {
    if (!this.isSupported()) return null;
    if (this.cachedVoices.length === 0) {
      this.loadVoices();
    }
    const voices = this.cachedVoices;
    if (voices.length === 0) return null;

    // 1. Check user-selected preferred voice from localStorage
    const savedVoiceName =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('careerdiff_interviewer_voice')
        : null;
    if (savedVoiceName) {
      const matchedSaved = voices.find((v) => v.name === savedVoiceName);
      if (matchedSaved) return matchedSaved;
    }

    // 2. High-Fidelity Neural / Natural voices (Edge Natural & Chrome Google Neural)
    const neuralPriorityNames = [
      'natural',
      'neural',
      'online (natural)',
      'google us english',
      'google uk english female',
      'microsoft jenny',
      'microsoft guy',
      'microsoft aria',
      'microsoft christopher',
      'microsoft michelle',
      'microsoft eric',
      'samantha (enhanced)',
      'ava (premium)',
      'serena',
      'zira',
    ];

    for (const needle of neuralPriorityNames) {
      const match = voices.find(
        (v) =>
          v.lang.toLowerCase().startsWith('en') &&
          v.name.toLowerCase().includes(needle) &&
          !v.name.toLowerCase().includes('desktop')
      );
      if (match) return match;
    }

    // 3. Any English voice that is NOT an old robotic desktop synthesizer
    const nonRoboticEn = voices.find(
      (v) =>
        v.lang.toLowerCase().startsWith('en') &&
        !v.name.toLowerCase().includes('desktop') &&
        !v.name.toLowerCase().includes('david') &&
        !v.name.toLowerCase().includes('mark')
    );
    if (nonRoboticEn) return nonRoboticEn;

    // 4. Fallback en-US voice
    const enUs = voices.find((v) => v.lang.replace('_', '-').toLowerCase() === 'en-us');
    if (enUs) return enUs;

    // 5. Absolute fallback
    const en = voices.find((v) => v.lang.toLowerCase().startsWith('en'));
    return en || voices[0] || null;
  }

  /**
   * Cleans technical formatting, code blocks, and markdown symbols
   * so the acoustic reader reads natural conversational English.
   */
  static cleanTextForSpeech(rawText: string): string {
    return rawText
      .replace(/```[\s\S]*?```/g, ' . I have attached a code sample on your screen. ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[#*_~]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/([.?!])\s+/g, '$1 ')
      .trim();
  }

  /**
   * Speaks the full text while progressively invoking onTypingProgress to type out
   * the question in real time synchronized with the spoken audio.
   */
  static speak(fullText: string, options: SpeechSynthesisOptions = {}): () => void {
    // Cancel any current active speech before starting new utterance
    this.stop();

    if (!this.isSupported()) {
      // Fallback: fast typewriter if Web Speech API is absent
      return this.fallbackTypewriter(fullText, options);
    }

    const cleanSpeech = this.cleanTextForSpeech(fullText);
    if (!cleanSpeech) {
      options.onTypingProgress?.(fullText, fullText.length);
      options.onEnd?.();
      return () => {};
    }

    // Ensure audio subsystem is active
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    const utterance = new SpeechSynthesisUtterance(cleanSpeech);
    const voice = this.getBestVoice();
    if (voice) {
      utterance.voice = voice;
    }

    utterance.rate = options.rate ?? 0.96;
    utterance.pitch = options.pitch ?? 1.0;
    utterance.volume = options.volume ?? 1.0;

    let hasBoundaryFired = false;
    let cancelled = false;
    let fallbackTimer: number | null = null;
    let charCursor = 0;

    const cleanup = () => {
      cancelled = true;
      this.isSpeakingNow = false;
      this.activeCancel = null;
      if (fallbackTimer !== null) {
        clearInterval(fallbackTimer);
        fallbackTimer = null;
      }
    };

    utterance.onstart = () => {
      if (cancelled) return;
      this.isSpeakingNow = true;
      options.onStart?.();
    };

    utterance.onboundary = (event) => {
      if (cancelled) return;
      hasBoundaryFired = true;

      // Map boundary charIndex from cleanSpeech to fullText
      const targetLength = fullText.length;
      const speechLength = cleanSpeech.length || 1;
      const progressRatio = Math.min(1.0, event.charIndex / speechLength);
      charCursor = Math.max(charCursor, Math.round(progressRatio * targetLength));

      // Advance to the end of the current word in fullText
      let wordBoundary = charCursor;
      while (wordBoundary < targetLength && !/\s/.test(fullText[wordBoundary])) {
        wordBoundary++;
      }

      options.onTypingProgress?.(fullText.slice(0, wordBoundary), wordBoundary);
    };

    utterance.onend = () => {
      if (cancelled) return;
      cleanup();
      options.onTypingProgress?.(fullText, fullText.length);
      options.onEnd?.();
    };

    utterance.onerror = (err) => {
      if (cancelled) return;
      cleanup();
      options.onTypingProgress?.(fullText, fullText.length);
      options.onEnd?.();
      options.onError?.(err);
    };

    // Smooth fallback typewriter to ensure real-time typing even if onboundary is unhandled
    const totalWords = cleanSpeech.split(/\s+/).length;
    const estDurationSec = Math.max(1.2, totalWords / 2.6); // ~155 WPM
    const intervalMs = 40;
    const stepIncrement = Math.max(1, (fullText.length / (estDurationSec * 1000)) * intervalMs);

    let simulatedProgress = 0;
    fallbackTimer = window.setInterval(() => {
      if (cancelled) {
        if (fallbackTimer !== null) clearInterval(fallbackTimer);
        return;
      }

      // If browser boundary events are driving typing, let them lead
      if (hasBoundaryFired) return;

      simulatedProgress = Math.min(fullText.length, simulatedProgress + stepIncrement);
      options.onTypingProgress?.(fullText.slice(0, Math.round(simulatedProgress)), Math.round(simulatedProgress));

      if (simulatedProgress >= fullText.length) {
        if (fallbackTimer !== null) clearInterval(fallbackTimer);
      }
    }, intervalMs);

    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      cleanup();
      return this.fallbackTypewriter(fullText, options);
    }

    const cancelFn = () => {
      cleanup();
      try {
        window.speechSynthesis.cancel();
      } catch {}
      // Ensure the complete text is revealed when cancelled / barged-in
      options.onTypingProgress?.(fullText, fullText.length);
      options.onEnd?.();
    };

    this.activeCancel = cancelFn;
    return cancelFn;
  }

  /**
   * Pure typewriter fallback when speech synthesis is disabled or unavailable.
   */
  static fallbackTypewriter(fullText: string, options: SpeechSynthesisOptions = {}): () => void {
    let cancelled = false;
    let currentIdx = 0;
    const step = Math.max(1, Math.round(fullText.length / 75)); // Complete in ~1.5 - 3.0s

    options.onStart?.();

    const timer = window.setInterval(() => {
      if (cancelled) {
        clearInterval(timer);
        return;
      }
      currentIdx = Math.min(fullText.length, currentIdx + step);
      options.onTypingProgress?.(fullText.slice(0, currentIdx), currentIdx);

      if (currentIdx >= fullText.length) {
        clearInterval(timer);
        options.onEnd?.();
      }
    }, 35);

    const cancelFn = () => {
      cancelled = true;
      clearInterval(timer);
      options.onTypingProgress?.(fullText, fullText.length);
      options.onEnd?.();
    };

    this.activeCancel = cancelFn;
    return cancelFn;
  }

  /**
   * Instantly halts active speech and typing (e.g. for barge-in).
   */
  static stop(): void {
    if (this.activeCancel) {
      const cancel = this.activeCancel;
      this.activeCancel = null;
      cancel();
    }
    if (this.isSupported()) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    this.isSpeakingNow = false;
  }

  static isSpeaking(): boolean {
    return this.isSpeakingNow || (this.isSupported() && window.speechSynthesis.speaking);
  }
}

// Preload voices on initial module load
if (typeof window !== 'undefined') {
  BrowserSpeechSynthesizer.init();
}
