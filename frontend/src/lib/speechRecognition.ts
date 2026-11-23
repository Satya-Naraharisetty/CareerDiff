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
  private confirmedPriorText: string = '';
  private currentSessionFinal: string = '';
  private currentInterimTranscript: string = '';
  private silenceTimer: number | null = null;
  private restartTimer: number | null = null;
  private onPartialCallback: ((text: string) => void) | null = null;
  private onFinalCallback: ((text: string) => void) | null = null;
  private onSilenceCallback: (() => void) | null = null;
  private onErrorCallback: ((errorMsg: string) => void) | null = null;
  private isMutedFn: (() => boolean) | null = null;

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
    rec.lang = 'en-US';
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      console.info('[SpeechRecognition] Active listening started.');
    };

    rec.onspeechstart = () => {
      console.info('[SpeechRecognition] Speech onset detected.');
    };

    rec.onresult = (event: any) => {
      if (this.isMutedFn && this.isMutedFn()) {
        return;
      }

      let finalChunk = '';
      let interimChunk = '';

      for (let i = 0; i < event.results.length; i++) {
        const item = event.results[i];
        const text = item[0]?.transcript || '';
        if (item.isFinal) {
          finalChunk += (finalChunk ? ' ' : '') + text.trim();
        } else {
          interimChunk += (interimChunk ? ' ' : '') + text.trim();
        }
      }

      this.currentSessionFinal = finalChunk;
      this.currentInterimTranscript = interimChunk;

      const fullCombined = this.getFullTranscript();
      if (this.onPartialCallback && fullCombined) {
        this.onPartialCallback(fullCombined);
      }

      // Reset and re-arm hands-free silence auto-finalization
      this.clearSilenceTimer();

      // If candidate has spoken at least 2 words (~6 chars) and goes silent for 2.2 seconds
      if (fullCombined.trim().length >= 6 && this.onSilenceCallback) {
        this.silenceTimer = window.setTimeout(() => {
          if (this.isListening && this.getFullTranscript().trim().length >= 6) {
            this.onSilenceCallback?.();
          }
        }, 2200);
      }
    };

    rec.onerror = (event: any) => {
      const error = event.error;
      if (error === 'no-speech' || error === 'aborted') {
        return;
      }
      console.warn('[SpeechRecognition] Status:', error);
      if (error === 'not-allowed') {
        this.onErrorCallback?.('Microphone access blocked. Please allow microphone permissions in your browser address bar.');
      } else if (error === 'network') {
        console.warn('[SpeechRecognition] Web Speech API network notice: WebSocket voice streaming active');
      } else if (error === 'audio-capture') {
        this.onErrorCallback?.('No microphone input detected. Please verify your microphone is plugged in.');
      }
    };

    rec.onend = () => {
      if (!this.isListening) return;
      // Preserve confirmed final text from finished sentence; drop volatile interim guesses
      if (this.currentSessionFinal.trim()) {
        this.confirmedPriorText = (
          (this.confirmedPriorText ? this.confirmedPriorText.trim() + ' ' : '') +
          this.currentSessionFinal.trim()
        ).trim();
      }
      this.currentSessionFinal = '';
      this.currentInterimTranscript = '';
      this.scheduleRestart(80);
    };

    return rec;
  }

  private scheduleRestart(delayMs: number): void {
    this.clearRestartTimer();
    this.restartTimer = window.setTimeout(() => {
      if (!this.isListening) return;
      this.teardownCurrentInstance();
      try {
        const rec = this.initFreshInstance();
        if (rec) {
          rec.start();
          this.recognition = rec;
          console.info('[SpeechRecognition] Active listening loop resumed.');
        }
      } catch (err) {
        console.warn('[SpeechRecognition] Restart attempt notice:', err);
        // Exponential backoff retry so candidate speech recognition never dies mid-interview
        if (this.isListening) {
          this.scheduleRestart(Math.min(1200, Math.round(delayMs * 1.5 + 80)));
        }
      }
    }, delayMs);
  }

  private teardownCurrentInstance(): void {
    if (this.recognition) {
      try {
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.abort();
      } catch {}
      this.recognition = null;
    }
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

    this.abort();

    this.clearSilenceTimer();
    this.clearRestartTimer();
    this.onPartialCallback = onPartial || null;
    this.onFinalCallback = onFinal || null;
    this.onSilenceCallback = onSilence || null;
    this.onErrorCallback = onError || null;
    this.isMutedFn = isMuted || null;
    this.confirmedPriorText = '';
    this.currentSessionFinal = '';
    this.currentInterimTranscript = '';
    this.isListening = true;

    try {
      const rec = this.initFreshInstance();
      if (!rec) return false;
      rec.start();
      this.recognition = rec;
      return true;
    } catch (err) {
      console.warn('Initial SpeechRecognition start busy/delayed, scheduling auto-resume:', err);
      this.scheduleRestart(150);
      return true;
    }
  }

  getFullTranscript(): string {
    const parts: string[] = [];
    if (this.confirmedPriorText.trim()) parts.push(this.confirmedPriorText.trim());
    if (this.currentSessionFinal.trim()) parts.push(this.currentSessionFinal.trim());
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
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.onspeechstart = null;
        this.recognition.onspeechend = null;
        this.recognition.onaudiostart = null;
        this.recognition.onaudioend = null;
        this.recognition.stop();
      } catch {
        // Safe ignore
      }
      this.recognition = null;
    }

    if (this.onFinalCallback && finalResult) {
      this.onFinalCallback(finalResult);
    }

    return finalResult;
  }

  abort(): void {
    this.isListening = false;
    this.clearSilenceTimer();
    this.clearRestartTimer();
    this.confirmedPriorText = '';
    this.currentSessionFinal = '';
    this.currentInterimTranscript = '';
    if (this.recognition) {
      try {
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.onspeechstart = null;
        this.recognition.onspeechend = null;
        this.recognition.onaudiostart = null;
        this.recognition.onaudioend = null;
        this.recognition.abort();
      } catch {
        // Safe ignore
      }
      this.recognition = null;
    }
  }
}
