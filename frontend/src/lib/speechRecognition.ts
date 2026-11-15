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
  private onPartialCallback: ((text: string) => void) | null = null;
  private onFinalCallback: ((text: string) => void) | null = null;
  private onSilenceCallback: (() => void) | null = null;

  static isSupported(): boolean {
    const win = window as unknown as IWindowWithSpeech;
    return !!(win.SpeechRecognition || win.webkitSpeechRecognition);
  }

  start(
    onPartial?: (text: string) => void,
    onFinal?: (text: string) => void,
    onSilence?: () => void
  ): boolean {
    const win = window as unknown as IWindowWithSpeech;
    const SpeechRecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      console.warn('SpeechRecognition API is not supported in this browser environment.');
      return false;
    }

    // Stop and clean up any existing recognition instance to avoid InvalidStateError in Chromium
    this.abort();

    this.clearSilenceTimer();
    this.onPartialCallback = onPartial || null;
    this.onFinalCallback = onFinal || null;
    this.onSilenceCallback = onSilence || null;
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
        // Ignore normal non-fatal events like 'no-speech' or 'aborted'
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.warn('Speech recognition status:', event.error);
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

          try {
            rec.start();
          } catch {
            // Restarting
          }
        }
      };

      rec.start();
      this.recognition = rec;
      return true;
    } catch (err) {
      console.warn('Failed to start SpeechRecognition:', err);
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

  stop(): string {
    this.isListening = false;
    this.clearSilenceTimer();
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
