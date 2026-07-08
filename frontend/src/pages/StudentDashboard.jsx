import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardAPI, getApiError } from '../utils/api';
import {
  Check, X, LogOut, FileText, Map as MapIcon,
  Sparkles, Filter, Search, Bell, User, Lock, Save,
  Menu, ChevronRight, Send, Clock, PlusCircle, AlertCircle, Download,
  Paperclip, Image as ImageIcon, Film, Eye, File as FileIcon, Users, CheckCircle, Loader2,
  ExternalLink, Upload
} from 'lucide-react';

export default function StudentDashboard() {
  const navigate = useNavigate();
  const role = localStorage.getItem('role') || 'STUDENT'; 
  
  const [currentView, setCurrentView] = useState('applications'); 
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // ==========================================
  // CUSTOM NOTIFICATION STATE
  // ==========================================
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const notify = (message, type = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 5000);
  };

  const [activeTab, setActiveTab] = useState('All'); 
  const [typeFilter, setTypeFilter] = useState('All'); 
  const [searchQuery, setSearchQuery] = useState(''); 
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  
  const [showFilters, setShowFilters] = useState(false);
  const filterRef = useRef(null);

  const [profile, setProfile] = useState({ name: 'Loading...', roll_no: '...', department: '...', year: '', is_hosteller: false, proctor_name: 'Not Assigned' });
  const [history, setHistory] = useState([]);
  
  // --- ANNOUNCEMENT STATES ---
  const [announcements, setAnnouncements] = useState([]);
  const [filterRole, setFilterRole] = useState('ALL'); 
  const [unreadCount, setUnreadCount] = useState(0);
  const [emergencyAlert, setEmergencyAlert] = useState(null);
  const [selectedViewAnnouncement, setSelectedViewAnnouncement] = useState(null);

  // --- APPLICATION STATES ---
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [viewRequestModal, setViewRequestModal] = useState(null); 
  const [parentLetter, setParentLetter] = useState(null);
  const [newApp, setNewApp] = useState({
    leave_type: 'Leave',
    subject: '',
    description: '',
    from_date: '',
    to_date: ''
  });

  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [pwStep, setPwStep] = useState(1); // 1=form, 2=otp, 3=success
  const [otpInput, setOtpInput] = useState('');
  const [emailHint, setEmailHint] = useState('');

  // --- LOCALIZED LOADING STATES ---
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [downloadingAppId, setDownloadingAppId] = useState(null);

  const currentViewRef = useRef(currentView);
  useEffect(() => {
    currentViewRef.current = currentView;
  }, [currentView]);

  const fetchData = async () => {
    try {
      const profileRes = await dashboardAPI.getStudentProfile();
      setProfile(profileRes.data);
      
      const historyRes = await dashboardAPI.getStudentHistory();
      setHistory(Array.isArray(historyRes.data) ? historyRes.data : []);

      if (profileRes.data?.roll_no) {
         try {
           const feedRes = await dashboardAPI.getAnnouncementFeed(profileRes.data.roll_no);
           setAnnouncements(Array.isArray(feedRes.data) ? feedRes.data : []);
         } catch (feedErr) {
           console.log("Announcement feed not available yet or empty");
         }
      }
    } catch (err) {
      console.error("Failed to fetch data", err);
      setHistory([]);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // --- REAL-TIME WEBSOCKET ENGINE ---
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || token === 'undefined' || token === 'null' || !profile.roll_no || profile.roll_no === '...') return;

    let ws;
    let reconnectTimer;
    let retryCount = 0;

    const connectWS = () => {
      const wsUrl = `ws://localhost:8000/ws/announcements/${profile.roll_no}`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => { retryCount = 0; };

      ws.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        
        if (payload.type === "NEW_ANNOUNCEMENT") {
          const newAlert = payload.data;
          setAnnouncements(prev => [newAlert, ...prev]);
          
          if (currentViewRef.current !== 'announcements') {
            setUnreadCount(prev => prev + 1);
          }
          if (newAlert.priority_level === 'EMERGENCY') {
            setEmergencyAlert(newAlert);
          }
        }
      };

      ws.onclose = () => {
        const timeout = Math.min(10000, 1000 * Math.pow(2, retryCount));
        retryCount++;
        reconnectTimer = setTimeout(connectWS, timeout);
      };
    };

    connectWS();

    return () => {
      clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [profile.roll_no]); 

  useEffect(() => {
    if (currentView === 'announcements') setUnreadCount(0);
  }, [currentView]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (filterRef.current && !filterRef.current.contains(event.target)) setShowFilters(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [filterRef]);

  const handleLogout = () => {
    setShowLogoutConfirm(false);
    localStorage.clear(); 
    navigate('/login');
  };

  // ── Shared date constants (kept in sync with backend schema) ──────────────
  const DATE_MIN_NOTICE_DAYS  = 1;   // must apply ≥1 day before start
  const DATE_MAX_ADVANCE_DAYS = 90;  // can't start more than 90 days from today
  const DATE_MAX_DURATION     = 30;  // single application ≤ 30 calendar days

  /** Returns 'YYYY-MM-DD' string offset by `n` days from today */
  const offsetDate = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
  };

  /** Count of calendar days between two 'YYYY-MM-DD' strings (inclusive) */
  const daysBetween = (a, b) => {
    if (!a || !b) return 0;
    return Math.round((new Date(b) - new Date(a)) / 86400000) + 1;
  };

  /** True if a 'YYYY-MM-DD' date falls on Saturday (6) or Sunday (0) */
  const isWeekend = (str) => { const d = new Date(str); return d.getDay() === 0 || d.getDay() === 6; };

  /** True when both dates are set and ALL days in the range are weekend days */
  const isWeekendOnlyRange = (from, to) => {
    if (!from || !to) return false;
    const days = daysBetween(from, to);
    if (days > 7) return false;  // can't be all-weekend if > 7 days
    let d = new Date(from);
    const end = new Date(to);
    while (d <= end) {
      if (d.getDay() !== 0 && d.getDay() !== 6) return false;
      d.setDate(d.getDate() + 1);
    }
    return true;
  };

  const handleApply = async (e) => {
    e.preventDefault();

    // ── Industry-level client-side validation ─────────────────────────────
    const todayStr = offsetDate(0);
    const minStartStr = offsetDate(DATE_MIN_NOTICE_DAYS);   // e.g. tomorrow
    const maxStartStr = offsetDate(DATE_MAX_ADVANCE_DAYS);  // 90 days ahead

    if (!newApp.leave_type) {
      notify("Please select a request type (Leave / Outpass / Other).", "error"); return;
    }

    const subject = newApp.subject.trim();
    if (!subject) {
      notify("Subject is required.", "error"); return;
    }
    if (subject.length < 3) {
      notify("Subject must be at least 3 characters.", "error"); return;
    }
    if (subject.length > 255) {
      notify("Subject must not exceed 255 characters.", "error"); return;
    }

    const description = newApp.description.trim();
    if (!description) {
      notify("Description is required.", "error"); return;
    }
    if (description.length < 10) {
      notify("Description must be at least 10 characters.", "error"); return;
    }
    if (description.length > 2000) {
      notify("Description must not exceed 2000 characters.", "error"); return;
    }

    // ── Date validations ──
    if (!newApp.from_date) {
      notify("Start date is required.", "error"); return;
    }
    if (newApp.from_date < todayStr) {
      notify("Start date cannot be in the past.", "error"); return;
    }
    if (newApp.from_date < minStartStr) {
      notify(`Applications require at least ${DATE_MIN_NOTICE_DAYS} day advance notice. Earliest start date is tomorrow.`, "error"); return;
    }
    if (newApp.from_date > maxStartStr) {
      notify(`Start date cannot be more than ${DATE_MAX_ADVANCE_DAYS} days from today.`, "error"); return;
    }

    if (!newApp.to_date) {
      notify("End date is required.", "error"); return;
    }
    if (newApp.to_date < newApp.from_date) {
      notify("End date must be on or after the start date.", "error"); return;
    }

    const duration = daysBetween(newApp.from_date, newApp.to_date);
    if (duration > DATE_MAX_DURATION) {
      notify(`Leave duration (${duration} days) exceeds the ${DATE_MAX_DURATION}-day limit. Please split into separate requests.`, "error"); return;
    }

    // ── File validations ──
    if (!parentLetter) {
      notify("Please attach your parent's handwritten letter (PDF).", "error"); return;
    }
    if (parentLetter.type !== "application/pdf") {
      notify("Only PDF files are accepted for the parent's letter.", "error"); return;
    }
    if (parentLetter.size > 5 * 1024 * 1024) {
      notify("Parent's letter must not exceed 5 MB.", "error"); return;
    }
    // ─────────────────────────────────────────────────────────────────────

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('leave_type', newApp.leave_type);
      formData.append('subject', subject);
      formData.append('description', description);
      formData.append('from_date', newApp.from_date);
      formData.append('to_date', newApp.to_date);
      formData.append('parent_letter', parentLetter);
      await dashboardAPI.applyPermission(formData);
      setShowApplyModal(false);
      setNewApp({ leave_type: 'Leave', subject: '', description: '', from_date: '', to_date: '' });
      setParentLetter(null);
      notify("Request submitted successfully.", "success");
      await fetchData();
    } catch (err) {
      notify(getApiError(err, 'Failed to submit request. Please try again.'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestOTP = async (e) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      notify("New passwords do not match.", "error"); return;
    }
    if (passwords.new.length < 8) {
      notify("New password must be at least 8 characters.", "error"); return;
    }
    if (passwords.new === passwords.current) {
      notify("New password must differ from the current password.", "error"); return;
    }
    setIsChangingPassword(true);
    try {
      const res = await dashboardAPI.requestPasswordOTP({
        current_password: passwords.current,
        new_password: passwords.new,
        confirm_password: passwords.confirm,
      });
      setEmailHint(res.data.email_hint);
      setOtpInput('');
      setPwStep(2);
    } catch (err) {
      notify(err.response?.data?.detail || "Failed to send OTP. Please try again.", "error");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    if (otpInput.length !== 6) {
      notify("Please enter the 6-digit OTP.", "error"); return;
    }
    setIsChangingPassword(true);
    try {
      await dashboardAPI.verifyPasswordOTP({ otp_code: otpInput });
      setPwStep(3);
    } catch (err) {
      notify(err.response?.data?.detail || "Invalid or expired OTP.", "error");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const resetPasswordFlow = () => {
    setPwStep(1);
    setPasswords({ current: '', new: '', confirm: '' });
    setOtpInput('');
    setEmailHint('');
  };

  const handleDownloadLetter = async (appId) => {
    setDownloadingAppId(appId);
    try {
      const response = await dashboardAPI.downloadApprovalLetter(appId);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Approval_Letter_APP_${appId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      notify("Letter downloaded successfully.", "success");
    } catch (error) {
      notify("Failed to download letter. It may not be generated yet.", "error");
    } finally {
      setDownloadingAppId(null);
    }
  };

  const handleViewParentLetter = async (appId) => {
    try {
      const response = await dashboardAPI.viewParentLetter(appId);
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
    } catch (error) {
      notify("Failed to fetch parent's letter.", "error");
    }
  };

  const handleOpenAnnouncement = async (ann) => {
    setSelectedViewAnnouncement(ann);
    if (profile?.roll_no) {
      try {
        await dashboardAPI.acknowledgeAnnouncement(ann.announcement_id, profile.roll_no);
      } catch (e) {
        console.warn("Read receipt sync failed", e);
      }
    }
  };

  const stats = {
    total: history.length,
    pending: history.filter(a => a.status === 'PENDING').length,
    approved: history.filter(a => a.status === 'APPROVED').length,
    rejected: history.filter(a => a.status === 'REJECTED').length
  };

  const filteredList = history.filter(app => {
    const matchesTab = activeTab === 'All' ? true : app.status.toUpperCase() === activeTab.toUpperCase();
    const matchesType = typeFilter === 'All' ? true : app.leave_type === typeFilter;
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = searchQuery === '' || (app.subject || '').toLowerCase().includes(searchLower) || `app-${app.application_id}`.includes(searchLower);
    
    let matchesDate = true;
    if (filterStartDate) matchesDate = matchesDate && app.from_date >= filterStartDate;
    if (filterEndDate) matchesDate = matchesDate && app.from_date <= filterEndDate;
    
    return matchesTab && matchesType && matchesSearch && matchesDate;
  });

  const getTabPosition = () => {
    switch(activeTab) {
      case 'All': return 'translate-x-[2px] w-[calc(25%-4px)]';
      case 'Pending': return 'translate-x-[calc(100%+2px)] w-[calc(25%-4px)]';
      case 'Approved': return 'translate-x-[calc(200%+2px)] w-[calc(25%-4px)]';
      case 'Rejected': return 'translate-x-[calc(300%+2px)] w-[calc(25%-4px)]';
      default: return 'translate-x-[2px] w-[calc(25%-4px)]';
    }
  };

  const renderProgressBar = (app) => {
    const isApproved = app.status === 'APPROVED';
    const isRejected = app.status === 'REJECTED';
    const stage = app.current_approval_stage || 'PROCTOR';

    const steps = [
      { id: 'PROCTOR', label: 'PROCTOR' },
      { id: 'HOD', label: 'HOD / WARDEN' },
      { id: 'FINAL', label: 'FINAL' }
    ];

    let activeIndex = 0;
    if (isApproved) activeIndex = 3; 
    else if (stage === 'PROCTOR') activeIndex = 0;
    else if (stage === 'HOD' || stage === 'WARDEN') activeIndex = 1;
    else if (stage === 'FINAL' || stage === 'APPROVED') activeIndex = 2;

    return (
      <div className="hidden lg:flex items-center w-full max-w-[280px] xl:max-w-sm mx-auto">
        {steps.map((step, index) => {
          const isCompleted = isApproved || index < activeIndex;
          const isCurrent = !isApproved && !isRejected && index === activeIndex;
          const isFailed = isRejected && index === activeIndex;
          const isPending = !isCompleted && !isCurrent && !isFailed;

          return (
            <React.Fragment key={step.id}>
              <div className="flex flex-col items-center relative z-10">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] shadow-sm transition-all duration-500
                  ${isCompleted ? 'bg-emerald-500 shadow-emerald-500/30' : 
                    isFailed ? 'bg-rose-500 shadow-rose-500/30' : 
                    isCurrent ? 'bg-amber-400 shadow-amber-400/30 animate-pulse-glow' : 
                    'bg-slate-100 border border-slate-200'}`}>
                  {isCompleted && <Check size={12} strokeWidth={4} />}
                  {isFailed && <X size={12} strokeWidth={4} />}
                  {isCurrent && <Clock size={12} strokeWidth={3} />}
                  {isPending && <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />}
                </div>
                <span className={`absolute top-8 text-[8px] font-black uppercase tracking-widest whitespace-nowrap
                  ${isCompleted ? 'text-emerald-600' : 
                    isFailed ? 'text-rose-600' : 
                    isCurrent ? 'text-amber-600' : 
                    'text-slate-400'}`}>
                  {step.label}
                  {isFailed && <span className="block text-[7px] text-rose-400 -mt-1 text-center">(Rejected)</span>}
                </span>
              </div>

              {index < steps.length - 1 && (
                <div className="flex-1 h-0.5 mx-2 bg-slate-100 relative overflow-hidden rounded-full">
                  <div className={`absolute left-0 top-0 bottom-0 transition-all duration-1000 ease-spring
                    ${isCompleted ? 'w-full bg-emerald-400' : 'w-0 bg-emerald-400'}`}>
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  // ==========================================
  // VIEW: 1. APPLICATIONS (MY REQUESTS)
  // ==========================================
  const renderApplications = () => (
    <div className="w-full h-full flex flex-col overflow-y-auto md:overflow-hidden no-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
      <div className="shrink-0 z-20">
        <div className="bg-[#0c3669] text-white pt-8 pb-32 px-6 md:px-12">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-4">
              <button className="md:hidden p-2.5 rounded-xl bg-white/10 border border-white/10" onClick={() => setIsMobileMenuOpen(true)}>
                <Menu size={22} />
              </button>
              <div>
                <p className="text-blue-200 font-medium text-xs uppercase tracking-widest mb-1">Student Portal</p>
                <h1 className="text-3xl md:text-4xl font-black tracking-tight">My Requests</h1>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 md:px-12 -mt-24 relative z-20">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {[
              { label: 'Total Requests', val: stats.total, icon: <FileText size={24} />, iconBg: 'bg-blue-50 text-blue-600' },
              { label: 'Pending Review', val: stats.pending, icon: <Clock size={24} />, iconBg: 'bg-amber-50 text-amber-600' },
              { label: 'Approved', val: stats.approved, icon: <Check size={24} />, iconBg: 'bg-emerald-50 text-emerald-600' },
              { label: 'Rejected', val: stats.rejected, icon: <X size={24} />, iconBg: 'bg-rose-50 text-rose-600' }
            ].map((s, i) => (
              <div key={i} className="bg-white p-5 md:p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 flex flex-col md:flex-row items-start md:items-center gap-4 group hover:-translate-y-1 transition-all duration-300" style={{ animationDelay: `${i * 100}ms` }}>
                <div className={`p-3 md:p-4 rounded-2xl ${s.iconBg} group-hover:scale-110 transition-transform`}>
                  {s.icon}
                </div>
                <div>
                  <h3 className="text-2xl md:text-3xl font-black text-slate-800">{s.val}</h3>
                  <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 md:px-12 pt-10 pb-4 animate-fade-in" style={{ animationDelay: '400ms' }}>
          <div className="flex flex-col xl:flex-row items-center justify-between gap-6">
            
            <div className="relative p-1.5 bg-slate-200/50 backdrop-blur-md rounded-2xl border border-white/50 flex w-full xl:w-[450px] shadow-inner overflow-x-auto no-scrollbar min-w-[320px]">
              <div className={`absolute top-1.5 bottom-1.5 bg-white rounded-xl transition-all duration-500 ease-spring shadow-sm ${getTabPosition()}`}></div>
              {['All', 'Pending', 'Approved', 'Rejected'].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)} className={`relative z-10 flex-1 px-2 py-3 text-[11px] sm:text-xs font-black transition-colors ${activeTab === tab ? 'text-[#0C3669]' : 'text-slate-500 hover:text-slate-800'}`}>
                  {tab.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 w-full xl:w-auto">
              <div className="relative group w-full sm:w-64">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#0C3669] transition-colors" size={18} />
                <input type="text" placeholder="Search Request..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white border border-slate-200 rounded-2xl pl-12 pr-6 py-4 text-sm font-bold shadow-sm focus:ring-4 focus:ring-[#0C3669]/10 outline-none transition-all hover:border-slate-300" />
              </div>

              <div className="relative w-full sm:w-auto" ref={filterRef}>
                <button onClick={() => setShowFilters(!showFilters)} className="w-full px-8 py-4 bg-white border border-slate-200 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-slate-50 transition-all shadow-sm active:scale-95">
                  <Filter size={16} className={typeFilter !== 'All' ? 'text-[#0C3669]' : ''} /> Filters
                </button>
                {showFilters && (
                  <div className="absolute top-full right-0 left-0 sm:left-auto mt-4 w-full sm:w-80 glass-popover z-50 p-6 animate-scale-in origin-top-right">
                    <div className="space-y-6">
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Request Type</p>
                        <div className="grid grid-cols-2 gap-2">
                          {['All', 'Leave', 'Outpass', 'Other'].map(t => (
                            <button key={t} onClick={() => setTypeFilter(t)} className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${typeFilter === t ? 'bg-[#0C3669] text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="border-t border-slate-100 pt-4">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Date Range</p>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 block">From</label>
                            <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-[#0C3669]/20 transition-all" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 block">To</label>
                            <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-[#0C3669]/20 transition-all" />
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 border-t border-slate-100 pt-4">
                        <button onClick={() => {setTypeFilter('All'); setFilterStartDate(''); setFilterEndDate('');}} className="flex-1 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:bg-slate-100 rounded-xl transition-colors">Reset</button>
                        <button onClick={() => setShowFilters(false)} className="flex-1 py-3 bg-[#0C3669] text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg">Apply</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              <button onClick={() => setShowApplyModal(true)} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#F58220] hover:bg-orange-500 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 hover:-translate-y-0.5 active:scale-95">
                <PlusCircle size={18} /> New Request
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 pb-10 relative z-10 w-full no-scrollbar [transform:translateZ(0)] overscroll-contain md:overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="max-w-7xl mx-auto px-6 md:px-12 mt-4">
          <div className="space-y-5">
            {filteredList.length === 0 ? (
              <div className="bg-white p-20 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 text-center animate-fade-in flex flex-col items-center">
                <div className="h-20 w-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                  <FileText size={32} className="text-slate-300" />
                </div>
                <h3 className="text-xl font-bold text-slate-700 mb-2">No Requests Found</h3>
                <p className="text-slate-500 font-medium text-sm max-w-md">
                  {searchQuery || filterStartDate || filterEndDate || typeFilter !== 'All' ? `Adjust your filters to see more results.` : `You haven't initiated any requests yet.`}
                </p>
              </div>
            ) : filteredList.map((app, idx) => (
              <div 
                key={app.application_id} 
                onClick={() => setViewRequestModal(app)}
                className={`premium-item group animate-stagger-in relative overflow-hidden cursor-pointer flex flex-col`} 
                style={{ animationDelay: `${idx * 80}ms` }}
              >
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${app.status === 'APPROVED' ? 'bg-emerald-400' : app.status === 'REJECTED' ? 'bg-rose-400' : 'bg-amber-400'}`}></div>
                <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6 p-6 pl-8 relative">
                  
                  <div className="flex-1 space-y-1 w-full xl:w-auto">
                    <div className="flex items-center gap-3 flex-wrap mb-1">
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${app.leave_type === 'Leave' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : app.leave_type === 'Outpass' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                        {app.leave_type}
                      </span>
                      <span className="text-xs font-bold text-slate-300 uppercase">APP-{app.application_id}</span>
                    </div>
                    <h3 className="text-xl font-black text-slate-800">{app.subject}</h3>
                    <p className="text-sm font-bold text-slate-400 italic line-clamp-1">"{app.description}"</p>
                  </div>

                  <div className="hidden lg:flex flex-1 justify-center w-full xl:w-auto my-4 xl:my-0">
                    {renderProgressBar(app)}
                  </div>

                  <div className="w-full xl:w-auto flex flex-col sm:flex-row xl:flex-col items-center xl:items-end justify-between xl:justify-center gap-4 border-t border-slate-100 xl:border-none pt-4 xl:pt-0">
                    <div className="text-left sm:text-center xl:text-right space-y-1 w-full sm:w-auto">
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest hidden xl:block mb-1">Duration</p>
                      <div className="inline-flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                        <span className="font-bold text-slate-700 text-sm">{app.from_date}</span>
                        <ChevronRight size={14} className="text-slate-300" />
                        <span className="font-bold text-slate-700 text-sm">{app.to_date}</span>
                      </div>
                    </div>

                    <div className="w-full sm:w-auto">
                      {app.status === 'APPROVED' ? (
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDownloadLetter(app.application_id); }} 
                          disabled={downloadingAppId === app.application_id}
                          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-emerald-50 text-emerald-600 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-emerald-200 hover:bg-emerald-500 hover:text-white transition-all duration-300 shadow-sm hover:shadow-emerald-200 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                          {downloadingAppId === app.application_id ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                          {downloadingAppId === app.application_id ? 'Downloading...' : 'Download Letter'}
                        </button>
                      ) : (
                        <div className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border shadow-sm ${app.status === 'REJECTED' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                          {app.status === 'REJECTED' ? <X size={16}/> : <Clock size={16}/>}
                          {app.status}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Clean indicator that this card can be clicked to view remarks */}
                <div className="w-full bg-slate-50 text-center py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest group-hover:bg-orange-50 group-hover:text-[#F58220] transition-colors border-t border-slate-100">
                  Click to view full details & remarks
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // ==========================================
  // VIEW: 2. ANNOUNCEMENTS
  // ==========================================
  const renderAnnouncements = () => {
    const filteredAnnouncements = announcements.filter(ann => 
      filterRole === 'ALL' ? true : ann.posted_role === filterRole
    );

    return (
      <div className="w-full h-full flex flex-col bg-slate-50 overflow-y-auto md:overflow-hidden no-scrollbar">
        
        {/* 1. FIXED TOP SECTION */}
        <div className="shrink-0 pt-4 md:pt-8 px-4 md:px-8 w-full max-w-6xl mx-auto z-10">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button className="md:hidden text-slate-500 hover:text-slate-800 p-2 rounded-xl bg-white shadow-sm border border-slate-200" onClick={() => setIsMobileMenuOpen(true)}>
                <Menu size={24} />
              </button>
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse-glow"></div>
                  <p className="text-emerald-600 font-bold tracking-[0.2em] text-[10px] uppercase">Live Updates</p>
                </div>
                <h2 className="text-3xl md:text-4xl font-black text-slate-800 tracking-tight">Announcements</h2>
              </div>
            </div>

            {/* FILTER DROPDOWN */}
            <div className="bg-white p-1 rounded-xl shadow-sm border border-slate-200 hidden sm:block">
              <select 
                value={filterRole} 
                onChange={(e) => setFilterRole(e.target.value)}
                className="bg-transparent text-xs font-black uppercase tracking-widest text-slate-600 outline-none px-4 py-2 cursor-pointer"
              >
                <option value="ALL">All Sources</option>
                <option value="HOD">From HOD</option>
                <option value="FACULTY">From Faculty</option>
              </select>
            </div>
          </div>

          {/* MOBILE FILTER DROPDOWN */}
          <div className="bg-white p-1 rounded-xl shadow-sm border border-slate-200 sm:hidden mb-6">
            <select 
              value={filterRole} 
              onChange={(e) => setFilterRole(e.target.value)}
              className="bg-transparent text-xs font-black uppercase tracking-widest text-slate-600 outline-none px-4 py-2 cursor-pointer w-full text-center"
            >
              <option value="ALL">All Sources</option>
              <option value="HOD">From HOD</option>
              <option value="FACULTY">From Faculty</option>
            </select>
          </div>
        </div>

        {/* 2. SCROLLABLE CARDS GRID */}
        <div className="flex-1 px-4 md:px-8 pb-12 w-full max-w-6xl mx-auto no-scrollbar [transform:translateZ(0)] md:overflow-y-auto">
          {filteredAnnouncements.length === 0 ? (
            <div className="bg-white/80 backdrop-blur-xl border border-dashed border-slate-300 rounded-[2rem] p-16 text-center mt-4">
              <Bell size={32} className="mx-auto text-slate-300 mb-4" />
              <h3 className="text-xl font-bold text-slate-600 mb-1">No Announcements Found</h3>
              <p className="text-slate-400 text-sm">You're all caught up! No active announcements.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredAnnouncements.map((ann, idx) => (
                <div 
                  key={ann.announcement_id || idx} 
                  onClick={() => handleOpenAnnouncement(ann)}
                  className={`bg-white p-6 rounded-2xl border shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer relative overflow-hidden flex flex-col group hover:-translate-y-1 animate-stagger-in
                    ${ann.priority_level === 'HIGH' ? 'border-amber-200 bg-amber-50/10' : 
                      ann.priority_level === 'EMERGENCY' ? 'border-rose-300 bg-rose-50/30 shadow-[0_0_15px_rgba(225,29,72,0.1)]' : 
                      'border-slate-100'}`}
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <div className={`absolute left-0 top-0 bottom-0 w-1.5 transition-colors 
                    ${ann.priority_level === 'HIGH' ? 'bg-amber-400' : 
                      ann.priority_level === 'EMERGENCY' ? 'bg-rose-500 animate-pulse' :
                      'bg-[#0C3669]/40'}`}>
                  </div>

                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-100 px-2 py-1 rounded">
                      From: {ann.posted_role}
                    </span>
                    <span className={`text-[9px] px-2.5 py-1 rounded font-black tracking-widest uppercase
                      ${ann.priority_level === 'EMERGENCY' ? 'bg-rose-100 text-rose-600' : 
                        ann.priority_level === 'HIGH' ? 'bg-amber-100 text-amber-600' : 
                        'text-slate-400'}`}>
                      {ann.priority_level !== 'STANDARD' ? ann.priority_level : new Date(ann.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex-1 mb-6">
                    <h4 className="text-lg font-black text-slate-800 leading-tight mb-2 line-clamp-2 group-hover:text-[#0C3669] transition-colors">
                      {ann.title}
                    </h4>
                    <p className="text-sm text-slate-500 font-medium line-clamp-2">
                      {ann.description}
                    </p>
                  </div>

                  <div className="pt-4 mt-auto border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-bold text-[#F58220] group-hover:text-orange-600 flex items-center gap-1 transition-colors">
                      <Eye size={14} /> Read More
                    </span>
                    
                    {ann.attachments?.length > 0 && (
                      <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded border border-slate-100 text-slate-500">
                        <Paperclip size={12} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">{ann.attachments.length} Attached</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ==========================================
  // VIEW: 3. PROFILE
  // ==========================================
  const renderProfile = () => (
    <div className="w-full h-full overflow-y-auto no-scrollbar bg-slate-50">
      <div className="animate-fade-in-up p-4 md:p-8 w-full max-w-6xl mx-auto">
        <div className="mb-6 md:mb-10 flex items-center gap-4">
          <button className="md:hidden text-slate-500 hover:text-slate-800 p-2 rounded-xl bg-white shadow-sm border border-slate-200" onClick={() => setIsMobileMenuOpen(true)}>
            <Menu size={24} />
          </button>
          <div>
            <h2 className="text-3xl md:text-4xl font-black text-slate-800 tracking-tight">My Profile</h2>
            <p className="text-slate-500 mt-2 text-sm md:text-base font-medium">View your details and manage your password.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white relative overflow-hidden flex flex-col items-center text-center">
              <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-br from-[#0C3669] to-[#F58220]"></div>
              
              <div className="h-28 w-28 md:h-32 md:w-32 bg-white p-2 rounded-full shadow-xl relative z-10 mt-8 mb-4">
                <div className="w-full h-full bg-slate-100 rounded-full flex items-center justify-center text-slate-400 text-4xl md:text-5xl font-black inner-shadow">
                  {profile.name.charAt(0)}
                </div>
              </div>
              
              <h3 className="text-xl font-black text-slate-800 tracking-tight">{profile.name}</h3>
              <span className="bg-[#0C3669] text-white text-[10px] font-black px-3 py-1 rounded-md uppercase tracking-widest mt-2 mb-6 shadow-md">
                STUDENT
              </span>
              
              <div className="w-full text-left space-y-4 mt-2 pt-6 border-t border-slate-100">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest block mb-1">Roll Number</label>
                  <p className="font-bold text-slate-800 text-base">{profile.roll_no}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest block mb-1">Department</label>
                  <p className="font-bold text-slate-800 text-base">{profile.department}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest block mb-1">Year</label>
                    <p className="font-bold text-slate-800 text-base">{profile.year}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest block mb-1">Status</label>
                    <p className="font-bold text-slate-800 text-sm">{profile.is_hosteller ? 'Hosteller' : 'Day Scholar'}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest block mb-1">Assigned Proctor</label>
                    <p className="font-bold text-slate-800 text-base">{profile.proctor_name}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-6 md:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white">
              <div className="flex items-center gap-4 mb-8 pb-8 border-b border-slate-100">
                <div className="p-3 bg-gradient-to-br from-rose-100 to-red-100 text-rose-500 rounded-xl shadow-inner"><Lock size={24} /></div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">Change Password</h3>
                  <p className="text-sm font-medium text-slate-500 hidden sm:block mt-1">Update your password to keep your account secure.</p>
                </div>
              </div>

              {/* Step 1 — Enter passwords */}
              {pwStep === 1 && (
                <form className="space-y-6" onSubmit={handleRequestOTP}>
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Current Password</label>
                    <input type="password" value={passwords.current} onChange={(e) => setPasswords({...passwords, current: e.target.value})} required className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-bold rounded-2xl focus:ring-4 focus:ring-[#0C3669]/20 focus:border-[#0C3669] block p-4 outline-none transition-all shadow-inner" placeholder="Enter current password" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 md:gap-6">
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">New Password</label>
                      <input type="password" value={passwords.new} onChange={(e) => setPasswords({...passwords, new: e.target.value})} required minLength={8} className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-bold rounded-2xl focus:ring-4 focus:ring-[#0C3669]/20 focus:border-[#0C3669] block p-4 outline-none transition-all shadow-inner" placeholder="New password" />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Confirm New Password</label>
                      <input type="password" value={passwords.confirm} onChange={(e) => setPasswords({...passwords, confirm: e.target.value})} required className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-bold rounded-2xl focus:ring-4 focus:ring-rose-500/20 focus:border-rose-500 block p-4 outline-none transition-all shadow-inner" placeholder="Confirm new password" />
                    </div>
                  </div>
                  <div className="pt-4 flex justify-end">
                    <button type="submit" disabled={isChangingPassword} className="w-full sm:w-auto flex justify-center items-center gap-2 bg-[#0C3669] hover:bg-[#0a2d59] text-white px-8 py-4 rounded-2xl font-bold text-sm transition-all shadow-xl shadow-[#0C3669]/20 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed">
                      {isChangingPassword ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                      {isChangingPassword ? 'Sending OTP...' : 'Send OTP to Email'}
                    </button>
                  </div>
                </form>
              )}

              {/* Step 2 — Enter OTP */}
              {pwStep === 2 && (
                <form className="space-y-6" onSubmit={handleVerifyOTP}>
                  <div className="bg-[#0C3669]/5 border border-[#0C3669]/20 rounded-2xl p-5 flex items-start gap-3">
                    <Bell size={18} className="text-[#0C3669] mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-[#0C3669] font-medium leading-relaxed">
                      A 6-digit OTP has been sent to <strong>{emailHint}</strong>. It expires in 10 minutes.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Enter OTP</label>
                    <input
                      type="text"
                      value={otpInput}
                      onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      required
                      maxLength={6}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-black text-2xl tracking-[0.5em] text-center rounded-2xl focus:ring-4 focus:ring-[#0C3669]/20 focus:border-[#0C3669] block p-4 outline-none transition-all shadow-inner"
                      placeholder="------"
                    />
                  </div>
                  <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-between">
                    <button type="button" onClick={resetPasswordFlow} className="flex justify-center items-center gap-2 text-slate-500 hover:text-slate-800 px-6 py-3 rounded-2xl font-bold text-sm transition-all border border-slate-200 hover:border-slate-300">
                      <X size={16} /> Back
                    </button>
                    <button type="submit" disabled={isChangingPassword || otpInput.length !== 6} className="flex justify-center items-center gap-2 bg-[#0C3669] hover:bg-[#0a2d59] text-white px-8 py-4 rounded-2xl font-bold text-sm transition-all shadow-xl shadow-[#0C3669]/20 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed">
                      {isChangingPassword ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                      {isChangingPassword ? 'Verifying...' : 'Verify & Change Password'}
                    </button>
                  </div>
                </form>
              )}

              {/* Step 3 — Success */}
              {pwStep === 3 && (
                <div className="flex flex-col items-center justify-center py-8 gap-5 text-center">
                  <div className="p-5 bg-emerald-100 rounded-full">
                    <CheckCircle size={40} className="text-emerald-500" />
                  </div>
                  <div>
                    <h4 className="text-lg font-black text-slate-800">Password Updated!</h4>
                    <p className="text-sm text-slate-500 mt-1">Your password has been changed successfully.</p>
                  </div>
                  <button onClick={resetPasswordFlow} className="mt-2 px-6 py-3 bg-[#0C3669] text-white font-bold rounded-2xl text-sm hover:bg-[#0a2d59] transition-all">
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ==========================================
  // MASTER LAYOUT: SIDEBAR + CONTENT
  // ==========================================
  return (
    <>
      <style>{`
        @keyframes scale-in { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes pulse-glow { 0%, 100% { opacity: 0.5; box-shadow: 0 0 10px #fbbf24; } 50% { opacity: 1; box-shadow: 0 0 20px #fbbf24, 0 0 30px #fbbf24; } }
        @keyframes stagger-in { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes fade-in-up { 0% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } }

        .animate-fade-in-up { animation: fade-in-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-stagger-in { animation: stagger-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .animate-pulse-glow { animation: pulse-glow 2s infinite; }
        .premium-item { background: white; border: 1px solid #f1f5f9; border-radius: 2rem; transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        .premium-item:hover { transform: translateY(-4px); box-shadow: 0 20px 40px -10px rgba(0,0,0,0.05); border-color: #e2e8f0; }
        .active-nav-link { position: relative; color: white !important; background: linear-gradient(90deg, rgba(245,130,32,0.18) 0%, transparent 100%); }
        .active-nav-link::after { content: ''; position: absolute; left: 0; top: 20%; bottom: 20%; width: 3px; background: #F58220; border-radius: 0 4px 4px 0; box-shadow: 0 0 12px #F58220; }
        .glass-popover { background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(30px); border: 1px solid white; border-radius: 2.5rem; box-shadow: 0 30px 60px -12px rgba(0,0,0,0.15); }
        .ease-spring { transition-timing-function: cubic-bezier(0.68, -0.6, 0.32, 1.6); }
        
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
      `}</style>

      {/* Custom Notification Toast */}
      {notification.show && (
        <div className="fixed top-6 right-6 z-[1000] animate-fade-in-up">
          <div className={`flex items-start gap-3 px-6 py-4 rounded-2xl shadow-2xl border max-w-sm ${notification.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-700' : notification.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
            <div className="shrink-0 mt-0.5">
              {notification.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
            </div>
            <p className="text-sm font-bold whitespace-pre-wrap leading-relaxed">{notification.message}</p>
            <button onClick={() => setNotification({ show: false, message: '', type: 'success' })} className="ml-2 shrink-0 opacity-50 hover:opacity-100 transition-opacity">
              <X size={16}/>
            </button>
          </div>
        </div>
      )}

      <div className="flex h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-50 via-white to-orange-50/10 overflow-hidden font-sans text-slate-800 relative selection:bg-[#F58220]/20">
        
        {isMobileMenuOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300" onClick={() => setIsMobileMenuOpen(false)} />
        )}

        <aside className={`fixed md:static inset-y-0 left-0 z-50 w-[280px] bg-[#0C3669] text-slate-200 flex flex-col shrink-0 border-r border-white/5 transition-transform duration-700 cubic-bezier(0.16, 1, 0.3, 1) shadow-2xl md:shadow-none ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
          <div className="h-24 flex items-center justify-between px-8 border-b border-white/5 mb-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#F58220]/10 rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none"></div>
            <div className="flex items-center gap-4 relative z-10">
              <div className="h-10 w-10 bg-[#F58220] rounded-xl flex items-center justify-center font-black text-white text-xl shadow-lg">
                {profile.roll_no !== '...' ? profile.roll_no.charAt(0) : 'S'}
              </div>
              <div className="flex flex-col">
                <span className="font-black text-lg tracking-tight text-white drop-shadow-sm leading-tight">
                  {profile.roll_no !== '...' ? profile.roll_no : 'Student'}
                </span>
                <span className="text-[9px] font-bold text-[#F58220] uppercase tracking-widest mt-0.5">
                  Portal
                </span>
              </div>
            </div>
            <button className="md:hidden text-slate-400 hover:text-white bg-white/5 p-2 rounded-lg" onClick={() => setIsMobileMenuOpen(false)}><X size={20} /></button>
          </div>

          <nav className="flex-1 px-5 space-y-3 relative z-10">
            {[
              { id: 'applications', label: 'My Requests', icon: <FileText size={20}/> },
              { id: 'announcements', label: 'Announcements', icon: <Bell size={20}/> },
              { id: 'profile', label: 'My Profile', icon: <User size={20}/> }
            ].map(item => (
              <button 
                key={item.id} 
                onClick={() => {setCurrentView(item.id); setIsMobileMenuOpen(false);}} 
                className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl font-bold transition-all duration-300 group overflow-hidden relative ${currentView === item.id ? 'active-nav-link shadow-md text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
              >
                {currentView !== item.id && <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>}
                <div className="flex items-center gap-3 relative z-10">
                  {React.cloneElement(item.icon, { className: `transition-transform duration-300 ${currentView === item.id ? 'scale-110' : 'group-hover:scale-110'}` })}
                  <span className="tracking-wide text-sm">{item.label}</span>
                </div>
                {item.id === 'announcements' && unreadCount > 0 ? (
                  <span className="relative z-10 bg-rose-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg shadow-rose-500/30 animate-pulse">
                    {unreadCount} NEW
                  </span>
                ) : currentView === item.id ? (
                  <div className="w-1.5 h-1.5 rounded-full bg-white relative z-10 animate-pulse"></div>
                ) : null}
              </button>
            ))}
          </nav>

          <div className="p-6 border-t border-white/5 relative z-10">
            <button onClick={() => setShowLogoutConfirm(true)} className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl font-bold text-xs text-slate-400 bg-white/5 hover:bg-rose-500 hover:text-white hover:shadow-lg hover:shadow-rose-500/25 transition-all duration-300 group uppercase tracking-widest">
              <LogOut size={14} className="transition-transform group-hover:-translate-x-1" /> Log Out
            </button>
          </div>
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden w-full relative">
          {currentView === 'applications' && renderApplications()}
          {currentView === 'announcements' && renderAnnouncements()}
          {currentView === 'profile' && renderProfile()}

          {/* APPLICATION FORM MODAL */}
          {showApplyModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-slate-900/60 backdrop-blur-md animate-fade-in">
              <div className="bg-white rounded-[3rem] w-full max-w-2xl overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)] animate-scale-in flex flex-col max-h-[95vh] md:max-h-[90vh]">
                
                <div className="bg-[#0c3669] p-6 md:p-8 text-white flex justify-between items-start shrink-0">
                  <div>
                    <h2 className="text-2xl font-black tracking-tight mb-1">New Permission Request</h2>
                    <p className="text-blue-200 font-medium text-xs uppercase tracking-widest">Fill in the details below</p>
                  </div>
                  <button onClick={() => setShowApplyModal(false)} className="text-white/60 hover:text-white bg-white/10 hover:bg-white/20 p-2.5 rounded-xl transition-all"><X size={20} /></button>
                </div>

                <div className="p-8 md:p-10 overflow-y-auto flex-1 bg-slate-50/50 no-scrollbar">
                  <form onSubmit={handleApply} className="space-y-6">
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="text-[10px] md:text-xs text-slate-400 font-black uppercase tracking-widest mb-2 block">Request Type</label>
                        <select value={newApp.leave_type} onChange={(e) => setNewApp({...newApp, leave_type: e.target.value})} className="w-full bg-white border border-slate-200 text-slate-800 font-bold rounded-2xl focus:ring-4 focus:ring-[#0C3669]/20 focus:border-[#0C3669] block p-4 outline-none transition-all shadow-sm cursor-pointer text-sm">
                          <option value="Leave">Leave</option>
                          <option value="Outpass">Outpass</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] md:text-xs text-slate-400 font-black uppercase tracking-widest mb-2 block">Subject Line</label>
                        <input required type="text" value={newApp.subject} onChange={(e) => setNewApp({...newApp, subject: e.target.value})} placeholder="Brief reason..." className="w-full bg-white border border-slate-200 text-slate-800 font-bold rounded-2xl focus:ring-4 focus:ring-[#0C3669]/20 focus:border-[#0C3669] block p-4 outline-none transition-all shadow-inner text-sm" />
                      </div>
                    </div>

                    <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* ── Start Date ── */}
                        <div>
                          <label className="text-[10px] md:text-xs text-slate-400 font-black uppercase tracking-widest mb-2 block">
                            Start Date <span className="text-rose-400">*</span>
                          </label>
                          <input
                            required
                            type="date"
                            value={newApp.from_date}
                            min={offsetDate(DATE_MIN_NOTICE_DAYS)}
                            max={offsetDate(DATE_MAX_ADVANCE_DAYS)}
                            onChange={(e) => {
                              const newFrom = e.target.value;
                              setNewApp(prev => ({
                                ...prev,
                                from_date: newFrom,
                                // Auto-reset to_date if it's now before the new start or exceeds max duration
                                to_date: prev.to_date && (
                                  prev.to_date < newFrom ||
                                  daysBetween(newFrom, prev.to_date) > DATE_MAX_DURATION
                                ) ? '' : prev.to_date
                              }));
                            }}
                            className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-bold rounded-xl focus:ring-4 focus:ring-[#0C3669]/20 focus:border-[#0C3669] block p-4 outline-none transition-all shadow-inner cursor-pointer text-sm"
                          />
                          <p className="text-[10px] text-slate-400 mt-1.5 font-medium">
                            Min: tomorrow · Max: {DATE_MAX_ADVANCE_DAYS} days from today
                          </p>
                        </div>

                        {/* ── End Date ── */}
                        <div>
                          <label className="text-[10px] md:text-xs text-slate-400 font-black uppercase tracking-widest mb-2 block">
                            End Date <span className="text-rose-400">*</span>
                          </label>
                          <input
                            required
                            type="date"
                            value={newApp.to_date}
                            min={newApp.from_date || offsetDate(DATE_MIN_NOTICE_DAYS)}
                            max={
                              newApp.from_date
                                ? (() => {
                                    const d = new Date(newApp.from_date);
                                    d.setDate(d.getDate() + DATE_MAX_DURATION - 1);
                                    return d.toISOString().split('T')[0];
                                  })()
                                : offsetDate(DATE_MAX_ADVANCE_DAYS + DATE_MAX_DURATION)
                            }
                            onChange={(e) => setNewApp({...newApp, to_date: e.target.value})}
                            className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-bold rounded-xl focus:ring-4 focus:ring-[#0C3669]/20 focus:border-[#0C3669] block p-4 outline-none transition-all shadow-inner cursor-pointer text-sm"
                          />
                          <p className="text-[10px] text-slate-400 mt-1.5 font-medium">
                            Must be on or after start date · Max {DATE_MAX_DURATION} days duration
                          </p>
                        </div>
                      </div>

                      {/* ── Live duration badge ── */}
                      {newApp.from_date && newApp.to_date && (() => {
                        const days = daysBetween(newApp.from_date, newApp.to_date);
                        const weekendOnly = isWeekendOnlyRange(newApp.from_date, newApp.to_date);
                        const overLimit = days > DATE_MAX_DURATION;
                        return (
                          <div className={`flex flex-wrap items-center gap-3 pt-2 border-t ${
                            overLimit ? 'border-rose-100' : weekendOnly ? 'border-amber-100' : 'border-slate-100'
                          }`}>
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black ${
                              overLimit
                                ? 'bg-rose-100 text-rose-600'
                                : days === 1
                                ? 'bg-sky-100 text-sky-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              📅 {days} {days === 1 ? 'day' : 'days'} selected
                              {overLimit && ` — exceeds ${DATE_MAX_DURATION}-day limit`}
                            </span>
                            {weekendOnly && !overLimit && (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black bg-amber-100 text-amber-700">
                                ⚠️ Selected dates fall on weekends only
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    <div>
                      <label className="text-[10px] md:text-xs text-slate-400 font-black uppercase tracking-widest mb-2 block">Reason for Request</label>
                      <textarea required rows="4" value={newApp.description} onChange={(e) => setNewApp({...newApp, description: e.target.value})} placeholder="Provide detailed reasoning for the reviewing authority..." className="w-full bg-white border border-slate-200 text-slate-800 font-medium rounded-3xl focus:ring-4 focus:ring-[#0C3669]/20 focus:border-[#0C3669] block p-6 outline-none transition-all shadow-inner resize-none text-sm leading-relaxed"></textarea>
                    </div>

                    {/* PARENT'S HANDWRITTEN LETTER UPLOAD */}
                    <div>
                      <label className="text-[10px] md:text-xs text-slate-400 font-black uppercase tracking-widest mb-2 block">Parent's Handwritten Letter (PDF) <span className="text-rose-500">*</span></label>
                      <p className="text-[11px] text-slate-400 font-medium mb-3">Upload a scanned/photographed PDF of the handwritten letter with your parent's signature.</p>
                      <div 
                        className={`relative border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer group hover:border-[#0C3669]/40 hover:bg-[#0C3669]/5 ${
                          parentLetter ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 bg-white'
                        }`}
                        onClick={() => document.getElementById('parent-letter-input').click()}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={(e) => {
                          e.preventDefault(); e.stopPropagation();
                          const file = e.dataTransfer.files[0];
                          if (file) {
                            if (file.type !== 'application/pdf') { notify('Only PDF files are allowed.', 'error'); return; }
                            if (file.size > 5 * 1024 * 1024) { notify('File must be under 5 MB.', 'error'); return; }
                            setParentLetter(file);
                          }
                        }}
                      >
                        <input 
                          id="parent-letter-input" 
                          type="file" 
                          accept=".pdf,application/pdf" 
                          className="hidden" 
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) {
                              if (file.type !== 'application/pdf') { notify('Only PDF files are allowed.', 'error'); return; }
                              if (file.size > 5 * 1024 * 1024) { notify('File must be under 5 MB.', 'error'); return; }
                              setParentLetter(file);
                            }
                          }}
                        />
                        {parentLetter ? (
                          <div className="flex items-center justify-center gap-3">
                            <div className="p-2.5 bg-emerald-100 rounded-xl text-emerald-600">
                              <FileText size={22} />
                            </div>
                            <div className="text-left">
                              <p className="text-sm font-bold text-slate-800 truncate max-w-[200px]">{parentLetter.name}</p>
                              <p className="text-[11px] font-medium text-emerald-600">{(parentLetter.size / 1024).toFixed(1)} KB — PDF Ready</p>
                            </div>
                            <button 
                              type="button" 
                              onClick={(e) => { e.stopPropagation(); setParentLetter(null); }} 
                              className="ml-2 p-1.5 bg-rose-100 text-rose-500 rounded-lg hover:bg-rose-200 transition-colors"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="mx-auto w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-[#0C3669] group-hover:bg-[#0C3669]/10 transition-all">
                              <Upload size={22} />
                            </div>
                            <p className="text-sm font-bold text-slate-500">Drag & drop your PDF here, or <span className="text-[#0C3669] underline">browse</span></p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">PDF only · Max 5 MB</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row gap-4 pt-6 border-t border-slate-200/60">
                      <button type="button" disabled={isSubmitting} onClick={() => setShowApplyModal(false)} className="px-8 py-4 rounded-2xl font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors w-full sm:w-auto text-xs uppercase tracking-widest disabled:opacity-50">Cancel</button>
                      <button type="submit" disabled={isSubmitting} className="flex-1 flex justify-center items-center gap-2 py-4 rounded-2xl font-black text-white bg-[#F58220] hover:bg-orange-500 shadow-lg shadow-orange-500/30 transition-all text-xs uppercase tracking-widest active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed">
                        {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />} 
                        {isSubmitting ? 'Transmitting...' : 'Submit Request'}
                      </button>
                    </div>

                  </form>
                </div>
              </div>
            </div>
          )}

          {/* APPLICATION DETAILS & REMARKS POPUP MODAL */}
          {viewRequestModal && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-6 bg-slate-900/60 backdrop-blur-md animate-fade-in">
              <div className="bg-white rounded-[2rem] w-full max-w-xl overflow-hidden shadow-2xl animate-scale-in flex flex-col max-h-[90vh]">
                
                <div className="bg-slate-50 p-6 md:p-8 flex justify-between items-center border-b border-slate-100">
                  <div>
                    <h2 className="text-2xl font-black text-slate-800">Request Details</h2>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">APP-{viewRequestModal.application_id}</p>
                  </div>
                  <button onClick={() => setViewRequestModal(null)} className="p-2 bg-white rounded-full text-slate-400 hover:text-slate-700 shadow-sm border border-slate-200 transition-colors">
                    <X size={20}/>
                  </button>
                </div>
                
                <div className="p-6 md:p-8 overflow-y-auto space-y-6">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Subject</span>
                    <h3 className="text-lg font-bold text-slate-800">{viewRequestModal.subject}</h3>
                  </div>
                  
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Reason</span>
                    <p className="text-sm font-medium text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-100 whitespace-pre-wrap">{viewRequestModal.description}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-1">From</span>
                      <p className="text-sm font-bold text-slate-800">{viewRequestModal.from_date}</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-1">To</span>
                      <p className="text-sm font-bold text-slate-800">{viewRequestModal.to_date}</p>
                    </div>
                  </div>
                  
                  {/* Parent's Handwritten Letter Attachment */}
                  {viewRequestModal.attachment_filename && (
                    <div className="p-4 bg-emerald-50/50 border border-emerald-200/50 rounded-2xl flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-emerald-100 rounded-xl text-emerald-600">
                          <FileText size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">Parent's Letter Attached</p>
                          <p className="text-[11px] font-medium text-emerald-600">PDF with parent's signature</p>
                        </div>
                      </div>
                      <button onClick={() => handleViewParentLetter(viewRequestModal.application_id)} className="text-xs font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-4 py-2 rounded-lg transition-colors uppercase tracking-widest flex items-center gap-1.5 cursor-pointer">
                        <Eye size={12} /> View
                      </button>
                    </div>
                  )}

                  {/* Dedicated Remarks Section */}
                  {(viewRequestModal.proctor_remarks || viewRequestModal.hod_remarks) && (
                    <div className="border-t border-slate-100 pt-6 space-y-4">
                      <h4 className="text-xs font-black uppercase text-slate-800 tracking-widest mb-2">Authority Remarks</h4>
                      
                      {viewRequestModal.proctor_remarks && (
                        <div className="bg-[#0C3669]/5 border border-[#0C3669]/20 p-4 rounded-xl">
                          <p className="text-[10px] font-black text-[#0C3669] uppercase tracking-widest mb-1 flex items-center gap-1.5"><User size={12}/> Proctor</p>
                          <p className="text-sm font-bold text-[#0C3669] italic">"{viewRequestModal.proctor_remarks}"</p>
                        </div>
                      )}
                      
                      {viewRequestModal.hod_remarks && (
                        <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl">
                          <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1 flex items-center gap-1.5"><CheckCircle size={12}/> HOD / Warden</p>
                          <p className="text-sm font-bold text-emerald-900 italic">"{viewRequestModal.hod_remarks}"</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="p-6 bg-white border-t border-slate-100 flex justify-end">
                  <button onClick={() => setViewRequestModal(null)} className="px-6 py-3 bg-[#0C3669] text-white font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-[#0a2d59] transition-colors">Close Details</button>
                </div>
              </div>
            </div>
          )}

          {/* ANNOUNCEMENT DETAIL MODAL */}
          {selectedViewAnnouncement && (
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-6 bg-slate-900/60 backdrop-blur-md animate-fade-in"
              onClick={() => setSelectedViewAnnouncement(null)}
            >
              <div
                className="bg-white rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)] animate-scale-in flex flex-col max-h-[95vh] md:max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className={`p-6 md:p-8 text-white flex justify-between items-start shrink-0 ${selectedViewAnnouncement.priority_level === 'EMERGENCY' ? 'bg-rose-600' : 'bg-[#0c3669]'}`}>
                  <div className="pr-4 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${selectedViewAnnouncement.priority_level === 'EMERGENCY' ? 'bg-white/20 text-white' : selectedViewAnnouncement.priority_level === 'HIGH' ? 'bg-amber-400/30 text-amber-200' : 'bg-white/10 text-blue-200'}`}>
                        {selectedViewAnnouncement.priority_level}
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-200">
                        From {selectedViewAnnouncement.posted_role}
                      </span>
                    </div>
                    <h2 className="text-2xl md:text-3xl font-black tracking-tight leading-tight mb-2">
                      {selectedViewAnnouncement.title}
                    </h2>
                    <p className="text-[10px] text-blue-200 font-semibold uppercase tracking-widest">
                      {new Date(selectedViewAnnouncement.created_at).toLocaleString()}
                    </p>
                  </div>
                  <button onClick={() => setSelectedViewAnnouncement(null)} className="shrink-0 text-white/60 hover:text-white bg-white/10 hover:bg-white/20 p-2.5 rounded-xl transition-all">
                    <X size={20} />
                  </button>
                </div>

                {/* Body */}
                <div className="p-6 md:p-8 overflow-y-auto flex-1 bg-slate-50/50 no-scrollbar space-y-5">
                  {/* Meta */}
                  <div className="grid grid-cols-2 gap-3 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Posted By</span>
                      <span className="text-sm font-bold text-slate-800">{selectedViewAnnouncement.posted_by}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Audience</span>
                      <span className="text-sm font-bold text-slate-800">
                        {selectedViewAnnouncement.target_dept || 'ALL'}
                        {selectedViewAnnouncement.target_year ? ` · Year ${selectedViewAnnouncement.target_year}` : ''}
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                    <p className="text-slate-700 leading-relaxed font-medium whitespace-pre-wrap text-sm">
                      {selectedViewAnnouncement.description}
                    </p>
                  </div>

                  {/* Attachments */}
                  {selectedViewAnnouncement.attachments?.length > 0 && (
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                        <Paperclip size={14} className="text-[#0c3669]" />
                        Attachments ({selectedViewAnnouncement.attachments.length})
                      </h4>
                      <div className="space-y-3">
                        {selectedViewAnnouncement.attachments.map((att, idx) => {
                          if (att.file_type === 'IMAGE') return (
                            <img
                              key={idx}
                              src={att.file_url}
                              alt={`Attachment ${idx + 1}`}
                              className="w-full rounded-2xl border border-slate-200 shadow-sm object-contain max-h-96 bg-slate-50"
                            />
                          );
                          if (att.file_type === 'VIDEO') return (
                            <video
                              key={idx}
                              src={att.file_url}
                              controls
                              className="w-full bg-black rounded-2xl shadow-sm max-h-64"
                            />
                          );
                          return (
                            <a
                              key={idx}
                              href={att.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-4 p-4 bg-white hover:bg-[#0c3669]/5 rounded-2xl border border-slate-200 hover:border-[#0c3669]/30 transition-all shadow-sm group"
                            >
                              <div className="p-3 bg-[#0c3669]/10 group-hover:bg-[#0c3669] text-[#0c3669] group-hover:text-white rounded-xl transition-colors shrink-0">
                                <FileIcon size={20} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-black text-slate-700 group-hover:text-[#0c3669] transition-colors block">
                                  Open {att.file_type === 'PDF' ? 'PDF Document' : 'Document'}
                                </span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                  Opens in new tab
                                </span>
                              </div>
                              <ExternalLink size={16} className="text-slate-300 group-hover:text-[#0c3669] transition-colors shrink-0" />
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-slate-100 bg-white shrink-0 flex justify-end">
                  <button onClick={() => setSelectedViewAnnouncement(null)} className="px-8 py-3 rounded-xl font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors text-sm uppercase tracking-widest">
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Emergency Alert Modal */}
          {emergencyAlert && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-6 bg-slate-900/80 backdrop-blur-xl animate-fade-in">
              <div className="bg-white rounded-[2rem] w-full max-w-lg overflow-hidden shadow-[0_0_50px_rgba(225,29,72,0.3)] animate-scale-in border border-rose-200">
                <div className="bg-rose-500 p-8 text-white text-center relative overflow-hidden">
                  <AlertCircle size={48} className="mx-auto mb-4 animate-pulse" />
                  <h2 className="text-3xl font-black tracking-tight mb-2">EMERGENCY BROADCAST</h2>
                  <p className="text-rose-100 font-bold tracking-widest uppercase text-[10px]">Priority Action Required</p>
                </div>
                
                <div className="p-8 text-center space-y-4">
                  <h3 className="text-2xl font-black text-slate-800">{emergencyAlert.title}</h3>
                  <p className="text-slate-600 font-medium leading-relaxed bg-rose-50 p-4 rounded-xl border border-rose-100">
                    {emergencyAlert.description}
                  </p>
                  
                  <button 
                    onClick={async () => {
                      try {
                        if(emergencyAlert?.announcement_id && profile?.roll_no) {
                           await dashboardAPI.acknowledgeAnnouncement(emergencyAlert.announcement_id, profile.roll_no);
                        }
                      } catch (error) { 
                        console.error("Acknowledge failed", error); 
                      }
                      setEmergencyAlert(null);
                    }} 
                    className="mt-6 w-full py-4 bg-[#0C3669] hover:bg-[#0a2d59] text-white rounded-xl font-black uppercase tracking-widest shadow-lg transition-all active:scale-95"
                  >
                    I Understand & Acknowledge
                  </button>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* ===== LOGOUT CONFIRMATION MODAL ===== */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="logout-modal-title-student">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/70 backdrop-blur-md"
            onClick={() => setShowLogoutConfirm(false)}
          />
          {/* Card */}
          <div className="relative bg-white rounded-3xl shadow-[0_40px_80px_-20px_rgba(0,0,0,0.4)] w-full max-w-sm overflow-hidden animate-scale-in">
            {/* Top accent */}
            <div className="h-1.5 w-full bg-gradient-to-r from-rose-500 via-orange-400 to-rose-600" />
            <div className="p-8">
              {/* Icon */}
              <div className="flex justify-center mb-5">
                <div className="h-16 w-16 rounded-2xl bg-rose-50 flex items-center justify-center shadow-inner">
                  <LogOut size={32} className="text-rose-500" />
                </div>
              </div>
              {/* Text */}
              <h2 id="logout-modal-title-student" className="text-center text-2xl font-black text-slate-800 mb-2 tracking-tight">
                Sign Out?
              </h2>
              <p className="text-center text-slate-500 text-sm leading-relaxed mb-8">
                You're about to sign out of the <span className="font-bold text-slate-700">Student Portal</span>. Any unsaved changes will be lost.
              </p>
              {/* Actions */}
              <div className="flex flex-col gap-3">
                <button
                  id="student-logout-confirm-btn"
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-white bg-rose-500 hover:bg-rose-600 shadow-lg shadow-rose-500/30 transition-all duration-200 active:scale-95 uppercase tracking-widest text-xs"
                >
                  <LogOut size={15} /> Yes, Sign Me Out
                </button>
                <button
                  id="student-logout-cancel-btn"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="w-full py-3.5 rounded-2xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-all duration-200 active:scale-95 uppercase tracking-widest text-xs"
                >
                  Stay Logged In
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}