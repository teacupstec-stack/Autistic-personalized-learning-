import { useEffect, useRef, useState } from 'react';
import type { ModelStatusType } from '../types';
import { captureFrame, getTracker, normalizeFrames } from '../services/handTracking';
import type { HandFrame } from '../services/handTracking';

export interface GestureCapture { durationMs: number; timestamp: string; features: Float32Array }
interface Props {
  modelStatus: ModelStatusType;
  disabled?: boolean;
  onGestureCaptureStart: () => void;
  onGestureCaptureComplete: (sample: GestureCapture) => Promise<void>;
  onPermissionChange: (status: 'granted' | 'denied' | 'prompt') => void;
}
export function CameraPanel({ modelStatus, disabled, onGestureCaptureStart, onGestureCaptureComplete, onPermissionChange }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const [active, setActive] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('Turn on the camera when you want to communicate with a gesture.');
  useEffect(() => () => { generation.current++; stream.current?.getTracks().forEach(t => t.stop()); }, []);
  function stop() {
    generation.current++; stream.current?.getTracks().forEach(t => t.stop()); stream.current = null;
    setCameraOn(false); setActive(false); setBusy(false); setProgress(0); setMessage('Camera off. Picture symbols remain available.');
  }
  async function start() {
    const token = ++generation.current;
    setBusy(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false });
      if (token !== generation.current) { media.getTracks().forEach(t => t.stop()); return; }
      stream.current = media;
      setCameraOn(true);
      if (video.current) { video.current.srcObject = media; await video.current.play(); }
      onPermissionChange('granted'); setMessage('Loading local hand tracking…');
      await getTracker();
      if (token !== generation.current) return;
      setActive(true); setMessage('Camera is on. Press “Show my gesture” when you are ready.');
    } catch (error) {
      if (token !== generation.current) return;
      stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; setCameraOn(false); setActive(false);
      onPermissionChange(error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'prompt');
      setMessage(error instanceof Error ? error.message : 'Camera or tracking unavailable.');
    } finally { if (token === generation.current) setBusy(false); }
  }
  async function record() {
    if (busy || disabled || !active || !video.current) return;
    const token = ++generation.current;
    setBusy(true); setProgress(0); setMessage('Capturing your gesture…'); onGestureCaptureStart();
    try {
      const tracker = await getTracker(), started = performance.now();
      const frames: HandFrame[] = [];
      let lastVideoTime = -1;
      while (performance.now() - started < 2000) {
        if (token !== generation.current) return;
        if (video.current.readyState >= 2 && video.current.currentTime !== lastVideoTime) {
          lastVideoTime = video.current.currentTime; frames.push(captureFrame(tracker, video.current));
        }
        setProgress(Math.min(100, (performance.now() - started) / 20));
        await new Promise(resolve => setTimeout(resolve, 60));
      }
      if (token !== generation.current) return;
      const features = normalizeFrames(frames);
      setMessage('Processing gesture…');
      await onGestureCaptureComplete({ features, durationMs: performance.now() - started, timestamp: new Date().toISOString() });
      if (token === generation.current) { setProgress(100); setMessage('Choose the picture that matches what you meant.'); }
    } catch (error) {
      if (token === generation.current) setMessage(error instanceof Error ? error.message : 'Capture failed.');
    } finally { if (token === generation.current) setBusy(false); }
  }
  return <section className="glass-panel" aria-labelledby="camera-title">
    <h2 id="camera-title">Or show me with your hands</h2>
    <p>Turn on the camera, then press “Show my gesture” when you want to say something.</p>
    <span className="camera-indicator" role="status">{cameraOn ? '● Camera on' : 'Camera off'}</span>
    <video ref={video} muted playsInline style={{ width: '100%', maxHeight: 300, background: '#111', borderRadius: 12 }} />
    <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
      {cameraOn ? <button className="btn btn-secondary" onClick={stop}>Camera off / Stop</button> :
        <button className="btn btn-primary" disabled={busy} onClick={start}>Turn Camera On</button>}
      <button className="btn btn-primary" disabled={!active || busy || disabled || modelStatus !== 'ready'} onClick={record}>Show my gesture</button>
    </div>
    {busy && <progress value={progress} max={100} aria-label="Gesture capture progress" />}
    <p role="status">{message}</p>
    <small>Camera stays on this device. You can turn it off any time.</small>
  </section>;
}

