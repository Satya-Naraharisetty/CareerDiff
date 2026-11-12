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
  private accumulatedFinalTranscript: string = '';
  private currentInterimTranscript: string = '';
  private onPartialCallback: ((text: string) => void) | null = null;
  private onFinalCallback: ((text: string) => void) | null = null;

  constructor() {
    const win = window as unknown as IWindowWithSpeech;
    const SpeechRecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (SpeechRecognitionClass) {
      try {
        this.recognition = new SpeechRecognitionClass();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';
        this.recognition.maxAlternatives = 1;

        this.setupHandlers();
      } catch (err) {
        console.warn('SpeechRecognition initialization error:', err);
        this.recognition = null;
      }
    }
  }

  static isSupported(): boolean {
    const win = window as unknown as IWindowWithSpeech;
    return !!(win.SpeechRecognition || win.webkitSpeechRecognition);
  }

  private setupHandlers(): void {
    if (!this.recognition) return;

    this.recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const item = event.results[i];
        const transcriptChunk = item[0]?.transcript || '';
        if (item.isFinal) {
          this.accumulatedFinalTranscript += (this.accumulatedFinalTranscript ? ' ' : '') + transcriptChunk.trim();
        } else {
          interim += transcriptChunk;
        }
      }

      this.currentInterimTranscript = interim;
      const combined = this.getFullTranscript();
      if (this.onPartialCallback && combined) {
        this.onPartialCallback(combined);
      }
    };

    this.recognition.onerror = (event: any) => {
      // Ignore common non-fatal events like 'no-speech' or 'aborted'
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn('Speech recognition status:', event.error);
      }
    };

    this.recognition.onend = () => {
      // If still marked as listening and ended prematurely (e.g. browser silence cutoff), restart
      if (this.isListening && this.recognition) {
        try {
          this.recognition.start();
        } catch {
          // If already started or blocked, safe to ignore
        }
      }
    };
  }

  start(
    onPartial?: (text: string) => void,
    onFinal?: (text: string) => void
  ): boolean {
    if (!this.recognition) return false;

    this.onPartialCallback = onPartial || null;
    this.onFinalCallback = onFinal || null;
    this.accumulatedFinalTranscript = '';
    this.currentInterimTranscript = '';
    this.isListening = true;

    try {
      this.recognition.start();
      return true;
    } catch {
      // In case already active
      return false;
    }
  }

  getFullTranscript(): string {
    const finalPart = this.accumulatedFinalTranscript.trim();
    const interimPart = this.currentInterimTranscript.trim();
    if (finalPart && interimPart) {
      return `${finalPart} ${interimPart}`;
    }
    return finalPart || interimPart;
  }

  stop(): string {
    this.isListening = false;
    const finalResult = this.getFullTranscript();

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // Safe ignore
      }
    }

    if (this.onFinalCallback && finalResult) {
      this.onFinalCallback(finalResult);
    }

    return finalResult;
  }

  abort(): void {
    this.isListening = false;
    this.accumulatedFinalTranscript = '';
    this.currentInterimTranscript = '';
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // Safe ignore
      }
    }
  }
}
