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

  static isSupported(): boolean {
    const win = window as unknown as IWindowWithSpeech;
    return !!(win.SpeechRecognition || win.webkitSpeechRecognition);
  }

  start(
    onPartial?: (text: string) => void,
    onFinal?: (text: string) => void,
    onSilence?: () => void,
    onError?: (errorMsg: string) => void
  ): boolean {
    const win = window as unknown as IWindowWithSpeech;
    const SpeechRecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      console.warn('SpeechRecognition API is not supported in this browser environment.');
      onError?.('Speech recognition is not supported in this browser. Please use Google Chrome or Edge, or type your answer.');
      return false;
    }

    // Stop and clean up any existing recognition instance to avoid InvalidStateError in Chromium
    this.abort();

    this.clearSilenceTimer();
    this.clearRestartTimer();
    this.onPartialCallback = onPartial || null;
    this.onFinalCallback = onFinal || null;
    this.onSilenceCallback = onSilence || null;
    this.onErrorCallback = onError || null;
    this.confirmedPriorText = '';
    this.currentSessionFinal = '';
    this.currentInterimTranscript = '';
    this.isListening = true;

    try {
      const rec = new SpeechRecognitionClass();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';
      rec.maxAlternatives = 1;

      rec.onresult = (event: any) => {
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
        if (this.silenceTimer !== null) {
          window.clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }

        // If candidate has spoken at least 2 words (~8 chars) and then goes silent for 2.2 seconds
        if (fullCombined.length >= 8 && this.onSilenceCallback) {
          this.silenceTimer = window.setTimeout(() => {
            if (this.isListening && this.getFullTranscript().length >= 8) {
              this.onSilenceCallback?.();
            }
          }, 2200);
        }
      };

      rec.onerror = (event: any) => {
        const error = event.error;
        // Ignore normal non-fatal events like 'no-speech' or 'aborted'
        if (error === 'no-speech' || error === 'aborted') {
          return;
        }
        console.warn('Speech recognition status:', error);
        if (error === 'not-allowed') {
          this.onErrorCallback?.('Microphone access blocked. Please allow microphone permissions in your browser address bar to speak.');
        } else if (error === 'network') {
          this.onErrorCallback?.('Speech recognition network service unreachable (common if blocked by Brave Shields or ad blockers). Use "Type / Edit" or allow speech services.');
        } else if (error === 'audio-capture') {
          this.onErrorCallback?.('No microphone input detected. Please verify your microphone is plugged in.');
        } else if (error === 'service-not-allowed') {
          this.onErrorCallback?.('Speech recognition service is disallowed by browser policy.');
        }
      };

      rec.onend = () => {
        // Preserve confirmed text across browser silence auto-restarts
        if (this.isListening) {
          const currentTotal = this.getFullTranscript();
          if (currentTotal) {
            this.confirmedPriorText = currentTotal;
          }
          this.currentSessionFinal = '';
          this.currentInterimTranscript = '';

          this.clearRestartTimer();
          // Safe asynchronous restart with 120ms backoff to prevent Chromium InvalidStateError
          this.restartTimer = window.setTimeout(() => {
            if (!this.isListening) return;
            try {
              rec.start();
            } catch {
              // If current instance cannot be reused, create a fresh instance
              try {
                const freshRec = new SpeechRecognitionClass();
                freshRec.continuous = true;
                freshRec.interimResults = true;
                freshRec.lang = 'en-US';
                freshRec.maxAlternatives = 1;
                freshRec.onresult = rec.onresult;
                freshRec.onerror = rec.onerror;
                freshRec.onend = rec.onend;
                freshRec.start();
                this.recognition = freshRec;
              } catch {
                // Restarting
              }
            }
          }, 120);
        }
      };

      rec.start();
      this.recognition = rec;
      return true;
    } catch (err) {
      console.warn('Failed to start SpeechRecognition:', err);
      this.onErrorCallback?.('Failed to start speech recognition. Please check microphone permissions.');
      return false;
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
