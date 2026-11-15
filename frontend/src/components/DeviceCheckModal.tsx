import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Mic,
  MicOff,
  RefreshCw,
  ShieldCheck,
  Video,
  VideoOff,
  Volume2,
  X,
} from 'lucide-react';
import { BrowserSpeechRecognizer } from '../lib/speechRecognition';
import { registerActiveStream } from '../lib/audio';

interface DeviceCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProceedToInterview: () => void;
  mode: 'VOICE' | 'TEXT';
}

export const DeviceCheckModal: React.FC<DeviceCheckModalProps> = ({
  isOpen,
  onClose,
  onProceedToInterview,
  mode,
}) => {
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle');
  const [micStatus, setMicStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle');
  const [cameraDeviceName, setCameraDeviceName] = useState<string>('');
  const [micDeviceName, setMicDeviceName] = useState<string>('');
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string>('');
  const [selectedCameraDeviceId, setSelectedCameraDeviceId] = useState<string>('');
  const [isCameraEnabled, setIsCameraEnabled] = useState<boolean>(true);
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [speakerTestState, setSpeakerTestState] = useState<'idle' | 'playing' | 'verified'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const hasSpeechApi = BrowserSpeechRecognizer.isSupported();

  const cleanupStreams = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    setCameraStream(null);

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
    setAudioStream(null);

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    setAudioLevel(0);
  }, []);

  const setupAudioAnalyzer = useCallback((stream: MediaStream) => {
    try {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }

      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioContextRef.current = ctx;

      // Ensure AudioContext is not suspended by browser autoplay policy
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);

      // Route through a zero-gain node to destination so Chrome keeps the audio graph rendering
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      analyser.connect(silentGain);
      silentGain.connect(ctx.destination);

      analyserRef.current = analyser;

      const timeData = new Float32Array(analyser.fftSize);
      let smoothed = 0;

      const checkVolume = () => {
        if (!analyserRef.current) return;

        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }

        analyserRef.current.getFloatTimeDomainData(timeData);

        // Root Mean Square (RMS) calculation of acoustic waveform
        let sumSquares = 0;
        for (let i = 0; i < timeData.length; i++) {
          const val = timeData[i];
          sumSquares += val * val;
        }
        const rms = Math.sqrt(sumSquares / timeData.length);

        // Normal conversational speech RMS is ~0.015 - 0.20
        // Multiply by 5.5 to map comfortably onto the 0.0 - 1.0 range
        const target = Math.min(1.0, Math.max(0, rms * 5.5));

        // Fast-attack, smooth-decay envelope follower
        if (target > smoothed) {
          smoothed = smoothed * 0.2 + target * 0.8;
        } else {
          smoothed = smoothed * 0.88 + target * 0.12;
        }

        // Noise floor gate
        const displayValue = smoothed < 0.02 ? 0 : smoothed;
        setAudioLevel(displayValue);

        animFrameRef.current = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (err) {
      console.warn('Audio analyzer failed to initialize:', err);
    }
  }, []);

  const handleSwitchAudioDevice = useCallback(
    async (deviceId: string) => {
      setSelectedAudioDeviceId(deviceId);
      try {
        localStorage.setItem('careerdiff_preferred_audio_device', deviceId);
      } catch {
        // localStorage not available
      }

      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
      }

      try {
        const aStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: deviceId },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        registerActiveStream(aStream);
        audioStreamRef.current = aStream;
        setAudioStream(aStream);
        setMicStatus('granted');
        const aTrack = aStream.getAudioTracks()[0];
        setMicDeviceName(aTrack?.label || 'Microphone');
        setupAudioAnalyzer(aStream);
      } catch (err) {
        console.warn('Failed to switch audio device:', err);
      }
    },
    [setupAudioAnalyzer]
  );

  const handleSwitchCameraDevice = useCallback(async (deviceId: string) => {
    setSelectedCameraDeviceId(deviceId);
    try {
      localStorage.setItem('careerdiff_preferred_video_device', deviceId);
    } catch {
      // localStorage not available
    }

    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }

    try {
      const vStream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
      });
      registerActiveStream(vStream);
      cameraStreamRef.current = vStream;
      setCameraStream(vStream);
      setCameraStatus('granted');
      const vTrack = vStream.getVideoTracks()[0];
      setCameraDeviceName(vTrack?.label || 'Camera');
    } catch (err) {
      console.warn('Failed to switch camera device:', err);
    }
  }, []);

  const requestMediaPermissions = useCallback(async () => {
    setErrorMessage(null);

    // 1. Request Camera Stream
    setCameraStatus('requesting');
    let vTrack: MediaStreamTrack | null = null;
    try {
      const savedVideoId = typeof localStorage !== 'undefined' ? localStorage.getItem('careerdiff_preferred_video_device') : null;
      const vStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
          ...(savedVideoId ? { deviceId: { ideal: savedVideoId } } : {}),
        },
      });
      registerActiveStream(vStream);
      cameraStreamRef.current = vStream;
      setCameraStream(vStream);
      setCameraStatus('granted');
      vTrack = vStream.getVideoTracks()[0] || null;
      setCameraDeviceName(vTrack?.label || 'Default Camera');
    } catch (err: unknown) {
      console.warn('Camera permission denied or unavailable:', err);
      setCameraStatus('denied');
    }

    // 2. Request Microphone Stream
    setMicStatus('requesting');
    let aTrack: MediaStreamTrack | null = null;
    try {
      const savedAudioId = typeof localStorage !== 'undefined' ? localStorage.getItem('careerdiff_preferred_audio_device') : null;
      // If a virtual line was previously saved, purge it so the OS default mic is always used
      if (savedAudioId && (savedAudioId.toLowerCase().includes('virtual') || savedAudioId.toLowerCase().includes('utility'))) {
        try {
          localStorage.removeItem('careerdiff_preferred_audio_device');
        } catch {}
      }
      const effectiveAudioId = savedAudioId && !savedAudioId.toLowerCase().includes('virtual') ? savedAudioId : 'default';

      const aStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          deviceId: { ideal: effectiveAudioId },
        },
      });
      registerActiveStream(aStream);
      audioStreamRef.current = aStream;
      setAudioStream(aStream);
      setMicStatus('granted');
      aTrack = aStream.getAudioTracks()[0] || null;
      setMicDeviceName(aTrack?.label || 'Default Microphone');

      // Setup audio level analyzer for live VU meter
      setupAudioAnalyzer(aStream);
    } catch (err: unknown) {
      console.warn('Microphone permission denied or unavailable:', err);
      setMicStatus('denied');
      setErrorMessage(
        'Microphone access was denied. Please allow microphone permissions in your browser address bar to participate in the interview.'
      );
    }

    // 3. Enumerate connected hardware devices (always prioritizing default mic)
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const rawAudios = allDevices.filter((d) => d.kind === 'audioinput' && d.deviceId);
      const videos = allDevices.filter((d) => d.kind === 'videoinput' && d.deviceId);

      // Sort audio devices: System Default first, real physical microphones next, virtual lines last
      const audios = [...rawAudios].sort((a, b) => {
        const aIsDef = a.deviceId === 'default' || a.label.toLowerCase().includes('default');
        const bIsDef = b.deviceId === 'default' || b.label.toLowerCase().includes('default');
        if (aIsDef && !bIsDef) return -1;
        if (!aIsDef && bIsDef) return 1;

        const aIsVirtual = a.label.toLowerCase().includes('virtual') || a.label.toLowerCase().includes('utility');
        const bIsVirtual = b.label.toLowerCase().includes('virtual') || b.label.toLowerCase().includes('utility');
        if (aIsVirtual && !bIsVirtual) return 1;
        if (!aIsVirtual && bIsVirtual) return -1;

        return 0;
      });

      setAudioDevices(audios);
      setCameraDevices(videos);

      // Always choose the default mic by default
      const defaultAudio =
        audios.find((d) => d.deviceId === 'default' || d.label.toLowerCase().includes('default')) ||
        audios.find(
          (d) => !d.label.toLowerCase().includes('virtual') && !d.label.toLowerCase().includes('utility')
        ) ||
        audios[0];

      if (defaultAudio && defaultAudio.deviceId) {
        setSelectedAudioDeviceId(defaultAudio.deviceId);
        if (defaultAudio.label) {
          setMicDeviceName(defaultAudio.label);
        }

        // Guarantee direct binding to the exact hardware endpoint of the default microphone
        // (Mirrors the exact device switch logic that activates physical hardware audio)
        try {
          if (audioStreamRef.current) {
            audioStreamRef.current.getTracks().forEach((t) => t.stop());
            audioStreamRef.current = null;
          }
          let exactStream: MediaStream;
          try {
            exactStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                deviceId: { exact: defaultAudio.deviceId },
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
            });
          } catch {
            exactStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                deviceId: { ideal: defaultAudio.deviceId },
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
            });
          }

          registerActiveStream(exactStream);
          audioStreamRef.current = exactStream;
          setAudioStream(exactStream);
          const boundTrack = exactStream.getAudioTracks()[0];
          if (boundTrack?.label) {
            setMicDeviceName(boundTrack.label);
          }
          setupAudioAnalyzer(exactStream);
        } catch (bindErr) {
          console.warn('Initial default mic direct binding fallback:', bindErr);
        }
      }

      const activeVideoId = vTrack?.getSettings()?.deviceId;
      if (activeVideoId) {
        setSelectedCameraDeviceId(activeVideoId);
      } else if (videos.length > 0) {
        setSelectedCameraDeviceId(videos[0].deviceId);
      }
    } catch (enumErr) {
      console.warn('Device enumeration failed:', enumErr);
    }
  }, [setupAudioAnalyzer]);

  // Guarantee unconditional hardware teardown when DeviceCheckModal unmounts
  useEffect(() => {
    return () => {
      cleanupStreams();
    };
  }, [cleanupStreams]);

  // Initialize and request devices on modal open
  useEffect(() => {
    if (!isOpen) return;

    const timer = window.setTimeout(() => {
      requestMediaPermissions();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      cleanupStreams();
    };
  }, [isOpen, cleanupStreams, requestMediaPermissions]);

  // Auto-resume AudioContext on any user interaction within the modal
  useEffect(() => {
    if (!isOpen) return;

    const handleUserInteraction = () => {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
    };

    window.addEventListener('pointerdown', handleUserInteraction);
    window.addEventListener('click', handleUserInteraction);
    window.addEventListener('keydown', handleUserInteraction);

    return () => {
      window.removeEventListener('pointerdown', handleUserInteraction);
      window.removeEventListener('click', handleUserInteraction);
      window.removeEventListener('keydown', handleUserInteraction);
    };
  }, [isOpen]);

  // Callback ref to immediately attach stream when video element mounts
  const setVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (node && cameraStreamRef.current && isCameraEnabled) {
      if (node.srcObject !== cameraStreamRef.current) {
        node.srcObject = cameraStreamRef.current;
      }
      node.play().catch((err) => {
        console.warn('Camera preview play failed:', err);
      });
    }
  }, [isCameraEnabled]);

  // Synchronize stream whenever cameraStream or isCameraEnabled changes
  useEffect(() => {
    if (videoRef.current && cameraStream && isCameraEnabled) {
      if (videoRef.current.srcObject !== cameraStream) {
        videoRef.current.srcObject = cameraStream;
      }
      videoRef.current.play().catch((err) => {
        console.warn('Camera preview play failed:', err);
      });
    }
  }, [cameraStream, isCameraEnabled]);

  const toggleCamera = () => {
    if (!cameraStream) return;
    const nextState = !isCameraEnabled;
    cameraStream.getVideoTracks().forEach((track) => {
      track.enabled = nextState;
    });
    setIsCameraEnabled(nextState);
  };

  const toggleMic = () => {
    if (!audioStream) return;
    const nextState = !isMicMuted;
    audioStream.getAudioTracks().forEach((track) => {
      track.enabled = !nextState;
    });
    setIsMicMuted(nextState);
  };

  const playSpeakerTestChime = () => {
    setSpeakerTestState('playing');
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass();

      const now = ctx.currentTime;
      // Tone 1: 523.25 Hz (C5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now);
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.3);

      // Tone 2: 659.25 Hz (E5)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, now + 0.15);
      gain2.gain.setValueAtTime(0.18, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.55);

      setTimeout(() => {
        setSpeakerTestState('verified');
        ctx.close().catch(() => {});
      }, 600);
    } catch {
      setSpeakerTestState('verified');
    }
  };

  const handleEnterInterview = () => {
    cleanupStreams();
    onProceedToInterview();
  };

  if (!isOpen) return null;

  const isReadyToEnter = micStatus === 'granted' || mode === 'TEXT';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="device-check-title"
    >
      <div className="relative w-full max-w-3xl rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800 text-emerald-400 shadow-inner">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 id="device-check-title" className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                Interview Readiness & Hardware Check
              </h2>
              <p className="text-xs text-zinc-400">
                Verify your microphone and camera settings before entering the live interview room.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition-colors"
            aria-label="Close device check"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-5 overflow-y-auto pr-1">
          {/* Left Column: Camera Preview */}
          <div className="flex flex-col space-y-3">
            <div className="flex items-center justify-between text-xs font-medium text-zinc-300">
              <span className="flex items-center gap-1.5">
                <Video className="h-3.5 w-3.5 text-zinc-400" />
                Camera Self-Preview
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium ${
                  cameraStatus === 'granted' && isCameraEnabled
                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                    : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                }`}
              >
                {cameraStatus === 'granted' && isCameraEnabled ? 'Active' : 'Disabled'}
              </span>
            </div>

            {/* Video Viewport Box */}
            <div className="relative aspect-video w-full rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden flex items-center justify-center shadow-inner group">
              {cameraStatus === 'granted' && isCameraEnabled ? (
                <video
                  ref={setVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1]"
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-6 text-center space-y-2">
                  <div className="h-12 w-12 rounded-full bg-zinc-800/80 flex items-center justify-center text-zinc-500">
                    <VideoOff className="h-6 w-6" />
                  </div>
                  <p className="text-xs text-zinc-400 font-medium">
                    {cameraStatus === 'denied'
                      ? 'Camera permission denied or camera not found'
                      : 'Camera preview is turned off'}
                  </p>
                  {cameraStatus === 'denied' && (
                    <button
                      type="button"
                      onClick={requestMediaPermissions}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 font-semibold underline"
                    >
                      <RefreshCw className="h-3 w-3" /> Retry Permission
                    </button>
                  )}
                </div>
              )}

              {/* In-video floating controls */}
              {cameraStatus === 'granted' && (
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between px-2 py-1.5 rounded-lg bg-zinc-950/80 backdrop-blur-md border border-zinc-800 text-[11px] text-zinc-300 gap-2">
                  {cameraDevices.length > 1 ? (
                    <select
                      value={selectedCameraDeviceId}
                      onChange={(e) => handleSwitchCameraDevice(e.target.value)}
                      className="bg-transparent border-0 text-[10px] font-mono text-zinc-300 focus:outline-none max-w-[140px] truncate cursor-pointer"
                      title="Switch Camera Device"
                    >
                      {cameraDevices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId} className="bg-zinc-950 text-zinc-200">
                          {d.label || `Camera (${d.deviceId.slice(0, 6)}...)`}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="truncate max-w-[140px] font-mono text-[10px] text-zinc-400">
                      {cameraDeviceName || 'Connected Camera'}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={toggleCamera}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors font-medium text-[10px] shrink-0"
                  >
                    {isCameraEnabled ? (
                      <>
                        <VideoOff className="h-3 w-3" /> Turn Off
                      </>
                    ) : (
                      <>
                        <Video className="h-3 w-3" /> Turn On
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Zero Biometrics Privacy Callout */}
            <div className="rounded-lg bg-zinc-900/60 p-2.5 border border-zinc-800 text-[11px] text-zinc-400 flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong className="text-zinc-200">Zero Biometrics:</strong> Camera is for candidate self-presence only.
                No facial data, micro-expressions, or video streams are ever analyzed or scored.
              </span>
            </div>
          </div>

          {/* Right Column: Audio & Microphone Verification */}
          <div className="flex flex-col space-y-4">
            {/* Microphone Check Card */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                      micStatus === 'granted' && !isMicMuted
                        ? 'border-emerald-800/80 bg-emerald-950/60 text-emerald-400'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-500'
                    }`}
                  >
                    {isMicMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-zinc-200">Microphone Input</h4>
                    <p className="text-[10px] text-zinc-400 font-mono truncate max-w-[150px]">
                      {micDeviceName || (micStatus === 'granted' ? 'Connected' : 'Not Connected')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {micStatus === 'granted' && (
                    <button
                      type="button"
                      onClick={toggleMic}
                      className="text-[10px] px-2 py-1 rounded border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                    >
                      {isMicMuted ? 'Unmute' : 'Mute'}
                    </button>
                  )}
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-medium ${
                      micStatus === 'granted'
                        ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                        : 'bg-rose-950/80 text-rose-300 border border-rose-800'
                    }`}
                  >
                    {micStatus === 'granted' ? 'Ready' : 'Permission Required'}
                  </span>
                </div>
              </div>

              {/* Input Device Selector if multiple mics detected */}
              {micStatus === 'granted' && audioDevices.length > 1 && (
                <div className="space-y-1">
                  <label htmlFor="mic-select" className="text-[10px] text-zinc-400 font-medium flex items-center justify-between">
                    <span>Select Microphone Device:</span>
                    <span className="text-[9px] text-emerald-400/80 font-mono">Switch if using headset</span>
                  </label>
                  <select
                    id="mic-select"
                    value={selectedAudioDeviceId}
                    onChange={(e) => handleSwitchAudioDevice(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] font-mono text-zinc-300 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                  >
                    {audioDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Microphone (${d.deviceId.slice(0, 6)}...)`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Live VU Meter Audio Level Visualizer */}
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                  <span>Input Volume Level</span>
                  <span className={audioLevel > 0.05 ? 'text-emerald-400 font-semibold' : 'text-zinc-500'}>
                    {Math.round(audioLevel * 100)}%
                  </span>
                </div>
                <div className="flex items-center gap-1 h-3.5 w-full bg-zinc-950 rounded border border-zinc-800 p-0.5">
                  {Array.from({ length: 20 }).map((_, idx) => {
                    const threshold = (idx + 1) / 20;
                    const isActive = audioLevel >= threshold && !isMicMuted;
                    return (
                      <div
                        key={idx}
                        className={`flex-1 h-full rounded-[1px] transition-all duration-75 ${
                          isActive
                            ? idx > 15
                              ? 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.6)]'
                              : idx > 10
                              ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]'
                              : 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]'
                            : 'bg-zinc-800/40'
                        }`}
                      />
                    );
                  })}
                </div>
                <p className="text-[10px] text-zinc-500">
                  Speak into your microphone to verify volume detection.
                </p>
              </div>
            </div>

            {/* Speaker Output Test Card */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300">
                  <Volume2 className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-zinc-200">Speaker / Headphones</h4>
                  <p className="text-[10px] text-zinc-400">
                    Verify you can hear the interviewer.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={playSpeakerTestChime}
                disabled={speakerTestState === 'playing'}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {speakerTestState === 'playing' ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-sky-400" />
                    <span>Playing...</span>
                  </>
                ) : speakerTestState === 'verified' ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Working!</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="h-3.5 w-3.5 text-zinc-400" />
                    <span>Test Sound</span>
                  </>
                )}
              </button>
            </div>

            {/* Real-Time Speech Recognition Check */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 flex items-center justify-between text-xs font-mono">
              <span className="text-zinc-400 text-[11px]">Real-Time Speech Engine:</span>
              <span
                className={`flex items-center gap-1 text-[11px] font-semibold ${
                  hasSpeechApi ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {hasSpeechApi ? 'Web Speech API Active' : 'Text Fallback Mode'}
              </span>
            </div>
          </div>
        </div>

        {/* Error Alert if any */}
        {errorMessage && (
          <div className="mb-4 rounded-lg bg-rose-950/80 border border-rose-800 p-3 text-xs text-rose-300 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="border-t border-zinc-800/80 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span>
              {isReadyToEnter
                ? 'Hardware verified. You are ready to start!'
                : 'Microphone permission required for voice mode.'}
            </span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial px-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 hover:text-white transition-all active:scale-[0.98]"
            >
              Back to Setup
            </button>
            <button
              type="button"
              onClick={handleEnterInterview}
              disabled={!isReadyToEnter}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-lg bg-white px-5 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-zinc-200 transition-all active:scale-[0.98] shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>Join Interview Room</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
