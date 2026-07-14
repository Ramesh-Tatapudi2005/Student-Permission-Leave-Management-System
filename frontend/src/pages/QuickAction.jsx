import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, X, Send, Loader2, ShieldCheck, AlertCircle } from 'lucide-react';
import axios from 'axios'; // We use raw axios to bypass the JWT interceptor since this is passwordless

export default function QuickAction() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const action = searchParams.get('action'); // "APPROVED" or "REJECTED"

  const [remarks, setRemarks] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [errorMessage, setErrorMessage] = useState('');

  const isApproving = action === 'APPROVED';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) return;

    setStatus('loading');
    try {
      // FIX: Changed URL to point to the correct /leaves router prefix dynamically
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      await axios.post(`${baseURL}/leaves/quick-action`, {
        token: token,
        action: action,
        remarks: remarks || `Action processed via Secure Email Link.`
      });
      setStatus('success');
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || "Action failed or link expired.");
      setStatus('error');
    }
  };

  if (!token || !action) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl text-center border border-slate-100 max-w-sm">
          <AlertCircle size={40} className="mx-auto text-rose-500 mb-4" />
          <h2 className="text-xl font-black text-slate-800 mb-2">Invalid Link</h2>
          <p className="text-sm text-slate-500 font-medium">This magic link is malformed or missing required security parameters.</p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-10 rounded-[2rem] shadow-xl text-center border border-slate-100 max-w-md w-full animate-scale-in">
          <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check size={40} strokeWidth={3} />
          </div>
          <h2 className="text-3xl font-black text-slate-800 mb-3">Action Complete</h2>
          <p className="text-slate-500 font-medium mb-8 text-sm">
            The request has been successfully {isApproving ? 'Approved' : 'Rejected'}. 
            You may now close this browser tab safely.
          </p>
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-center gap-1">
            <ShieldCheck size={14} /> Secured via University Network
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090e17] flex items-center justify-center p-4 font-sans relative overflow-hidden">
      {/* Cool background effect */}
      <div className={`absolute top-0 right-0 w-[500px] h-[500px] rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3 pointer-events-none opacity-20 ${isApproving ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>

      <div className="bg-white rounded-[2rem] shadow-2xl max-w-md w-full overflow-hidden relative z-10 animate-fade-in-up">
        
        <div className={`p-8 text-center border-b ${isApproving ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${isApproving ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
            {isApproving ? <Check size={32} strokeWidth={3} /> : <X size={32} strokeWidth={3} />}
          </div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Confirm {isApproving ? 'Approval' : 'Rejection'}</h1>
          <p className={`text-[10px] font-black uppercase tracking-widest mt-1 ${isApproving ? 'text-emerald-500' : 'text-rose-500'}`}>
            Secure Remote Access
          </p>
        </div>

        <div className="p-8 space-y-6">
          {status === 'error' && (
            <div className="bg-rose-50 border border-rose-100 text-rose-600 p-4 rounded-xl text-sm font-bold flex items-center gap-2">
              <AlertCircle size={18} /> {errorMessage}
            </div>
          )}

          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
              Optional Remarks / Feedback
            </label>
            <textarea 
              rows="4"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder={`Add any specific reason for ${isApproving ? 'approving' : 'rejecting'}... (Optional)`}
              className={`w-full bg-slate-50 border border-slate-200 text-slate-800 font-medium rounded-2xl p-4 outline-none transition-all shadow-inner resize-none focus:ring-4 ${isApproving ? 'focus:ring-emerald-500/20 focus:border-emerald-500' : 'focus:ring-rose-500/20 focus:border-rose-500'}`}
            ></textarea>
          </div>

          <button 
            onClick={handleSubmit} 
            disabled={status === 'loading'}
            className={`w-full py-4 rounded-2xl font-black text-white shadow-lg transition-all text-xs uppercase tracking-widest active:scale-95 border flex justify-center items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed
              ${isApproving ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/30 border-emerald-400' : 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/30 border-rose-400'}`}
          >
            {status === 'loading' ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            {status === 'loading' ? 'Processing...' : `Confirm Final ${isApproving ? 'Approval' : 'Rejection'}`}
          </button>
        </div>
      </div>
    </div>
  );
}