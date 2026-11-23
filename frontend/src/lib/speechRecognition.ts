/**
 * CareerDiff Browser-Native Speech Recognition
 * Uses the Web Speech API (webkitSpeechRecognition / SpeechRecognition)
 * to transcribe the candidate's actual speech in real-time.
 */

// Typing declarations for Web Speech API in browser environments
interface IWindowWithSpeech extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

export class BrowserSpeechRecognizer {
  private recognition: any = null;
  private isListening: boolean = false;
  private sessionAccumulatedText: string = '';
  private confirmedPriorText: string = '';
  private currentInterimTranscript: string = '';
  private silenceTimer: number | null = null;
  private restartTimer: number | null = null;
  private onPartialCallback: ((text: string) => void) | null = null;
  private onFinalCallback: ((text: string) => void) | null = null;
  private onSilenceCallback: (() => void) | null = null;
  private onErrorCallback: ((errorMsg: string) => void) | null = null;
  private isMutedFn: (() => boolean) | null = null;

  isActive(): boolean {
    return this.isListening;
  }

  static isSupported(): boolean {
    const win = window as unknown as IWindowWithSpeech;
    return !!(win.SpeechRecognition || win.webkitSpeechRecognition);
  }

  private initFreshInstance(): any {
    const win = window as unknown as IWindowWithSpeech;
    const SpeechRecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) return null;

    const rec = new SpeechRecognitionClass();
    rec.continuous = true;
    rec.interimResults = true;
    // Support user browser locale if English, otherwise fallback to en-US
    const userLocale = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US';
    rec.lang = userLocale.toLowerCase().startsWith('en') ? userLocale : 'en-US';
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      console.info('[SpeechRecognition] Active listening started.');
    };

    rec.onaudiostart = () => {
      console.info('[SpeechRecognition] Mic audio stream connected to speech recognition.');
    };

    rec.onsoundstart = () => {
      console.info('[SpeechRecognition] Sound wave detected on mic.');
    };

    rec.onspeechstart = () => {
      console.info('[SpeechRecognition] Speech onset detected.');
    };

    rec.onresult = (event: any) => {
      if (!this.isListening) return;
      if (this.isMutedFn && this.isMutedFn()) return;

      console.info('[SpeechRecognition] onresult fired with', event.results.length, 'results');

      // Chrome accumulates results across the session in event.results.
      // We read ALL results every time — finals become confirmed text,
      // all interim pieces are joined to form the live transcript.
      let allFinals = '';
      let interims = '';

      for (let i = 0; i < event.results.length; i++) {
        const item = event.results[i];
        const text = (item[0]?.transcript || '').trim();
        if (!text) continue;
        if (item.isFinal) {
          allFinals += (allFinals ? ' ' : '') + text;
        } else {
          interims += (interims ? ' ' : '') + text;
        }
      }

      // Keep accumulated session text, replace confirmed/interim each result event
      if (allFinals) {
        this.confirmedPriorText = allFinals;
      }
      this.currentInterimTranscript = interims;

      const fullText = this.getFullTranscript();
      if (fullText && this.onPartialCallback) {
        this.onPartialCallback(fullText);
      }

      this.clearSilenceTimer();
      if (fullText.length >= 6 && this.onSilenceCallback) {
        this.silenceTimer = window.setTimeout(() => {
          if (this.isListening && this.getFullTranscript().length >= 6) {
            this.onSilenceCallback?.();
          }
        }, 2000);
      }
    };

    rec.onerror = (event: any) => {
      const error = event.error;
      console.warn('[SpeechRecognition] Error:', error);
      if (error === 'no-speech' || error === 'aborted') return;
      if (error === 'not-allowed') {
        this.onErrorCallback?.('Microphone access blocked. Please allow microphone permissions in your browser address bar.');
      } else if (error === 'network' || error === 'service-not-allowed') {
        // Stop rapid thrashing: Google Cloud Speech recognition endpoint is unreachable or blocked
        console.warn('[SpeechRecognition] Google speech recognition network/service unreachable; falling back to backend STT.');
        this.clearRestartTimer();
        this.clearSilenceTimer();
        this.isListening = false;
        try {
          this.recognition?.abort();
        } catch {}
        this.recognition = null;
      } else if (error === 'audio-capture') {
        this.onErrorCallback?.('No microphone input detected. Please verify your microphone is plugged in.');
      } else {
        console.warn(`[SpeechRecognition] Non-fatal speech error '${error}'; falling back to backend STT.`);
      }
    };

    rec.onend = () => {
      if (!this.isListening) return;

      // Accumulate confirmed text before restarting
      if (this.confirmedPriorText.trim()) {
        this.sessionAccumulatedText = [this.sessionAccumulatedText, this.confirmedPriorText]
          .filter(Boolean).join(' ').trim();
        this.confirmedPriorText = '';
        this.currentInterimTranscript = '';
      }

      // Seamlessly restart with safe backoff so Chrome audio hardware can cycle cleanly
      this.clearRestartTimer();
      this.restartTimer = window.setTimeout(() => {
        if (!this.isListening) return;
        try {
          if (this.recognition) {
            try { this.recognition.abort(); } catch {}
            this.recognition = null;
          }
          this.recognition = this.initFreshInstance();
          this.recognition?.start();
        } catch (err) {
          console.warn('[SpeechRecognition] Seamless restart error:', err);
          this.isListening = false;
        }
      }, 350);
    };

    return rec;
  }

  start(
    onPartial?: (text: string) => void,
    onFinal?: (text: string) => void,
    onSilence?: () => void,
    onError?: (errorMsg: string) => void,
    isMuted?: () => boolean
  ): boolean {
    const win = window as unknown as IWindowWithSpeech;
    const SpeechRecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      console.warn('SpeechRecognition API is not supported in this browser environment.');
      onError?.('Speech recognition is not supported in this browser. Please use Google Chrome or Edge, or type your answer.');
      return false;
    }

    // Always abort and discard any prior recognition object to prevent Chrome InvalidStateError
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {}
      this.recognition = null;
    }

    this.clearSilenceTimer();
    this.clearRestartTimer();
    this.onPartialCallback = onPartial || null;
    this.onFinalCallback = onFinal || null;
    this.onSilenceCallback = onSilence || null;
    this.onErrorCallback = onError || null;
    this.isMutedFn = isMuted || null;
    this.sessionAccumulatedText = '';
    this.confirmedPriorText = '';
    this.currentInterimTranscript = '';
    this.isListening = true;

    try {
      this.recognition = this.initFreshInstance();
      if (this.recognition) {
        this.recognition.start();
        return true;
      }
    } catch (err) {
      console.warn('[SpeechRecognition] Recognition start error:', err);
      this.restartTimer = window.setTimeout(() => {
        if (this.isListening) {
          try {
            this.recognition = this.initFreshInstance();
            this.recognition?.start();
          } catch (retryErr) {
            console.warn('[SpeechRecognition] Retry start error:', retryErr);
          }
        }
      }, 60);
      return true;
    }

    return false;
  }

  getFullTranscript(): string {
    const parts: string[] = [];
    if (this.sessionAccumulatedText.trim()) parts.push(this.sessionAccumulatedText.trim());
    if (this.confirmedPriorText.trim()) parts.push(this.confirmedPriorText.trim());
    if (this.currentInterimTranscript.trim()) parts.push(this.currentInterimTranscript.trim());
    return parts.join(' ').trim();
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer !== null) {
      window.clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private clearRestartTimer(): void {
    if (this.restartTimer !== null) {
      window.clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  stop(): string {
    this.isListening = false;
    this.clearSilenceTimer();
    this.clearRestartTimer();
    const finalResult = this.getFullTranscript();

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
      this.recognition = null;
    }

    this.sessionAccumulatedText = '';
    this.confirmedPriorText = '';
    this.currentInterimTranscript = '';

    if (this.onFinalCallback && finalResult) {
      this.onFinalCallback(finalResult);
    }

    return finalResult;
  }

  abort(): void {
    this.isListening = false;
    this.clearSilenceTimer();
    this.clearRestartTimer();
    this.sessionAccumulatedText = '';
    this.confirmedPriorText = '';
    this.currentInterimTranscript = '';
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {}
      this.recognition = null;
    }
  }
}
