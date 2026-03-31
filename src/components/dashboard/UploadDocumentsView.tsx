import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FileUp, CheckCircle, AlertCircle, Loader2, UploadCloud } from 'lucide-react';
import { API_URL } from '../../config/api';
import { getAuthUser, updateStoredAuthUser } from '../../utils/session';

interface UploadDocumentsViewProps {
  token: string | null;
  onSuccess: () => void;
}

export const UploadDocumentsView: React.FC<UploadDocumentsViewProps> = ({ token, onSuccess }) => {
  const [duiFile, setDuiFile] = useState<File | null>(null);
  const [certFile, setCertFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

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

    const formData = new FormData();
    formData.append('dui_document', duiFile);
    if (certFile) formData.append('cert_document', certFile);

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
        const userObj = getAuthUser('worker');
        if (userObj) {
          if (!userObj.worker_profile) userObj.worker_profile = {};
          userObj.worker_profile.dui_document = data.dui_path;
          userObj.worker_profile.cert_document = data.cert_path;
          updateStoredAuthUser(userObj, 'worker');
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

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={isLoading || !duiFile || !certFile}
            className={`w-full py-3 sm:py-4 mt-2 rounded-xl text-white font-bold text-base sm:text-lg flex items-center justify-center gap-2 transition-all ${
              isLoading || !duiFile 
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
        </form>
      </motion.div>
    </div>
  );
};
