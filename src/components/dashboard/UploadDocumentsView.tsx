import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { FileUp, CheckCircle, AlertCircle, Loader2, UploadCloud, Camera, CameraOff } from 'lucide-react';
import { API_URL } from '../../config/api';

interface UploadDocumentsViewProps {
  token: string | null;
  onSuccess: () => void;
}

export const UploadDocumentsView: React.FC<UploadDocumentsViewProps> = ({ token, onSuccess }) => {
  const [duiFile, setDuiFile] = useState<File | null>(null);
  const [certFile, setCertFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfieSource, setSelfieSource] = useState<'camera' | 'upload' | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [faceScore, setFaceScore] = useState<number | null>(null);
  const [faceCheckNote, setFaceCheckNote] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const canUseFaceDetector = useMemo(
    () => typeof window !== 'undefined' && typeof (window as any).FaceDetector !== 'undefined',
    []
  );

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraOn(false);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      setCameraOn(true);
    } catch (err: any) {
      const details = err?.message ? ` (${err.message})` : '';
      setError(`Camera access denied or unavailable${details}.`);
    }
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  useEffect(() => {
    if (!cameraOn || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    videoRef.current
      .play()
      .catch(() => setError('Could not start camera preview. Check browser camera permissions.'));
  }, [cameraOn]);

  const captureSelfie = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    if (!video.videoWidth || !video.videoHeight) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.92)
    );
    if (!blob) {
      setError('Could not capture selfie.');
      return;
    }

    const file = new File([blob], `selfie-${Date.now()}.jpg`, { type: 'image/jpeg' });
    setSelfieFile(file);
    setSelfieSource('camera');
    setSelfiePreview(URL.createObjectURL(blob));
    setFaceScore(null);
    setFaceCheckNote('Camera selfie captured. Instant verification can be attempted on submit.');
    stopCamera();
  };

  const missingItems: string[] = [];
  if (!duiFile) missingItems.push('ID/Passport');
  if (!certFile) missingItems.push('Certification');
  if (!selfieFile) missingItems.push('Camera selfie');

  const extractFaceCrop = async (file: File): Promise<ImageData | null> => {
    const imageBitmap = await createImageBitmap(file);
    const detectorCtor = (window as any).FaceDetector;
    if (!detectorCtor) return null;
    const detector = new detectorCtor({ fastMode: true, maxDetectedFaces: 1 });
    const faces = await detector.detect(imageBitmap);
    if (!faces || faces.length === 0) return null;

    const box = faces[0].boundingBox;
    const sx = Math.max(0, Math.floor(box.x));
    const sy = Math.max(0, Math.floor(box.y));
    const sw = Math.min(imageBitmap.width - sx, Math.floor(box.width));
    const sh = Math.min(imageBitmap.height - sy, Math.floor(box.height));
    if (sw <= 0 || sh <= 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(imageBitmap, sx, sy, sw, sh, 0, 0, 128, 128);
    return ctx.getImageData(0, 0, 128, 128);
  };

  const histogramFromImageData = (imageData: ImageData) => {
    const bins = new Array(16).fill(0);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const bin = Math.min(15, Math.floor(gray / 16));
      bins[bin] += 1;
    }
    const total = bins.reduce((sum, v) => sum + v, 0) || 1;
    return bins.map((v) => v / total);
  };

  const cosineSimilarity = (a: number[], b: number[]) => {
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i += 1) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? 0 : dot / denom;
  };

  const computeFaceMatchScore = async (documentImage: File, selfie: File): Promise<number | null> => {
    if (!canUseFaceDetector) return null;
    const docFace = await extractFaceCrop(documentImage);
    const selfieFace = await extractFaceCrop(selfie);
    if (!docFace || !selfieFace) return null;
    const docHist = histogramFromImageData(docFace);
    const selfieHist = histogramFromImageData(selfieFace);
    const similarity = cosineSimilarity(docHist, selfieHist);
    return Math.max(0, Math.min(1, similarity));
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!duiFile) {
      setError('The ID document is required.');
      return;
    }

    if (!certFile) {
      setError('The certification document is required.');
      return;
    }

    if (!selfieFile) {
      setError('A selfie is required for facial verification.');
      return;
    }

    setIsLoading(true);
    setError('');

    // Frontend size validation (10MB)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (duiFile.size > MAX_SIZE) {
      setError('The ID file is too large. Max size is 10MB.');
      setIsLoading(false);
      return;
    }
    if (certFile && certFile.size > MAX_SIZE) {
      setError('The certification file is too large. Max size is 10MB.');
      setIsLoading(false);
      return;
    }
    if (selfieFile && selfieFile.size > MAX_SIZE) {
      setError('The selfie file is too large. Max size is 10MB.');
      setIsLoading(false);
      return;
    }

    const formData = new FormData();
    formData.append('dui_document', duiFile);
    if (certFile) formData.append('cert_document', certFile);
    if (selfieFile) formData.append('selfie_image', selfieFile);
    formData.append('selfie_source', selfieSource === 'camera' ? 'camera' : 'upload');

    try {
      let score: number | null = null;
      if (
        selfieSource === 'camera' &&
        duiFile.type.startsWith('image/') &&
        selfieFile.type.startsWith('image/')
      ) {
        score = await computeFaceMatchScore(duiFile, selfieFile);
      }
      if (score != null) {
        formData.append('face_match_score', score.toFixed(4));
        setFaceScore(score);
        setFaceCheckNote(
          `Face similarity score: ${(score * 100).toFixed(1)}%`
        );
      } else {
        setFaceCheckNote(
          canUseFaceDetector
            ? 'Face score unavailable. Sent for manual review.'
            : 'Browser does not support local face detection. Sent for manual review.'
        );
      }
    } catch {
      setFaceCheckNote('Face comparison failed. Sent for manual review.');
    }

    try {
      const response = await fetch(`${API_URL}/api/worker/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData,
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("Non-JSON response from server:", text);
        setError(`Server error: ${text.substring(0, 100)}...`);
        return;
      }

      if (response.ok) {
        // Update localStorage so it doesn't ask for documents again on reload
        const userData = localStorage.getItem('user');
        if (userData) {
          const userObj = JSON.parse(userData);
          if (!userObj.worker_profile) userObj.worker_profile = {};
          userObj.worker_profile.dui_document = data.dui_path;
          userObj.worker_profile.cert_document = data.cert_path;
          userObj.worker_profile.selfie_image = data.selfie_path;
          userObj.worker_profile.face_match_score = data.face_match_score;
          userObj.worker_profile.verification_status = data.verification_status;
          userObj.worker_profile.is_verified = data.is_verified;
          localStorage.setItem('user', JSON.stringify(userObj));
        }
        
        onSuccess(); // Change state to "hasUploadedDocs: true"
      } else {
        setError(data.error || 'There was an error uploading the documents.');
      }
    } catch (err: any) {
      console.error("Fetch error:", err);
      setError('Network or connection error: ' + (err.message || ''));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-4 sm:p-6 bg-white/50 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-2xl w-full bg-white rounded-3xl shadow-xl border border-gray-100 p-6 sm:p-8 my-auto"
      >
        <div className="text-center mb-6 sm:mb-8">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-bird-blue/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <UploadCloud className="w-7 h-7 sm:w-8 sm:h-8 text-bird-blue" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Upload Your Documents</h2>
          <p className="text-sm sm:text-base text-gray-500">
            To ensure the safety of our clients, we need to validate your identity and skills before you can start receiving requests.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 font-medium">{error}</p>
          </div>
        )}

        <form onSubmit={handleUpload} className="space-y-4 sm:space-y-6">
          {/* DUI Input */}
          <div className="bg-gray-50 rounded-2xl p-4 sm:p-6 border-2 border-dashed border-gray-200 hover:border-bird-blue/50 transition-colors relative">
            <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer">
              <div className="flex flex-col items-center justify-center py-4 text-center">
                {duiFile ? (
                  <CheckCircle className="w-8 h-8 sm:w-10 sm:h-10 text-green-500 mb-2 sm:mb-3" />
                ) : (
                  <FileUp className="w-8 h-8 sm:w-10 sm:h-10 text-gray-400 mb-2 sm:mb-3" />
                )}
                <p className="mb-1 sm:mb-2 text-sm text-gray-700 font-semibold">
                  <span className="text-bird-blue">Upload your ID or Passport</span> (Required)
                </p>
                <p className="text-xs text-gray-500 px-4 text-center">
                  {duiFile ? duiFile.name : 'PNG, JPG or PDF (Max 10MB)'}
                </p>
              </div>
              <input 
                type="file" 
                className="hidden" 
                accept="image/*,.pdf" 
                onChange={(e) => setDuiFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          {/* Certificate Input */}
          <div className="bg-gray-50 rounded-2xl p-4 sm:p-6 border-2 border-dashed border-gray-200 hover:border-amber-400/50 transition-colors relative">
            <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer">
              <div className="flex flex-col items-center justify-center py-4 text-center">
                {certFile ? (
                  <CheckCircle className="w-8 h-8 sm:w-10 sm:h-10 text-green-500 mb-2 sm:mb-3" />
                ) : (
                  <FileUp className="w-8 h-8 sm:w-10 sm:h-10 text-gray-400 mb-2 sm:mb-3" />
                )}
                <p className="mb-1 sm:mb-2 text-sm text-gray-700 font-semibold">
                  <span className="text-amber-500">Upload your Certifications</span> (Required)
                </p>
                <p className="text-xs text-gray-500 px-4 text-center">
                  {certFile ? certFile.name : 'Degrees, diplomas or licenses. PNG, JPG or PDF (Max 10MB).'}
                </p>
              </div>
              <input 
                type="file" 
                className="hidden" 
                accept="image/*,.pdf" 
                onChange={(e) => setCertFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          {/* Selfie Input / Camera */}
          <div className="bg-gray-50 rounded-2xl p-4 sm:p-6 border-2 border-dashed border-cyan-200 hover:border-cyan-400/60 transition-colors relative">
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm text-gray-700 font-semibold text-center">
                <span className="text-cyan-600">Selfie verification</span> (Required)
              </p>

              {!cameraOn && !selfieFile && (
                <button
                  type="button"
                  onClick={startCamera}
                  className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-bold text-sm flex items-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  Open Camera
                </button>
              )}

              {!cameraOn && selfieFile && (
                <button
                  type="button"
                  onClick={() => {
                    setSelfieFile(null);
                    setSelfiePreview(null);
                    setSelfieSource(null);
                    setFaceScore(null);
                    setFaceCheckNote('');
                    startCamera();
                  }}
                  className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-bold text-sm flex items-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  Retake Selfie
                </button>
              )}

              {cameraOn && (
                <button
                  type="button"
                  onClick={stopCamera}
                  className="px-4 py-2 rounded-lg bg-gray-700 text-white font-bold text-sm flex items-center gap-2"
                >
                  <CameraOff className="w-4 h-4" />
                  Close Camera
                </button>
              )}

              {cameraOn && (
                <div className="w-full max-w-md rounded-xl overflow-hidden border border-gray-200 bg-black">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-auto" />
                </div>
              )}

              {cameraOn && (
                <button
                  type="button"
                  onClick={captureSelfie}
                  className="px-4 py-2 rounded-lg bg-bird-blue text-white font-bold text-sm"
                >
                  Capture Selfie
                </button>
              )}

              {selfiePreview && (
                <div className="w-36 h-36 rounded-full overflow-hidden border-4 border-white shadow-md">
                  <img src={selfiePreview} alt="Selfie preview" className="w-full h-full object-cover" />
                </div>
              )}

              <p className="text-xs text-gray-500 text-center">
                {selfieFile ? selfieFile.name : 'Take your selfie with camera (required).'}
              </p>
              <p className="text-[11px] text-cyan-700 text-center font-semibold">
                Instant unlock is only available with camera selfie + strong face match.
              </p>
            </div>
          </div>

          {(faceScore != null || faceCheckNote) && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
              <p className="text-sm font-semibold text-blue-800">
                {faceCheckNote || 'Face verification pending.'}
              </p>
              {faceScore != null && (
                <p className="text-xs text-blue-700 mt-1">
                  Auto-verify threshold: 82%
                </p>
              )}
            </div>
          )}

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={isLoading || !duiFile || !certFile || !selfieFile}
            className={`w-full py-3 sm:py-4 mt-2 rounded-xl text-white font-bold text-base sm:text-lg flex items-center justify-center gap-2 transition-all ${
              isLoading || !duiFile || !certFile || !selfieFile
                ? 'bg-gray-300 cursor-not-allowed' 
                : 'bg-gradient-to-r from-bird-blue to-blue-500 hover:shadow-lg hover:shadow-blue-500/30'
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" />
                Uploading documents...
              </>
            ) : (
              'Submit Documents for Review'
            )}
          </motion.button>

          {!isLoading && missingItems.length > 0 && (
            <p className="text-xs text-amber-700 font-semibold text-center">
              Missing: {missingItems.join(', ')}
            </p>
          )}
        </form>
      </motion.div>
    </div>
  );
};
