import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Check, X, Download, LogOut, Inbox, FileText, Map as MapIcon,
  AlertCircle, Filter, Search, FileSignature,
  Bell, User, Lock, Save, Menu, ChevronRight, Sparkles, Send,
  Paperclip, Eye, Loader2, Image as ImageIcon, File as FileIcon, Film, Users, Calendar, CheckCircle,
  ExternalLink
} from 'lucide-react';
import { dashboardAPI, getApiError } from '../utils/api';
import jsPDF from 'jspdf';


export default function StaffDashboard() {
  const navigate = useNavigate();
  const role = localStorage.getItem('role'); 
  
  const [currentView, setCurrentView] = useState('permissions'); 
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // ==========================================
  // CUSTOM NOTIFICATION & LOCALIZED LOADING STATES
  // ==========================================
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });
  const [processingAction, setProcessingAction] = useState(null); // 'APPROVED' | 'REJECTED' | null
  const [isExporting, setIsExporting] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const notify = (message, type = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 5000);
  };

  const [activeTab, setActiveTab] = useState('pending');
  const [typeFilter, setTypeFilter] = useState('All'); 
  
  const [searchQuery, setSearchQuery] = useState(''); 
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  
  const [showFilters, setShowFilters] = useState(false);
  const filterRef = useRef(null);

  const [pendingApps, setPendingApps] = useState([]);
  const [reviewedApps, setReviewedApps] = useState([]); 
  const [profile, setProfile] = useState({ name: 'Loading...', emp_id: '...', department: '...' });
  
  const [selectedApp, setSelectedApp] = useState(null); 
  const [remarks, setRemarks] = useState('');
  const [isEmergency, setIsEmergency] = useState(false);

  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [pwStep, setPwStep] = useState(1); // 1=form, 2=otp, 3=success
  const [otpInput, setOtpInput] = useState('');
  const [emailHint, setEmailHint] = useState('');

  // --- ANNOUNCEMENT STATES ---
  const [announcementViewTab, setAnnouncementViewTab] = useState('inbox'); 
  const [inboxAnnouncements, setInboxAnnouncements] = useState([]); 
  const [unreadCount, setUnreadCount] = useState(0);
  const [emergencyAlert, setEmergencyAlert] = useState(null);

  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [selectedViewAnnouncement, setSelectedViewAnnouncement] = useState(null); 
  const [myAnnouncements, setMyAnnouncements] = useState([]); 
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  
  const [newBroadcast, setNewBroadcast] = useState({
    title: '',
    description: '',
    target_role: 'STUDENT',
    target_dept: 'ALL', // Will auto-update when profile loads
    target_year: 'ALL', 
    priority_level: 'STANDARD'
  });

  // Auto-lock the department when the profile initially loads
  useEffect(() => {
    if (profile.department && profile.department !== '...') {
      setNewBroadcast(prev => ({...prev, target_dept: profile.department}));
    }
  }, [profile.department]);

  const fetchData = async () => {
    try {
      const profileRes = await dashboardAPI.getStaffProfile();
      setProfile(profileRes.data || { name: 'Staff User', emp_id: 'EMP001', department: 'CSE' });
      
      const [pendingRes, reviewedRes] = await Promise.all([
        dashboardAPI.getPendingApplications(),
        dashboardAPI.getReviewedApplications()
      ]);

      setPendingApps(Array.isArray(pendingRes.data) ? pendingRes.data : []);
      setReviewedApps(Array.isArray(reviewedRes.data) ? reviewedRes.data : []);

      try {
        const feedRes = await dashboardAPI.getAnnouncementFeed(profileRes.data?.emp_id);
        const filteredInbox = Array.isArray(feedRes.data) 
          ? feedRes.data.filter(ann => ann.posted_by !== profileRes.data?.emp_id) 
          : [];
        setInboxAnnouncements(filteredInbox);
      } catch (e) { console.warn("Inbox feed empty"); }

      try {
        const announcementsRes = await dashboardAPI.getStaffAnnouncements(profileRes.data?.emp_id);
        setMyAnnouncements(Array.isArray(announcementsRes.data) ? announcementsRes.data : []);
      } catch (aErr) {
        console.warn("Could not load announcement history analytics", aErr);
      }

    } catch (err) {
      console.error("Failed to load dashboard data", err);
      setPendingApps([]);
      setReviewedApps([]);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!profile.emp_id || profile.emp_id === '...') return;
    let ws;
    let reconnectTimer;
    let retryCount = 0;

    const connectWS = () => {
      const wsUrl = `ws://localhost:8000/ws/announcements/${profile.emp_id}`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => { retryCount = 0; };
      ws.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        if (payload.type === "NEW_ANNOUNCEMENT") {
          const newAlert = payload.data;
          
          if (newAlert.posted_by !== profile.emp_id) {
            setInboxAnnouncements(prev => [newAlert, ...prev]);
            if (currentView !== 'announcements' || announcementViewTab !== 'inbox') {
              setUnreadCount(prev => prev + 1);
            }
            if (newAlert.priority_level === 'EMERGENCY') {
              setEmergencyAlert(newAlert);
            }
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
    return () => { clearTimeout(reconnectTimer); if (ws) ws.close(); };
  }, [profile.emp_id, currentView, announcementViewTab]);

  useEffect(() => {
    if (currentView === 'announcements' && announcementViewTab === 'inbox') setUnreadCount(0);
  }, [currentView, announcementViewTab]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (filterRef.current && !filterRef.current.contains(event.target)) {
        setShowFilters(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [filterRef]);

  const handleLogout = () => {
    setShowLogoutConfirm(false);
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    navigate('/login');
  };

  const handleAction = async (actionType) => {
    setProcessingAction(actionType); // Localized loading indicator
    try {
      const payload = { action: actionType, remarks: remarks, is_override_approval: isEmergency };
      await dashboardAPI.processApplication(selectedApp.application_id, payload);
      notify(`Application ${actionType.toLowerCase()} successfully.`, 'success');
      setSelectedApp(null);
      setRemarks('');
      setIsEmergency(false);
      await fetchData(); 
    } catch (err) {
      notify(getApiError(err, 'Failed to process action.'), 'error');
    } finally {
      setProcessingAction(null);
    }
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 3) {
      notify("Maximum 3 files allowed per announcement.", 'error');
      return;
    }
    const validFiles = files.filter(file => {
      if (file.size > 5 * 1024 * 1024) {
        notify(`${file.name} is larger than 5MB and was removed.`, 'error');
        return false;
      }
      return true;
    });
    setSelectedFiles(validFiles);
  };

  const getFileIcon = (type) => {
    if (type.includes('image')) return <ImageIcon size={14} />;
    if (type.includes('video')) return <Film size={14} />;
    return <FileIcon size={14} />;
  };

  // --- NEW SMART ROUTING LOGIC HANDLER ---
  const handleAudienceChange = (e) => {
    const selectedRole = e.target.value;
    let newDept = newBroadcast.target_dept;
    let newYear = newBroadcast.target_year;

    if (role === 'FACULTY') {
      newDept = profile.department; // Faculty is strictly locked to their dept
      if (selectedRole !== 'STUDENT') newYear = 'ALL';
    } else {
      // HOD Logic
      if (selectedRole === 'STUDENT') {
        newDept = profile.department; // HODs only message their own students
      } else if (selectedRole === 'ALL_STAFF') {
        newDept = 'ALL'; // "Everyone" means All Depts
        newYear = 'ALL';
      } else {
        newYear = 'ALL'; // Reset year if targeting staff
      }
    }

    setNewBroadcast(prev => ({
      ...prev,
      target_role: selectedRole,
      target_dept: newDept,
      target_year: newYear
    }));
  };

  const handleBroadcastSubmit = async (e) => {
    e.preventDefault();
    setIsBroadcasting(true); // Localized loading indicator

    try {
      const uploadedAttachments = [];
      if (selectedFiles.length > 0) {
        const uploadPromises = selectedFiles.map(file => dashboardAPI.uploadAttachment(file));
        const uploadResponses = await Promise.all(uploadPromises);
        uploadResponses.forEach(res => {
          uploadedAttachments.push({
            file_url: res.data.file_url,
            file_type: res.data.file_type
          });
        });
      }

      const payload = {
        ...newBroadcast,
        posted_by: profile.emp_id,
        posted_role: role || 'FACULTY',
        target_year: newBroadcast.target_role === 'STUDENT' && newBroadcast.target_year !== 'ALL' ? parseInt(newBroadcast.target_year) : null,
        status: 'PUBLISHED',
        attachments: uploadedAttachments 
      };

      await dashboardAPI.createAnnouncement(payload);
      
      setShowBroadcastModal(false);
      setNewBroadcast({ title: '', description: '', target_role: 'STUDENT', target_dept: profile.department || 'ALL', target_year: 'ALL', priority_level: 'STANDARD' });
      setSelectedFiles([]);
      notify("Announcement Sent Successfully!", 'success');
      await fetchData(); 
      
    } catch (err) {
      notify(getApiError(err, 'Failed to send announcement.'), 'error');
    } finally {
      setIsBroadcasting(false);
    }
  };

  const handleOpenAnnouncement = async (ann) => {
    setSelectedViewAnnouncement(ann);
    if (profile?.emp_id && announcementViewTab === 'inbox') {
      try { await dashboardAPI.acknowledgeAnnouncement(ann.announcement_id, profile.emp_id); } 
      catch (e) { console.warn("Sync failed", e); }
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

  const allApps = [...pendingApps, ...reviewedApps];
  const uniqueApps = Array.from(new Map(allApps.map(item => [item.application_id, item])).values());

  const isApprovedByMe = (app) => {
    if (app.status === 'APPROVED') return true;
    if (app.status === 'PENDING' && reviewedApps.some(r => r.application_id === app.application_id)) return true;
    return false;
  };

  const leaveApps = uniqueApps.filter(a => a.leave_type === 'Leave');
  const outpassApps = uniqueApps.filter(a => a.leave_type === 'Outpass');
  const otherApps = uniqueApps.filter(a => a.leave_type === 'Other');

  const stats = {
    actionRequired: pendingApps.length,
    leave: { approved: leaveApps.filter(isApprovedByMe).length, total: leaveApps.length },
    outpass: { approved: outpassApps.filter(isApprovedByMe).length, total: outpassApps.length },
    other: { approved: otherApps.filter(isApprovedByMe).length, total: otherApps.length }
  };

  const currentList = activeTab === 'pending' ? pendingApps : reviewedApps;
  const filteredList = currentList.filter(app => {
    if (!app || !app.application_id) return false;
    const matchesType = typeFilter === 'All' ? true : typeFilter === 'Emergency' ? app.is_emergency === true : app.leave_type === typeFilter;
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = searchQuery === '' || (app.student_roll_no || '').toLowerCase().includes(searchLower) || (app.student_name || '').toLowerCase().includes(searchLower) || app.application_id.toString().includes(searchLower) || `app-${app.application_id}`.includes(searchLower);
    let matchesDate = true;
    if (filterStartDate) matchesDate = matchesDate && app.from_date >= filterStartDate;
    if (filterEndDate) matchesDate = matchesDate && app.from_date <= filterEndDate;
    return matchesType && matchesSearch && matchesDate;
  });

  const generateReport = async () => {
    if (filteredList.length === 0) return notify("No records match your filters to generate a report.", 'error');
    setIsExporting(true); // Localized loading indicator
    try {
      // Give UI a tiny delay to show the spinner before jsPDF blocks the thread
      await new Promise(resolve => setTimeout(resolve, 50)); 
      
      const doc = new jsPDF();
      doc.setFontSize(20); doc.setFont("helvetica", "bold"); doc.text("Faculty Application Report", 14, 22);
      doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 100, 100);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30); doc.text(`Faculty: ${profile.name} (${profile.emp_id})`, 14, 36); doc.text(`Department: ${profile.department}`, 14, 42);
      doc.setLineWidth(0.5); doc.setDrawColor(200, 200, 200); doc.line(14, 58, 196, 58);
      let yPos = 65; doc.setFontSize(10); doc.setFont("helvetica", "bold");
      doc.text("APP ID", 14, yPos); doc.text("Roll No", 35, yPos); doc.text("Type", 70, yPos); doc.text("Requested Dates", 100, yPos); doc.text("Status", 165, yPos);
      doc.setLineWidth(0.2); doc.line(14, yPos + 3, 196, yPos + 3); yPos += 10;
      doc.setFont("helvetica", "normal");
      filteredList.forEach((app) => {
        if (yPos > 275) { doc.addPage(); yPos = 20; }
        const appIdDisplay = app.is_emergency ? `APP-${app.application_id} (*)` : `APP-${app.application_id}`;
        doc.text(appIdDisplay, 14, yPos); doc.text(app.student_roll_no, 35, yPos); doc.text(app.leave_type, 70, yPos); doc.text(`${app.from_date} to ${app.to_date}`, 100, yPos);
        if (app.status === 'APPROVED') doc.setTextColor(16, 185, 129); else if (app.status === 'REJECTED') doc.setTextColor(244, 63, 94); else doc.setTextColor(245, 158, 11); 
        doc.text(app.status, 165, yPos); doc.setTextColor(15, 23, 42); yPos += 8;
      });
      doc.save(`Staff_Report_${new Date().toISOString().split('T')[0]}.pdf`);
      notify("Report generated successfully.", 'success');
    } catch (err) {
      notify("Failed to generate report.", 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const renderPermissions = () => (
    <div className="w-full h-full flex flex-col overflow-y-auto md:overflow-hidden no-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
      <div className="shrink-0 z-20">
        <div className="bg-[#0c3669] text-white pt-6 md:pt-8 pb-32 px-4 md:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-4">
              <button className="md:hidden text-white p-2.5 rounded-xl bg-white/10 border border-white/10 transition-all" onClick={() => setIsMobileMenuOpen(true)}>
                <Menu size={22} />
              </button>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-[#f58220] text-white text-[10px] font-bold px-2.5 py-1 rounded uppercase tracking-widest">
                    {role || 'FACULTY'}
                  </span>
                  <p className="text-blue-200 font-medium text-xs uppercase tracking-widest">Permissions Queue</p>
                </div>
                <h1 className="text-3xl md:text-4xl font-black tracking-tight">Review Requests</h1>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 md:px-8 -mt-16 relative z-20">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {[
              { label: 'Action Required', val: stats.actionRequired, icon: <Inbox size={24} />, iconBg: 'bg-indigo-50 text-indigo-600' },
              { label: 'Leaves', val: `${stats.leave.approved} / ${stats.leave.total}`, icon: <FileText size={24} />, iconBg: 'bg-emerald-50 text-emerald-600' },
              { label: 'Outpasses', val: `${stats.outpass.approved} / ${stats.outpass.total}`, icon: <MapIcon size={24} />, iconBg: 'bg-amber-50 text-amber-600' },
              { label: 'Other', val: `${stats.other.approved} / ${stats.other.total}`, icon: <AlertCircle size={24} />, iconBg: 'bg-rose-50 text-rose-600' }
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

        <div className="max-w-7xl mx-auto px-4 md:px-8 pt-8 md:pt-12 pb-4 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-5">
            <div className="bg-white p-1.5 rounded-2xl shadow-sm border border-slate-200 flex overflow-x-auto w-full xl:w-auto relative">
              <div className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] bg-[#0C3669] rounded-xl transition-transform duration-500 ease-out shadow-md ${activeTab === 'reviewed' ? 'translate-x-[calc(100%+4px)]' : 'translate-x-0'}`}></div>
              <button onClick={() => setActiveTab('pending')} className={`relative z-10 flex-1 xl:flex-none px-6 py-2.5 rounded-xl text-sm font-black whitespace-nowrap transition-colors duration-300 ${activeTab === 'pending' ? 'text-white' : 'text-slate-500 hover:text-slate-800'}`}>Review Queue</button>
              <button onClick={() => setActiveTab('reviewed')} className={`relative z-10 flex-1 xl:flex-none px-6 py-2.5 rounded-xl text-sm font-black whitespace-nowrap transition-colors duration-300 ${activeTab === 'reviewed' ? 'text-white' : 'text-slate-500 hover:text-slate-800'}`}>Past Approvals</button>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full xl:w-auto">
              <div className="relative w-full sm:w-72 group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-transform group-focus-within:scale-110 group-focus-within:text-[#0C3669]">
                  <Search size={18} className="text-slate-400 transition-colors" />
                </div>
                <input type="text" placeholder="Search Roll No..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white border border-slate-200 text-slate-800 text-sm font-medium rounded-2xl focus:ring-4 focus:ring-[#0C3669]/20 focus:border-[#0C3669] block pl-11 p-3 outline-none transition-all shadow-sm hover:shadow-md" />
              </div>

              <div className="relative w-full sm:w-auto" ref={filterRef}>
                <button onClick={() => setShowFilters(!showFilters)} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-6 py-3 rounded-2xl font-bold text-sm transition-all shadow-sm hover:shadow-md active:scale-95 relative">
                  <Filter size={16} className={typeFilter !== 'All' || filterStartDate || filterEndDate ? 'text-[#0C3669]' : 'text-slate-400'} /> Filters
                  {(typeFilter !== 'All' || filterStartDate || filterEndDate) && <span className="w-2.5 h-2.5 rounded-full bg-[#0C3669] absolute top-2.5 right-2.5 ring-2 ring-white animate-pulse"></span>}
                </button>

                {showFilters && (
                  <div className="absolute top-full mt-3 right-0 left-0 sm:left-auto w-full sm:w-80 bg-white border border-slate-200 rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] z-30 p-6 animate-slide-up origin-top-right">
                    <div className="mb-6">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">Application Type</label>
                      <div className="flex flex-wrap gap-2">
                        {['All', 'Leave', 'Outpass', 'Other', ...(role === 'HOD' ? ['Emergency'] : [])].map(type => (
                          <button key={type} onClick={() => setTypeFilter(type)} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 ${typeFilter === type ? type === 'Emergency' ? 'bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-lg shadow-rose-500/30 border-transparent' : 'bg-gradient-to-r from-slate-800 to-slate-900 text-white shadow-lg shadow-slate-900/20 border-transparent' : type === 'Emergency' ? 'text-rose-600 bg-rose-50/50 hover:bg-rose-100 border-rose-200 border' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 hover:border-slate-300'}`}>
                            {type === 'Emergency' && <AlertCircle size={14} className={typeFilter === type ? 'animate-pulse' : ''} />} {type}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="mb-8">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">Date Range</label>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 block">From</label>
                          <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-[#0C3669]/20 focus:border-[#0C3669] transition-all shadow-inner" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 block">To</label>
                          <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-[#0C3669]/20 focus:border-[#0C3669] transition-all shadow-inner" />
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => { setTypeFilter('All'); setFilterStartDate(''); setFilterEndDate(''); }} className="flex-1 py-3 text-xs font-bold text-slate-500 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors active:scale-95">Clear</button>
                      <button onClick={() => setShowFilters(false)} className="flex-1 py-3 text-xs font-bold text-white bg-[#0C3669] rounded-xl hover:bg-[#0a2d59] transition-colors shadow-md active:scale-95">Apply</button>
                    </div>
                  </div>
                )}
              </div>
              
              <button onClick={generateReport} disabled={isExporting} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#F58220] hover:bg-orange-500 text-white px-6 py-3 rounded-2xl font-bold text-sm transition-all shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 hover:-translate-y-0.5 active:scale-95 disabled:opacity-50">
                {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                {isExporting ? 'Exporting...' : 'Export'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 pb-10 relative z-10 w-full no-scrollbar [transform:translateZ(0)] overscroll-contain md:overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="max-w-7xl mx-auto px-4 md:px-8 mt-2">
          <div className="space-y-4 relative">
            {filteredList.length === 0 ? (
               <div className="bg-white p-20 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 text-center flex flex-col items-center justify-center animate-fade-in">
                 <div className="h-20 w-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                   <Search size={32} className="text-slate-300" />
                 </div>
                 <h3 className="text-xl font-bold text-slate-700 mb-2">No Applications Found</h3>
                 <p className="text-slate-500 text-sm max-w-md">
                   {searchQuery || filterStartDate || filterEndDate || typeFilter !== 'All' ? `Adjust your filters to see more results.` : activeTab === 'pending' ? `You are all caught up! No requests waiting in your queue.` : `No history found.`}
                 </p>
               </div>
            ) : filteredList.map((app, index) => (
              <div 
                key={app.application_id} 
                onClick={() => setSelectedApp(app)} 
                className={`group bg-white rounded-[1.5rem] shadow-sm hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 hover:border-indigo-100 flex flex-col transition-all duration-300 ease-out animate-stagger-fade-in cursor-pointer hover:-translate-y-1 relative overflow-hidden ${activeTab !== 'pending' ? 'opacity-90' : ''}`}
                style={{ animationDelay: `${index * 60}ms`, animationFillMode: 'both' }}
              >
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 z-10 ${app.status === 'APPROVED' ? 'bg-emerald-400' : app.status === 'REJECTED' ? 'bg-rose-400' : 'bg-amber-400'}`}></div>
                
                <div className="flex flex-col lg:flex-row lg:justify-between items-start lg:items-center gap-4 md:gap-6 p-5 md:p-6 pl-7 md:pl-8 relative">
                  <div className="w-full lg:w-2/5 flex items-start gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-200 flex items-center justify-center font-black text-slate-400 shrink-0 shadow-inner group-hover:scale-110 group-hover:from-orange-50 group-hover:to-orange-100 group-hover:text-[#F58220] group-hover:border-orange-200 transition-all duration-500">
                      {app.student_name ? app.student_name.charAt(0) : '#'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 md:gap-3 mb-1.5 flex-wrap">
                        <span className={`text-[9px] md:text-[10px] font-black px-2.5 py-0.5 rounded-md uppercase tracking-widest border shadow-sm ${app.leave_type === 'Leave' ? 'bg-emerald-50 text-emerald-600 border-emerald-200/50' : app.leave_type === 'Outpass' ? 'bg-amber-50 text-amber-600 border-amber-200/50' : 'bg-indigo-50 text-indigo-600 border-indigo-200/50'}`}>
                          {app.leave_type}
                        </span>
                        <span className="text-xs font-bold text-slate-300 uppercase">APP-{app.application_id}</span>
                        {app.is_emergency && <span className="bg-rose-50 text-rose-600 border border-rose-200 text-[9px] md:text-[10px] font-black px-2.5 py-0.5 rounded-md flex items-center gap-1 uppercase tracking-widest shadow-[0_0_15px_rgba(225,29,72,0.2)] animate-pulse"><AlertCircle size={10} className="md:w-3 md:h-3" /> Priority</span>}
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
                        <h3 className="font-extrabold text-lg md:text-xl text-slate-800 transition-colors group-hover:text-[#0C3669]">{app.student_roll_no}</h3>
                        <span className="text-slate-400 font-medium text-sm">({app.student_name || ''})</span>
                      </div>
                      <p className="text-sm font-medium text-slate-500 mt-0.5 line-clamp-1">Sub: {app.subject}</p>
                    </div>
                  </div>

                  <div className="w-full lg:w-1/3 text-left lg:text-center py-3 lg:py-0 border-y border-slate-50 lg:border-none">
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1.5">Requested Timeline</p>
                    <div className="inline-flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                      <span className="font-bold text-slate-700 text-sm">{app.from_date}</span>
                      <ChevronRight size={14} className="text-slate-300" />
                      <span className="font-bold text-slate-700 text-sm">{app.to_date}</span>
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 mt-2">Applied: {new Date(app.applied_at).toLocaleDateString()}</p>
                  </div>

                  <div className="w-full lg:w-auto flex justify-start lg:justify-end">
                    {activeTab === 'pending' ? (
                      <button className="flex items-center gap-2 px-6 py-2.5 text-xs md:text-sm text-[#0C3669] bg-[#0C3669]/5 border border-[#0C3669]/20 rounded-xl font-bold transition-all uppercase tracking-widest group-hover:bg-[#F58220] group-hover:text-white group-hover:border-transparent group-hover:shadow-lg group-hover:shadow-orange-500/25">
                        Review <ChevronRight size={16} className="transition-transform group-hover:translate-x-1" />
                      </button>
                    ) : (
                      <div className={`px-5 py-2.5 border rounded-xl text-xs md:text-sm font-black uppercase tracking-widest flex items-center gap-2 shadow-sm ${app.status === 'APPROVED' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : app.status === 'REJECTED' ? 'text-rose-600 bg-rose-50 border-rose-200' : 'text-slate-500 bg-slate-50 border-slate-200'}`}>
                        {app.status === 'APPROVED' && <Check size={16}/>}
                        {app.status === 'REJECTED' && <X size={16}/>}
                        {app.status}
                      </div>
                    )}
                  </div>
                </div>

                {/* Click indicator */}
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
  // VIEW: 2. ANNOUNCEMENTS (INBOX vs ANALYTICS)
  // ==========================================
  const renderAnnouncements = () => (
    <div className="w-full h-full flex flex-col bg-slate-50 overflow-y-auto md:overflow-hidden no-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
      
      {/* 1. FIXED TOP SECTION (Non-Scrollable) */}
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
          <button 
            onClick={() => setShowBroadcastModal(true)} 
            className="hidden sm:flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg active:scale-95"
          >
            <Bell size={16} /> New Announcement
          </button>
        </div>

        {/* Tab Toggle for Inbox vs Analytics */}
        <div className="bg-white p-1.5 rounded-2xl shadow-sm border border-slate-200 flex overflow-hidden w-full max-w-md relative mb-8">
          <div className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] bg-indigo-600 rounded-xl transition-transform duration-500 ease-out shadow-md ${announcementViewTab === 'analytics' ? 'translate-x-[calc(100%+4px)]' : 'translate-x-0'}`}></div>
          <button onClick={() => setAnnouncementViewTab('inbox')} className={`relative z-10 flex-1 px-6 py-2.5 rounded-xl text-sm font-black whitespace-nowrap transition-colors duration-300 flex items-center justify-center gap-2 ${announcementViewTab === 'inbox' ? 'text-white' : 'text-slate-500 hover:text-slate-800'}`}>
            <Inbox size={16} /> Inbox Feed {unreadCount > 0 && <span className="bg-rose-500 text-white text-[9px] px-2 py-0.5 rounded-full ml-1">{unreadCount}</span>}
          </button>
          <button onClick={() => setAnnouncementViewTab('analytics')} className={`relative z-10 flex-1 px-6 py-2.5 rounded-xl text-sm font-black whitespace-nowrap transition-colors duration-300 flex items-center justify-center gap-2 ${announcementViewTab === 'analytics' ? 'text-white' : 'text-slate-500 hover:text-slate-800'}`}>
            <FileText size={16} /> My Announcements
          </button>
        </div>
      </div>

      {/* 2. SCROLLABLE CARDS GRID */}
      <div className="flex-1 pb-12 w-full max-w-6xl mx-auto no-scrollbar [transform:translateZ(0)] md:overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="px-4 md:px-8">
          {/* INBOX VIEW */}
          {announcementViewTab === 'inbox' && (
            inboxAnnouncements.length === 0 ? (
              <div className="bg-white p-20 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 text-center mt-4">
                <Bell size={32} className="mx-auto text-slate-300 mb-4" />
                <h3 className="text-xl font-bold text-slate-600 mb-1">No Announcements Found</h3>
                <p className="text-slate-400 text-sm">Your feed is completely clear.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {inboxAnnouncements.map((ann, idx) => (
                  <div 
                    key={ann.announcement_id || idx} 
                    onClick={() => handleOpenAnnouncement(ann)} 
                    className={`bg-white p-6 rounded-2xl border shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer relative overflow-hidden flex flex-col group hover:-translate-y-1 animate-stagger-in ${ann.priority_level === 'HIGH' ? 'border-amber-200 bg-amber-50/10' : ann.priority_level === 'EMERGENCY' ? 'border-rose-300 bg-rose-50/30 shadow-[0_0_15px_rgba(225,29,72,0.1)]' : 'border-slate-100'}`} 
                    style={{ animationDelay: `${idx * 50}ms` }}
                  >
                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 transition-colors ${ann.priority_level === 'HIGH' ? 'bg-amber-400' : ann.priority_level === 'EMERGENCY' ? 'bg-rose-500 animate-pulse' : 'bg-indigo-400'}`}></div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-100 px-2 py-1 rounded">From: {ann.posted_role}</span>
                      <span className={`text-[9px] px-2.5 py-1 rounded font-black tracking-widest uppercase ${ann.priority_level === 'EMERGENCY' ? 'bg-rose-100 text-rose-600' : ann.priority_level === 'HIGH' ? 'bg-amber-100 text-amber-600' : 'text-slate-400'}`}>{ann.priority_level !== 'STANDARD' ? ann.priority_level : new Date(ann.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="flex-1 mb-6">
                      <h4 className="text-lg font-black text-slate-800 leading-tight mb-2 line-clamp-2 group-hover:text-indigo-600 transition-colors">{ann.title}</h4>
                      <p className="text-sm text-slate-500 font-medium line-clamp-2">{ann.description}</p>
                    </div>
                    <div className="pt-4 mt-auto border-t border-slate-100 flex items-center justify-between">
                      <span className="text-xs font-bold text-indigo-500 group-hover:text-indigo-600 flex items-center gap-1 transition-colors"><Eye size={14} /> Read More</span>
                      {ann.attachments?.length > 0 && <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded border border-slate-100 text-slate-500"><Paperclip size={12} /><span className="text-[10px] font-bold uppercase tracking-wider">{ann.attachments.length} Attached</span></div>}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* ANALYTICS VIEW */}
          {announcementViewTab === 'analytics' && (
            myAnnouncements.length === 0 ? (
              <div className="bg-white p-20 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 text-center animate-fade-in-up mt-4">
                <p className="text-slate-400 font-medium">No previous announcements found.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {myAnnouncements.map((ann, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => setSelectedViewAnnouncement(ann)} 
                    className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer relative overflow-hidden flex flex-col group hover:-translate-y-1 animate-stagger-in" 
                    style={{ animationDelay: `${idx * 50}ms` }}
                  >
                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 transition-colors ${ann.priority_level === 'EMERGENCY' ? 'bg-rose-500' : 'bg-indigo-500'}`}></div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-50 px-2 py-1 rounded">{new Date(ann.created_at).toLocaleDateString()}</span>
                      <span className={`text-[9px] px-2.5 py-1 rounded font-black tracking-widest uppercase ${ann.priority_level === 'EMERGENCY' ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'}`}>{ann.priority_level}</span>
                    </div>
                    <div className="flex-1 mb-6">
                      <h4 className="text-lg font-black text-slate-800 leading-tight mb-2 line-clamp-2 group-hover:text-indigo-600 transition-colors">{ann.title}</h4>
                      <p className="text-sm text-slate-500 font-medium line-clamp-2">{ann.description}</p>
                    </div>
                    <div className="pt-4 mt-auto border-t border-slate-50 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors"><Eye size={14} /><span className="text-sm font-black">{ann.total_views || 0} Views</span></div>
                      {ann.attachments?.length > 0 && <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100 text-slate-500"><Paperclip size={14} /><span className="text-[10px] font-bold uppercase tracking-wider">{ann.attachments.length} Attached</span></div>}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* 3. MODAL POPUP FOR VIEWING FULL ANNOUNCEMENT */}
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
              <div className="grid grid-cols-3 gap-3 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                <div className="text-center border-r border-slate-100">
                  <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1"><MapIcon size={12} className="inline mr-1" />Dept</span>
                  <span className="text-sm font-bold text-slate-800">{selectedViewAnnouncement.target_dept || 'ALL'}</span>
                </div>
                <div className="text-center border-r border-slate-100">
                  <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1"><Users size={12} className="inline mr-1" />Year</span>
                  <span className="text-sm font-bold text-slate-800">{selectedViewAnnouncement.target_year || 'ALL'}</span>
                </div>
                <div className="text-center">
                  <span className="block text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1"><Eye size={12} className="inline mr-1" />Views</span>
                  <span className="text-sm font-black text-indigo-600">{selectedViewAnnouncement.total_views || 0}</span>
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
                    <Paperclip size={14} className="text-indigo-400" />
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
                          className="flex items-center gap-4 p-4 bg-white hover:bg-indigo-50 rounded-2xl border border-slate-200 hover:border-indigo-200 transition-all shadow-sm group"
                        >
                          <div className="p-3 bg-indigo-100 group-hover:bg-indigo-600 text-indigo-600 group-hover:text-white rounded-xl transition-colors shrink-0">
                            <FileIcon size={20} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-black text-slate-700 group-hover:text-indigo-700 transition-colors block">
                              Open {att.file_type === 'PDF' ? 'PDF Document' : 'Document'}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                              Opens in new tab
                            </span>
                          </div>
                          <ExternalLink size={16} className="text-slate-300 group-hover:text-indigo-500 transition-colors shrink-0" />
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

      {/* EMERGENCY LOCKER FOR STAFF INBOX */}
      {emergencyAlert && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-6 bg-slate-900/80 backdrop-blur-xl animate-fade-in">
          <div className="bg-white rounded-[2rem] w-full max-w-lg overflow-hidden shadow-[0_0_50px_rgba(225,29,72,0.3)] animate-scale-in border border-rose-200">
            <div className="bg-rose-500 p-8 text-white text-center relative overflow-hidden"><AlertCircle size={48} className="mx-auto mb-4 animate-pulse" /><h2 className="text-3xl font-black tracking-tight mb-2">EMERGENCY ALERT</h2><p className="text-rose-100 font-bold tracking-widest uppercase text-[10px]">Priority Action Required</p></div>
            <div className="p-8 text-center space-y-4">
              <h3 className="text-2xl font-black text-slate-800">{emergencyAlert.title}</h3>
              <p className="text-slate-600 font-medium leading-relaxed bg-rose-50 p-4 rounded-xl border border-rose-100">{emergencyAlert.description}</p>
              <button onClick={async () => {
                try { if(emergencyAlert?.announcement_id && profile?.emp_id) await dashboardAPI.acknowledgeAnnouncement(emergencyAlert.announcement_id, profile.emp_id); } 
                catch (error) { console.error("Acknowledge failed", error); }
                setEmergencyAlert(null);
              }} className="mt-6 w-full py-4 bg-[#0C3669] hover:bg-[#0a2d59] text-white rounded-xl font-black uppercase tracking-widest shadow-lg transition-all active:scale-95">I Understand</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

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
            <h2 className="text-3xl md:text-4xl font-black text-slate-800 tracking-tight">Profile Settings</h2>
            <p className="text-slate-500 mt-2 text-sm md:text-base font-medium">Manage your profile details and password.</p>
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
              <span className="bg-[#0C3669] text-white text-[10px] font-black px-3 py-1 rounded-md uppercase tracking-widest mt-2 mb-6 shadow-md">{role}</span>
              <div className="w-full text-left space-y-4 mt-2 pt-6 border-t border-slate-100">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest block mb-1">Employee ID</label>
                  <p className="font-bold text-slate-800 text-base">{profile.emp_id}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest block mb-1">Department</label>
                  <p className="font-bold text-slate-800 text-base">{profile.department}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-6 md:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white">
              <div className="flex items-center gap-4 mb-8 pb-8 border-b border-slate-100">
                <div className="p-3 bg-gradient-to-br from-rose-100 to-red-100 text-rose-500 rounded-2xl shadow-inner"><Lock size={24} /></div>
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
  // MASTER LAYOUT
  // ==========================================
  return (
    <>
      <style>{`
        @keyframes fade-in-up { 0% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } }
        .animate-fade-in-up { animation: fade-in-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-stagger-fade-in { opacity: 0; animation: fade-in-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes slide-up { 0% { opacity: 0; transform: translateY(10px) scale(0.98); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        .animate-slide-up { animation: slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes scale-in { 0% { opacity: 0; transform: scale(0.95); } 100% { opacity: 1; transform: scale(1); } }
        .animate-scale-in { animation: scale-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes pulse-slow { 0%, 100% { opacity: 0.3; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.05); } }
        .animate-pulse-slow { animation: pulse-slow 6s ease-in-out infinite; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
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
        
        {isMobileMenuOpen && <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300" onClick={() => setIsMobileMenuOpen(false)} />}

        <aside className={`fixed md:static inset-y-0 left-0 z-50 w-[280px] bg-[#0C3669] text-slate-200 flex flex-col shrink-0 border-r border-white/5 transition-all duration-500 shadow-2xl md:shadow-none ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
          <div className="h-24 flex items-center justify-between px-8 border-b border-white/5 mb-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#F58220]/10 rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none"></div>
            <div className="flex items-center gap-4 relative z-10">
              <div className="h-10 w-10 bg-[#F58220] rounded-xl flex items-center justify-center font-black text-white text-xl shadow-lg">
                {profile.emp_id !== '...' ? profile.emp_id.charAt(0) : 'S'}
              </div>
              <div className="flex flex-col">
                <span className="font-black text-lg tracking-tight text-white drop-shadow-sm leading-tight">
                  {profile.emp_id !== '...' ? profile.emp_id : 'Staff'}
                </span>
                <span className="text-[9px] font-bold text-[#F58220] uppercase tracking-widest mt-0.5">
                  Portal
                </span>
              </div>
            </div>
            <button className="md:hidden text-slate-400 hover:text-white bg-white/5 p-2 rounded-lg" onClick={() => setIsMobileMenuOpen(false)}><X size={20} /></button>
          </div>

          <nav className="flex-1 px-5 space-y-3 relative z-10">
            <button onClick={() => { setCurrentView('permissions'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl font-bold transition-all duration-300 group overflow-hidden relative ${currentView === 'permissions' ? 'text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>
              {currentView === 'permissions' && <div className="absolute inset-0 bg-[#F58220]/20"></div>}
              {currentView !== 'permissions' && <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>}
              <div className="flex items-center gap-3 relative z-10"><FileSignature size={18} className={`transition-transform duration-300 ${currentView === 'permissions' ? 'scale-110' : 'group-hover:scale-110'}`} /> <span className="tracking-wide">Review Requests</span></div>
            </button>
            
            <button onClick={() => { setCurrentView('announcements'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl font-bold transition-all duration-300 group overflow-hidden relative ${currentView === 'announcements' ? 'text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>
              {currentView === 'announcements' && <div className="absolute inset-0 bg-[#F58220]/20"></div>}
              {currentView !== 'announcements' && <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>}
              <div className="flex items-center gap-3 relative z-10"><Bell size={18} className={`transition-transform duration-300 ${currentView === 'announcements' ? 'scale-110' : 'group-hover:scale-110'}`} /> <span className="tracking-wide">Announcements</span></div>
            </button>

            <button onClick={() => { setCurrentView('profile'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl font-bold transition-all duration-300 group overflow-hidden relative ${currentView === 'profile' ? 'text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>
              {currentView === 'profile' && <div className="absolute inset-0 bg-[#F58220]/20"></div>}
              {currentView !== 'profile' && <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>}
              <div className="flex items-center gap-3 relative z-10"><User size={18} className={`transition-transform duration-300 ${currentView === 'profile' ? 'scale-110' : 'group-hover:scale-110'}`} /> <span className="tracking-wide">Security & Profile</span></div>
            </button>
          </nav>

          <div className="p-6 border-t border-white/5 relative z-10">
            <button onClick={() => setShowLogoutConfirm(true)} className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl font-bold text-sm text-slate-400 bg-white/5 hover:bg-rose-500 hover:text-white hover:shadow-lg hover:shadow-rose-500/25 transition-all duration-300 group">
              <LogOut size={16} className="transition-transform group-hover:-translate-x-1" /> Log Out
            </button>
          </div>
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden relative w-full">
          {currentView === 'permissions' && renderPermissions()}
          {currentView === 'announcements' && renderAnnouncements()}
          {currentView === 'profile' && renderProfile()}

          {/* APPLICATION DETAILS MODAL */}
          {selectedApp && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-3 md:p-6 z-[60] animate-fade-in">
              <div className="bg-white rounded-[2rem] w-full max-w-3xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)] overflow-hidden border border-white/20 transform transition-all animate-slide-up max-h-[95vh] md:max-h-[90vh] flex flex-col">
                <div className="bg-[#0c3669] p-6 md:p-8 text-white flex justify-between items-start shrink-0">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-2">Request Details</h2>
                    <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                      <span className="text-blue-200 font-bold text-sm md:text-base tracking-widest">APP-{selectedApp.application_id}</span>
                      <span className="bg-white/10 text-[10px] md:text-xs px-2.5 py-0.5 rounded text-white/80 uppercase font-bold tracking-widest border border-white/10">{selectedApp.leave_type}</span>
                      {selectedApp.is_emergency && <span className="bg-rose-500/20 border border-rose-400/50 text-rose-200 text-[9px] md:text-[10px] px-2.5 py-0.5 rounded uppercase font-bold tracking-widest flex items-center gap-1"><AlertCircle size={12} /> High Priority</span>}
                    </div>
                  </div>
                  <button onClick={() => setSelectedApp(null)} className="text-white/60 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-xl transition-all"><X size={20} /></button>
                </div>
                
                <div className="p-6 md:p-8 overflow-y-auto space-y-6 md:space-y-8 flex-1 bg-slate-50/50">
                  <div className="bg-white rounded-2xl border border-slate-100 p-5 md:p-6 shadow-sm relative overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#0C3669]"></div>
                    <h4 className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-400 mb-4 ml-2">Student Details</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 md:gap-y-5 gap-x-6 text-sm ml-2">
                      <div><label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block mb-1">Full Name</label><p className="font-black text-slate-800 text-base">{selectedApp.student_name}</p></div>
                      <div><label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block mb-1">Roll Number</label><p className="font-mono font-black text-[#0C3669] text-base bg-[#0C3669]/5 inline-block px-2 py-0.5 rounded border border-[#0C3669]/20">{selectedApp.student_roll_no}</p></div>
                      <div><label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block mb-1">Department</label><p className="font-bold text-slate-700">{selectedApp.department}</p></div>
                      <div><label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block mb-1">Year of Study</label><p className="font-bold text-slate-700">Year {selectedApp.year} of 4</p></div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6 bg-white rounded-2xl border border-slate-100 p-5 md:p-6 shadow-sm">
                    <div><label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block mb-1.5">Requested Timeline</label><div className="inline-flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100"><p className="font-black text-slate-800 text-sm md:text-base">{selectedApp.from_date}</p><ChevronRight size={14} className="text-slate-300"/><p className="font-black text-slate-800 text-sm md:text-base">{selectedApp.to_date}</p></div></div>
                    <div><label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block mb-1.5">Applied On</label><p className="font-bold text-slate-600 text-sm md:text-base mt-2">{new Date(selectedApp.applied_at).toLocaleString()}</p></div>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-2 block">Reason for Request</label>
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-sm">
                      <strong className="text-slate-900 text-lg md:text-xl font-black block mb-3 border-b border-slate-100 pb-3">{selectedApp.subject}</strong>
                      <div className="text-slate-600 leading-relaxed text-sm md:text-base max-h-40 overflow-y-auto pr-3 scrollbar-thin font-medium">{selectedApp.description}</div>
                    </div>
                  </div>

                  {selectedApp.attachment_url && (
                    <div className="p-4 bg-[#0C3669]/5 border border-[#0C3669]/15 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm group hover:bg-[#0C3669]/10 transition-colors">
                      <div className="flex items-center gap-4"><div className="p-3 bg-white text-[#0C3669] rounded-xl shadow-sm group-hover:scale-110 transition-transform"><Download size={20} /></div><div><p className="text-sm font-black text-slate-800">Attached Document</p><p className="text-xs font-bold text-[#0C3669]/60 mt-0.5">File attached</p></div></div>
                      <a href={selectedApp.attachment_url} target="_blank" rel="noreferrer" className="text-center text-xs font-bold text-white bg-[#0C3669] hover:bg-[#0a2d59] px-6 py-3 rounded-xl shadow-md transition-all active:scale-95 w-full sm:w-auto uppercase tracking-widest">View File</a>
                    </div>
                  )}

                  <div className="space-y-4 pt-4 border-t border-slate-200/60">
                    {activeTab === 'pending' ? (
                      <>
                        <div>
                          <label className="block text-xs md:text-sm font-black text-slate-700 mb-2 uppercase tracking-widest">Remarks / Feedback</label>
                          <textarea className="w-full bg-white border border-slate-200 text-slate-800 rounded-2xl p-4 focus:ring-4 focus:ring-[#0C3669]/20 focus:border-[#0C3669] outline-none transition-all resize-none text-sm shadow-inner font-medium" rows="3" placeholder="Enter your remarks here..." value={remarks} onChange={(e) => setRemarks(e.target.value)}></textarea>
                        </div>
                        {role === 'FACULTY' && (
                          <label className="flex items-start sm:items-center gap-3 p-4 bg-rose-50 border border-rose-200 rounded-2xl cursor-pointer hover:bg-rose-100 transition-colors select-none shadow-sm">
                            <input type="checkbox" className="w-5 h-5 mt-0.5 sm:mt-0 rounded-md border-rose-300 text-rose-600 focus:ring-rose-500 cursor-pointer shrink-0" checked={isEmergency} onChange={(e) => setIsEmergency(e.target.checked)}/>
                            <span className="text-sm font-bold text-rose-900">Elevate to Emergency Priority Queue (Bypasses SLA limits)</span>
                          </label>
                        )}
                      </>
                    ) : (
                      <div className="space-y-4">
                        <h4 className="text-xs font-black uppercase text-slate-800 tracking-widest mb-2">Authority Remarks</h4>
                        {selectedApp.proctor_remarks && (
                          <div className="bg-[#0C3669]/5 border border-[#0C3669]/20 p-4 rounded-xl">
                            <p className="text-[10px] font-black text-[#0C3669] uppercase tracking-widest mb-1 flex items-center gap-1.5"><User size={12}/> Proctor</p>
                            <p className="text-sm font-bold text-[#0C3669] italic">"{selectedApp.proctor_remarks}"</p>
                          </div>
                        )}
                        {selectedApp.hod_remarks && (
                          <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl">
                            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1 flex items-center gap-1.5"><CheckCircle size={12}/> HOD / Warden</p>
                            <p className="text-sm font-bold text-emerald-900 italic">"{selectedApp.hod_remarks}"</p>
                          </div>
                        )}
                        {(!selectedApp.proctor_remarks && !selectedApp.hod_remarks) && (
                          <p className="text-sm font-medium text-slate-500 italic p-4 bg-slate-50 rounded-xl border border-slate-100">No remarks provided.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row gap-3 p-6 md:p-8 border-t border-slate-100 bg-white shrink-0">
                  {activeTab === 'pending' ? (
                    <>
                      <button onClick={() => setSelectedApp(null)} disabled={processingAction !== null} className="px-8 py-3.5 rounded-xl font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors w-full sm:w-auto text-sm uppercase tracking-widest disabled:opacity-50">Cancel</button>
                      <div className="flex-1 flex gap-3 w-full">
                        <button onClick={() => handleAction('REJECTED')} disabled={processingAction !== null} className="flex-1 flex justify-center items-center gap-2 py-3.5 rounded-xl font-black text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-600 hover:text-white transition-all shadow-sm text-sm uppercase tracking-widest active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed">
                          {processingAction === 'REJECTED' ? <Loader2 size={18} className="animate-spin" /> : <X size={18} />} 
                          {processingAction === 'REJECTED' ? 'Rejecting...' : 'Reject'}
                        </button>
                        <button onClick={() => handleAction('APPROVED')} disabled={processingAction !== null} className="flex-1 flex justify-center items-center gap-2 py-3.5 rounded-xl font-black text-white bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/30 transition-all text-sm uppercase tracking-widest active:scale-95 hover:-translate-y-0.5 border border-emerald-400 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0">
                          {processingAction === 'APPROVED' ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />} 
                          {processingAction === 'APPROVED' ? 'Approving...' : 'Approve'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="w-full flex justify-end">
                      <button onClick={() => setSelectedApp(null)} className="px-6 py-3 bg-[#0C3669] text-white font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-[#0a2d59] transition-colors shadow-md">Close Details</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* BROADCAST CREATION MODAL */}
          {showBroadcastModal && (
            <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 md:p-6 bg-slate-900/60 backdrop-blur-md animate-fade-in">
              <div className="bg-white rounded-[3rem] w-full max-w-3xl overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)] animate-scale-in flex flex-col max-h-[95vh] md:max-h-[90vh]">
                
                <div className="bg-[#0c3669] p-6 md:p-8 text-white flex justify-between items-start shrink-0">
                  <div>
                    <h2 className="text-2xl font-black tracking-tight mb-1">New Announcement</h2>
                    <p className="text-blue-200 font-medium text-xs uppercase tracking-widest">Select audience and attach files</p>
                  </div>
                  <button onClick={() => setShowBroadcastModal(false)} disabled={isBroadcasting} className="text-white/60 hover:text-white bg-white/10 hover:bg-white/20 p-2.5 rounded-xl transition-all disabled:opacity-50"><X size={20} /></button>
                </div>

                <div className="p-8 md:p-10 overflow-y-auto flex-1 bg-slate-50/50 no-scrollbar">
                  <form onSubmit={handleBroadcastSubmit} className="space-y-6">
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                      <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Target Audience</label>
                        <select 
                          value={newBroadcast.target_role} 
                          onChange={handleAudienceChange} 
                          className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-bold rounded-xl p-3 outline-none text-sm cursor-pointer"
                        >
                          {role === 'FACULTY' ? (
                            <>
                              <option value="STUDENT">My Department Students</option>
                              <option value="PROCTORED_STUDENTS">My Proctored Students</option>
                              <option value="FACULTY">My Department Faculty</option>
                              <option value="HOD">My HOD</option>
                            </>
                          ) : (
                            <>
                              <option value="STUDENT">My Department Students</option>
                              <option value="FACULTY">Particular Dept Faculty</option>
                              <option value="HOD">Other HODs</option>
                              <option value="ALL_STAFF">All College Staff (Everyone)</option>
                            </>
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Department</label>
                        <select 
                          value={newBroadcast.target_dept} 
                          onChange={(e) => setNewBroadcast({...newBroadcast, target_dept: e.target.value})} 
                          disabled={role === 'FACULTY' || newBroadcast.target_role === 'STUDENT' || newBroadcast.target_role === 'ALL_STAFF' || newBroadcast.target_role === 'PROCTORED_STUDENTS'}
                          className={`w-full border font-bold rounded-xl p-3 outline-none text-sm ${
                            (role === 'FACULTY' || newBroadcast.target_role === 'STUDENT' || newBroadcast.target_role === 'ALL_STAFF' || newBroadcast.target_role === 'PROCTORED_STUDENTS') 
                              ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed opacity-70' 
                              : 'bg-slate-50 border-slate-200 text-slate-800 cursor-pointer'
                          }`}
                        >
                          <option value="ALL">All Branches</option>
                          <option value="CSE">CSE</option>
                          <option value="ECE">ECE</option>
                          <option value="EEE">EEE</option>
                          <option value="MECH">MECH</option>
                          <option value="CIVIL">CIVIL</option>
                        </select>
                      </div>
                      
                      {newBroadcast.target_role === 'STUDENT' && (
                        <div>
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Year</label>
                          <select value={newBroadcast.target_year} onChange={(e) => setNewBroadcast({...newBroadcast, target_year: e.target.value})} className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-bold rounded-xl p-3 outline-none text-sm cursor-pointer">
                            <option value="ALL">All Years</option>
                            <option value="1">1st Year</option>
                            <option value="2">2nd Year</option>
                            <option value="3">3rd Year</option>
                            <option value="4">4th Year</option>
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Title</label>
                        <input required type="text" value={newBroadcast.title} onChange={(e) => setNewBroadcast({...newBroadcast, title: e.target.value})} placeholder="E.g., Tomorrow declared a holiday" className="w-full bg-white border border-slate-200 text-slate-800 font-bold rounded-2xl focus:ring-4 focus:ring-[#0C3669]/20 focus:border-[#0C3669] block p-4 outline-none transition-all shadow-inner text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Message</label>
                        <textarea required rows="3" value={newBroadcast.description} onChange={(e) => setNewBroadcast({...newBroadcast, description: e.target.value})} placeholder="Detailed information..." className="w-full bg-white border border-slate-200 text-slate-800 font-medium rounded-2xl focus:ring-4 focus:ring-[#0C3669]/20 focus:border-[#0C3669] block p-4 outline-none transition-all shadow-inner resize-none text-sm"></textarea>
                      </div>
                    </div>

                    <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden">
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block flex items-center gap-1.5">
                          <Paperclip size={14} className="text-indigo-400" /> Attached Documents (Max 3)
                        </label>
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                          {selectedFiles.length} / 3 Selected
                        </span>
                      </div>
                      
                      <div className="relative border-2 border-dashed border-indigo-100 hover:border-indigo-300 bg-indigo-50/30 hover:bg-indigo-50/60 transition-colors rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer">
                        <input 
                          type="file" 
                          multiple 
                          accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx" 
                          onChange={handleFileChange}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div className="bg-white p-3 rounded-full text-indigo-500 mb-2 shadow-sm border border-indigo-50">
                          <Paperclip size={20} />
                        </div>
                        <p className="text-sm font-bold text-slate-700">Click or Drag files to attach</p>
                        <p className="text-xs text-slate-400 font-medium mt-1">PDF, DOC, Images or Videos (Up to 5MB each)</p>
                      </div>

                      {selectedFiles.length > 0 && (
                        <div className="mt-4 space-y-2">
                          {selectedFiles.map((f, i) => (
                            <div key={i} className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                              <div className="flex items-center gap-2 text-sm font-bold text-slate-600 truncate">
                                {getFileIcon(f.type)}
                                <span className="truncate max-w-[200px] sm:max-w-xs">{f.name}</span>
                              </div>
                              <span className="text-[10px] font-black text-slate-400">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Priority Level</label>
                        <p className="text-xs font-medium text-slate-500">Determine how this alerts the users.</p>
                      </div>
                      <select value={newBroadcast.priority_level} onChange={(e) => setNewBroadcast({...newBroadcast, priority_level: e.target.value})} className={`p-3 rounded-xl text-xs font-black uppercase tracking-widest outline-none border transition-colors cursor-pointer ${newBroadcast.priority_level === 'EMERGENCY' ? 'bg-rose-50 border-rose-200 text-rose-600' : newBroadcast.priority_level === 'HIGH' ? 'bg-amber-50 border-amber-200 text-amber-600' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                        <option value="STANDARD">Standard Feed</option>
                        <option value="HIGH">High Priority</option>
                        <option value="EMERGENCY">Emergency (Screen Lock)</option>
                      </select>
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row gap-4 pt-4 border-t border-slate-200/60">
                      <button type="button" disabled={isBroadcasting} onClick={() => setShowBroadcastModal(false)} className="px-8 py-4 rounded-2xl font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors w-full sm:w-auto text-xs uppercase tracking-widest disabled:opacity-50">Cancel</button>
                      <button type="submit" disabled={isBroadcasting} className={`flex-1 flex justify-center items-center gap-2 py-4 rounded-2xl font-black text-white shadow-lg transition-all text-xs uppercase tracking-widest border disabled:opacity-70 disabled:cursor-not-allowed ${newBroadcast.priority_level === 'EMERGENCY' ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/30 border-rose-500' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/30 border-indigo-500'}`}>
                        {isBroadcasting ? (
                          <><Loader2 size={18} className="animate-spin" /> Sending...</>
                        ) : (
                          <><Send size={18} /> Send Announcement</>
                        )}
                      </button>
                    </div>

                  </form>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* ===== LOGOUT CONFIRMATION MODAL ===== */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="logout-modal-title-staff">
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
              <h2 id="logout-modal-title-staff" className="text-center text-2xl font-black text-slate-800 mb-2 tracking-tight">
                Sign Out?
              </h2>
              <p className="text-center text-slate-500 text-sm leading-relaxed mb-8">
                You're about to sign out of the <span className="font-bold text-slate-700">Staff Portal</span>. Any unsaved changes will be lost.
              </p>
              {/* Actions */}
              <div className="flex flex-col gap-3">
                <button
                  id="staff-logout-confirm-btn"
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-white bg-rose-500 hover:bg-rose-600 shadow-lg shadow-rose-500/30 transition-all duration-200 active:scale-95 uppercase tracking-widest text-xs"
                >
                  <LogOut size={15} /> Yes, Sign Me Out
                </button>
                <button
                  id="staff-logout-cancel-btn"
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