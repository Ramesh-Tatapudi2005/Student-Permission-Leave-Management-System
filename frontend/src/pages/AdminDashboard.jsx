import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, Shield, Radio, Database, LogOut, Search, 
  PlusCircle, AlertCircle, X, Loader2, UploadCloud, Edit3, Key, Save,
  Filter, Mail, Briefcase, Calendar, Trash2, FileDown, CheckCircle, XCircle, User, Clock,
  Activity, Settings, FileText, UserCheck, Menu
} from 'lucide-react';
import { adminAPI, getApiError } from '../utils/api';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState('iam'); 
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // ==========================================
  // CUSTOM NOTIFICATION & LOCALIZED LOADING STATES
  // ==========================================
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });
  const [confirmDialog, setConfirmDialog] = useState({ show: false, message: '', onConfirm: null });
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  
  // Localized loading states (Replaces full-screen freezing)
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);
  const [isResettingPwd, setIsResettingPwd] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeletingAnnouncement, setIsDeletingAnnouncement] = useState(false);
  const [processingAction, setProcessingAction] = useState(null); // 'APPROVED' | 'REJECTED' | null

  const notify = (message, type = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 5000);
  };

  const confirmAction = (message, onConfirm) => {
    setConfirmDialog({ show: true, message, onConfirm });
  };

  // ==========================================
  // PILLAR 1 STATES (IAM)
  // ==========================================
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [yearFilter, setYearFilter] = useState('ALL');
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const filterRef = useRef(null);

  const [users, setUsers] = useState([]);
  const [facultyList, setFacultyList] = useState([]); 
  const [stats, setStats] = useState({ students: 0, staff: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isProvisionOpen, setIsProvisionOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [isViewDetailsOpen, setIsViewDetailsOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  
  const [newIdentity, setNewIdentity] = useState({ id: '', name: '', role: 'STUDENT', department: 'CSE', email: '', year: 1 });
  const [bulkFile, setBulkFile] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [isUploading, setIsUploading] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState([]);

  // ==========================================
  // PILLAR 3 STATES (APPLICATION VAULT)
  // ==========================================
  const [applications, setApplications] = useState([]);
  const [appLoading, setAppLoading] = useState(false);
  const [appSearch, setAppSearch] = useState('');
  
  const [showAppFilters, setShowAppFilters] = useState(false);
  const [appDeptFilter, setAppDeptFilter] = useState('ALL');
  const [appStatusFilter, setAppStatusFilter] = useState('ALL');
  const [appYearFilter, setAppYearFilter] = useState('ALL');
  const [appProctorFilter, setAppProctorFilter] = useState('ALL');
  const appFilterRef = useRef(null);
  
  const [isOverrideOpen, setIsOverrideOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);
  const [viewAppDetails, setViewAppDetails] = useState(null); 
  const [overrideRemarks, setOverrideRemarks] = useState('');

  // ==========================================
  // PILLAR 2 STATES (SYSTEM OVERRIDE)
  // ==========================================
  const [moderationFeed, setModerationFeed] = useState([]);
  const [modLoading, setModLoading] = useState(false);
  const [broadcastForm, setBroadcastForm] = useState({ title: '', description: '' });
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [viewBroadcastDetails, setViewBroadcastDetails] = useState(null);
  const [broadcastSearch, setBroadcastSearch] = useState('');
  const [broadcastRoleFilter, setBroadcastRoleFilter] = useState('ALL');

  // ==========================================
  // PILLAR 4 STATES (TELEMETRY)
  // ==========================================
  const [telemetry, setTelemetry] = useState(null);
  const [isTelemetryLoading, setIsTelemetryLoading] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [isAddingDept, setIsAddingDept] = useState(false);

  // NEW: Dynamic Departments State
  const [departments, setDepartments] = useState(['CSE', 'ECE', 'EEE', 'MECH', 'CIVIL', 'IT']);

  // Initialize Network Connection & Handle View Changes
  useEffect(() => {
    if (currentView === 'iam') loadIdentities();
    if (currentView === 'applications') {
      loadApplications();
      if (users.length === 0) loadIdentities(); 
    }
    if (currentView === 'broadcasts') loadModerationFeed();
    if (currentView === 'telemetry') loadTelemetryData();
  }, [currentView]);

  // Handle clicking outside the filter menus to close them automatically
  useEffect(() => {
    function handleClickOutside(event) {
      if (filterRef.current && !filterRef.current.contains(event.target)) setIsFilterMenuOpen(false);
      if (appFilterRef.current && !appFilterRef.current.contains(event.target)) setShowAppFilters(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [filterRef, appFilterRef]);

  // ==========================================
  // PILLAR 1: ACTIONS (IAM)
  // ==========================================
  const loadIdentities = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getAllUsers();
      const allUsers = response.data?.users || [];
      
      setUsers(allUsers);
      setFacultyList(allUsers.filter(u => u.role === 'FACULTY' || u.role === 'HOD'));
      
      setStats({
        students: response.data?.total_students || 0,
        staff: response.data?.total_staff || 0,
        total: (response.data?.total_students || 0) + (response.data?.total_staff || 0)
      });
      setError(null);
    } catch (err) {
      console.error("Failed to load users:", err);
      setError("Failed to synchronize with database.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateIdentity = async (e) => {
    e.preventDefault();
    setIsCreatingUser(true);
    try {
      const response = await adminAPI.provisionUser(newIdentity);
      notify(`Success! ${response.data.message}\nDefault Password: ${response.data.temporary_password}`, 'success');
      setNewIdentity({ id: '', name: '', role: 'STUDENT', department: 'CSE', email: '', year: 1 });
      setIsProvisionOpen(false);
      loadIdentities(); 
    } catch (err) { notify(getApiError(err, 'Failed to create account.'), 'error'); }
    finally { setIsCreatingUser(false); }
  };

  const handleBulkUpload = async (e) => {
    e.preventDefault();
    if (!bulkFile) return notify("Please select a file first.", 'error');
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', bulkFile);
    try {
      await adminAPI.bulkProvision(formData);
      notify("Bulk upload successful! Users added to system.", 'success');
      setIsBulkOpen(false);
      setBulkFile(null);
      loadIdentities();
    } catch (err) { notify(getApiError(err, 'Bulk upload failed.'), 'error'); } 
    finally { setIsUploading(false); }
  };

  const handleBulkDelete = () => {
    if (selectedUsers.length === 0) return;
    confirmAction(`You are about to permanently delete ${selectedUsers.length} user(s). This action cannot be undone. Are you sure?`, async () => {
      setConfirmDialog({ show: false, message: '', onConfirm: null });
      setIsDeletingBulk(true);
      try {
        await adminAPI.bulkDelete({ user_ids: selectedUsers });
        notify(`Successfully deleted ${selectedUsers.length} users.`, 'success');
        setSelectedUsers([]); 
        loadIdentities(); 
      } catch (err) {
        notify(getApiError(err, 'A network error occurred while deleting users.'), 'error');
      } finally {
        setIsDeletingBulk(false);
      }
    });
  };

  const handleSelectAll = (e) => { e.target.checked ? setSelectedUsers(filteredUsers.map(u => u.id)) : setSelectedUsers([]); };
  const handleSelectUser = (e, id) => {
    e.stopPropagation();
    e.target.checked ? setSelectedUsers(prev => [...prev, id]) : setSelectedUsers(prev => prev.filter(userId => userId !== id));
  };

  const openViewModal = (user) => { setSelectedUser(user); setIsViewDetailsOpen(true); };
  const openEditModal = (user) => {
    setSelectedUser(user);
    setEditFormData({ role: user.role, department: user.department, proctor_id: user.proctor_id || '' });
    setIsViewDetailsOpen(false); 
    setIsEditOpen(true);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    setIsUpdatingUser(true);
    try {
      await adminAPI.updateUser(selectedUser.id, editFormData);
      notify("User profile updated successfully.", 'success');
      setIsEditOpen(false);
      loadIdentities();
    } catch (err) { notify(getApiError(err, 'Update failed.'), 'error'); }
    finally { setIsUpdatingUser(false); }
  };

  const handleCryptographicReset = () => {
    confirmAction(`Are you sure you want to force a password reset for ${selectedUser.id}?`, async () => {
      setConfirmDialog({ show: false, message: '', onConfirm: null });
      setIsResettingPwd(true);
      try {
        const res = await adminAPI.resetPassword(selectedUser.id);
        notify(`Password Reset Successful.\nNew Password: ${res.data.new_password}`, 'success');
      } catch (err) { notify(getApiError(err, 'Reset failed.'), 'error'); }
      finally { setIsResettingPwd(false); }
    });
  };

  // ==========================================
  // PILLAR 3: ACTIONS (VAULT)
  // ==========================================
  const loadApplications = async () => {
    try {
      setAppLoading(true);
      const response = await adminAPI.getAllApplications({ department: appDeptFilter });
      setApplications(response.data?.applications || []);
    } catch (err) { setApplications([]); } 
    finally { setAppLoading(false); }
  };

  const handleOverride = (status) => {
    confirmAction(`Are you sure you want to mark this request as ${status}?`, async () => {
      setConfirmDialog({ show: false, message: '', onConfirm: null });
      setProcessingAction(status);
      try {
        await adminAPI.overrideApplication(selectedApp.application_id, { status, admin_remarks: overrideRemarks });
        notify(`Application successfully marked as ${status}.`, 'success');
        setIsOverrideOpen(false);
        loadApplications();
      } catch (err) { notify(getApiError(err, 'Update failed.'), 'error'); }
      finally { setProcessingAction(null); }
    });
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await adminAPI.exportReport({ department: appDeptFilter });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Permission_Report_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      notify("Report downloaded successfully.", "success");
    } catch (err) { notify("Export failed.", "error"); }
    finally { setIsExporting(false); }
  };

  const handleLogout = () => {
    setShowLogoutConfirm(false);
    localStorage.clear();
    navigate('/login');
  };

  // ==========================================
  // PILLAR 2: ACTIONS (BROADCASTS)
  // ==========================================
  const loadModerationFeed = async () => {
    setModLoading(true);
    try {
      const res = await adminAPI.getModerationFeed();
      setModerationFeed(res.data?.announcements || []);
    } catch (err) {} 
    finally { setModLoading(false); }
  };

  const handleDeployBroadcast = (e) => {
    e.preventDefault();
    confirmAction("Send this announcement to all selected users?", async () => {
      setConfirmDialog({ show: false, message: '', onConfirm: null });
      setIsBroadcasting(true);
      try {
        await adminAPI.deployBroadcast(broadcastForm);
        notify("Announcement sent successfully.", 'success');
        setBroadcastForm({ title: '', description: '' });
        loadModerationFeed();
      } catch (err) { notify(getApiError(err, 'Failed to send message.'), 'error'); } 
      finally { setIsBroadcasting(false); }
    });
  };

  const handleKillBroadcast = (id) => {
    confirmAction("Are you sure you want to permanently delete this announcement?", async () => {
      setConfirmDialog({ show: false, message: '', onConfirm: null });
      setIsDeletingAnnouncement(true);
      try {
        await adminAPI.killBroadcast(id);
        setViewBroadcastDetails(null); 
        notify("Announcement deleted successfully.", 'success');
        loadModerationFeed(); 
      } catch (err) { notify(getApiError(err, 'Failed to delete announcement.'), 'error'); }
      finally { setIsDeletingAnnouncement(false); }
    });
  };

  const handleExportBroadcasts = () => {
    if (filteredModerationFeed.length === 0) return notify("No data to export.", "error");
    const headers = ["Announcement ID", "Sender Role", "Sender ID", "Title", "Message", "Sent To", "Department", "Priority", "Status", "Date"];
    const csvRows = filteredModerationFeed.map(ann => [
      ann.announcement_id, ann.posted_role, ann.posted_by, `"${ann.title.replace(/"/g, '""')}"`, `"${ann.description.replace(/"/g, '""')}"`, ann.target_role, ann.target_dept, ann.priority_level, ann.status, ann.created_at
    ]);
    const csvContent = [headers.join(','), ...csvRows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Announcements_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    notify("Announcements exported successfully.", "success");
  };

  // ==========================================
  // NEW PILLAR 4: TELEMETRY ACTIONS
  // ==========================================
  const loadTelemetryData = async () => {
    setIsTelemetryLoading(true);
    try {
      const res = await adminAPI.getTelemetry();
      setTelemetry(res.data);
    } catch (err) {
      console.error("Failed to load statistics:", err);
    } finally {
      setIsTelemetryLoading(false);
    }
  };

  const handleAddDepartment = async (e) => {
    e.preventDefault();
    if (!newDeptName) return;
    setIsAddingDept(true);
    try {
      const res = await adminAPI.addDepartment({ name: newDeptName });
      notify(res.data.message, 'success');
      
      // Instantly inject the new department into all dropdowns!
      if (!departments.includes(newDeptName)) {
        setDepartments(prev => [...prev, newDeptName]);
      }
      
      setNewDeptName('');
    } catch (err) {
      notify(getApiError(err, 'Failed to add department.'), 'error');
    } finally {
      setIsAddingDept(false);
    }
  };

  // ==========================================
  // DYNAMIC FILTERING MATRICES
  // ==========================================
  const filteredUsers = users.filter(u => {
    const searchMatch = (u.id || '').toLowerCase().includes(searchQuery.toLowerCase()) || (u.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || (u.email || '').toLowerCase().includes(searchQuery.toLowerCase());
    const roleMatch = roleFilter === 'ALL' || u.role === roleFilter;
    const deptMatch = deptFilter === 'ALL' || u.department === deptFilter;
    const currentYear = u.year || '1'; 
    const yearMatch = roleFilter !== 'STUDENT' || yearFilter === 'ALL' || String(currentYear) === String(yearFilter);
    return searchMatch && roleMatch && deptMatch && yearMatch;
  });

  const availableProctorsForFilter = facultyList.filter(f => f.role === 'FACULTY' && (appDeptFilter === 'ALL' || f.department === appDeptFilter));

  const filteredApps = applications.filter(app => {
    const searchMatch = (app.roll_no || '').toLowerCase().includes(appSearch.toLowerCase()) || (app.student_name || '').toLowerCase().includes(appSearch.toLowerCase()) || String(app.application_id).includes(appSearch);
    const deptMatch = appDeptFilter === 'ALL' || app.department === appDeptFilter;
    const statusMatch = appStatusFilter === 'ALL' || app.status === appStatusFilter;
    const studentInfo = users.find(u => u.id === app.roll_no) || {};
    const appYear = studentInfo.year ? String(studentInfo.year) : 'ALL';
    const yearMatch = appYearFilter === 'ALL' || appYear === String(appYearFilter);
    const appProctor = studentInfo.proctor_id || 'UNASSIGNED';
    const proctorMatch = appProctorFilter === 'ALL' || String(appProctor) === String(appProctorFilter);
    return searchMatch && deptMatch && statusMatch && yearMatch && proctorMatch;
  });

  const filteredModerationFeed = moderationFeed.filter(ann => {
    const matchSearch = broadcastSearch === '' || ann.title.toLowerCase().includes(broadcastSearch.toLowerCase()) || ann.posted_by.toLowerCase().includes(broadcastSearch.toLowerCase());
    const matchRole = broadcastRoleFilter === 'ALL' || ann.posted_role === broadcastRoleFilter;
    return matchSearch && matchRole;
  });

  // ==========================================
  // VIEW 1: IDENTITY & ACCESS MANAGEMENT
  // ==========================================
  const renderIAM = () => (
    <div className="w-full h-full flex flex-col bg-slate-50 relative z-0">
      <div className="absolute top-0 left-0 right-0 h-[260px] md:h-[300px] bg-[#0c3669] -z-10"></div>

      <div className="shrink-0 text-white pt-6 md:pt-8 px-4 md:px-8 relative z-[50]">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <button className="md:hidden text-blue-200 p-1.5 -ml-1.5 rounded-lg bg-white/10 border border-white/10 transition-colors hover:bg-white/20 hover:text-white" onClick={() => setIsMobileMenuOpen(true)}>
              <Menu size={18} />
            </button>
            <Shield className="text-blue-300" size={20} />
            <p className="text-blue-200 font-semibold tracking-widest text-[10px] uppercase">Admin Portal</p>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-5 md:mb-6">User Management</h1>
          
          <div className="flex flex-col md:flex-row items-center gap-3 md:gap-4 w-full">
            <div className="relative flex-1 w-full max-w-xl">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Search Users..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/10 border border-white/20 text-white placeholder-slate-400 rounded-xl md:rounded-2xl pl-10 md:pl-12 pr-4 md:pr-6 py-2.5 md:py-3.5 outline-none focus:ring-2 focus:ring-indigo-500 backdrop-blur-md text-sm"
              />
            </div>
            <div className="flex gap-2 md:gap-3 w-full md:w-auto">
              <button onClick={() => setIsBulkOpen(true)} className="flex-1 md:flex-none px-4 md:px-6 py-2.5 md:py-3.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl md:rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 whitespace-nowrap">
                <UploadCloud size={16} /> Upload CSV
              </button>
              <button onClick={() => setIsProvisionOpen(true)} className="flex-1 md:flex-none px-4 md:px-6 py-2.5 md:py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl md:rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/30 whitespace-nowrap">
                <PlusCircle size={16} /> Add User
              </button>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-3 mt-4 md:mt-6">
            <div className="relative z-[60]" ref={filterRef}>
              <button onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)} className={`flex items-center gap-2 px-4 md:px-5 py-2.5 md:py-3.5 rounded-xl md:rounded-2xl border transition-all text-xs font-bold uppercase tracking-widest active:scale-95 ${isFilterMenuOpen || roleFilter !== 'ALL' || deptFilter !== 'ALL' || yearFilter !== 'ALL' ? 'bg-white text-indigo-600 shadow-xl border-white' : 'bg-white/10 border-white/20 text-white hover:bg-white/20'}`}>
                <Filter size={16} /> Filters
              </button>
              {isFilterMenuOpen && (
                <div className="absolute top-full left-0 mt-3 w-72 sm:w-[340px] bg-white rounded-3xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.3)] border border-slate-100 p-6 animate-scale-in origin-top-left text-slate-800">
                  <div className="space-y-6">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">User Role</p>
                      <div className="grid grid-cols-2 gap-2">
                        {['ALL', 'STUDENT', 'FACULTY', 'HOD'].map(t => (
                          <button key={t} onClick={(e) => { e.preventDefault(); setRoleFilter(t); if(t !== 'STUDENT') setYearFilter('ALL'); }} className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${roleFilter === t ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-50 text-slate-500 hover:bg-slate-200'}`}>
                            {t === 'ALL' ? 'ALL ROLES' : t}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="border-t border-slate-100 pt-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Department</p>
                      <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="w-full bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-4 py-3.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer">
                        <option value="ALL">All Departments</option>
                        {departments.map(dept => (
                          <option key={dept} value={dept}>{dept}</option>
                        ))}
                      </select>
                    </div>
                    {roleFilter === 'STUDENT' && (
                      <div className="border-t border-slate-100 pt-4 animate-fade-in-up">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Year of Study</p>
                        <div className="grid grid-cols-2 gap-2">
                          {['ALL', '1', '2', '3', '4'].map(y => (
                            <button key={y} onClick={(e) => { e.preventDefault(); setYearFilter(y); }} className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${yearFilter === y ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-50 text-slate-500 hover:bg-slate-200'}`}>
                              {y === 'ALL' ? 'ALL YEARS' : `${y} YEAR`}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-3 border-t border-slate-100 pt-5 mt-2">
                      <button onClick={(e) => { e.preventDefault(); setRoleFilter('ALL'); setDeptFilter('ALL'); setYearFilter('ALL'); }} className="flex-1 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-800 transition-colors">Reset</button>
                      <button onClick={(e) => { e.preventDefault(); setIsFilterMenuOpen(false); }} className="flex-1 py-3.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-transform">Apply</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {(roleFilter !== 'ALL' || deptFilter !== 'ALL' || yearFilter !== 'ALL') && (
              <div className="flex items-center gap-1.5 flex-wrap z-10">
                {roleFilter !== 'ALL' && <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest">{roleFilter}</span>}
                {deptFilter !== 'ALL' && <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest">{deptFilter}</span>}
                {yearFilter !== 'ALL' && <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest">YEAR {yearFilter}</span>}
                <button onClick={() => { setRoleFilter('ALL'); setDeptFilter('ALL'); setYearFilter('ALL'); }} className="text-white/50 hover:text-rose-400 p-1.5 transition-colors ml-1"><X size={14} /></button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 mt-6 md:mt-8 relative z-10 pb-10">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-8">
            <div className="bg-white p-5 md:p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 flex items-center gap-4">
              <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl"><Users size={24}/></div>
              <div><h3 className="text-2xl md:text-3xl font-black text-slate-800">{loading ? '-' : stats.students}</h3><p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest">Total Students</p></div>
            </div>
            <div className="bg-white p-5 md:p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 flex items-center gap-4">
              <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl"><Shield size={24}/></div>
              <div><h3 className="text-2xl md:text-3xl font-black text-slate-800">{loading ? '-' : stats.staff}</h3><p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest">Active Staff</p></div>
            </div>
            <div className="bg-white p-5 md:p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 flex items-center gap-4">
              <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl"><Database size={24}/></div>
              <div><h3 className="text-2xl md:text-3xl font-black text-slate-800">{loading ? '-' : stats.total}</h3><p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest">Total Accounts</p></div>
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-black text-slate-800">User Accounts</h3>
                {selectedUsers.length > 0 && <span className="bg-indigo-100 text-indigo-700 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">{selectedUsers.length} Selected</span>}
              </div>
              <div className="flex items-center gap-4">
                {selectedUsers.length > 0 && (
                  <button onClick={handleBulkDelete} disabled={isDeletingBulk} className="text-xs font-bold text-rose-600 hover:text-white bg-rose-50 hover:bg-rose-600 px-4 py-2.5 rounded-xl uppercase tracking-widest flex items-center gap-2 transition-all shadow-sm disabled:opacity-50">
                    {isDeletingBulk ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    {isDeletingBulk ? 'Deleting...' : 'Delete Selected'}
                  </button>
                )}
                <button onClick={loadIdentities} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 uppercase tracking-widest flex items-center gap-1">Refresh List</button>
              </div>
            </div>
            
            {loading ? (
              <div className="p-16 flex flex-col items-center justify-center text-slate-400"><Loader2 size={40} className="animate-spin mb-4 text-indigo-500" /><p className="font-bold tracking-widest uppercase text-xs">Loading Users...</p></div>
            ) : error ? (
              <div className="p-10 text-center text-rose-500 font-bold bg-rose-50 m-4 rounded-2xl border border-rose-100"><AlertCircle className="mx-auto mb-2" size={32} />{error}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase tracking-widest text-slate-500">
                      <th className="p-4 pl-6 font-bold w-12"><input type="checkbox" onChange={handleSelectAll} checked={filteredUsers.length > 0 && selectedUsers.length === filteredUsers.length} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" /></th>
                      <th className="p-4 font-bold">ID</th>
                      <th className="p-4 font-bold">User Details</th>
                      <th className="p-4 font-bold">Role</th>
                      <th className="p-4 font-bold">Department</th>
                      <th className="p-4 font-bold text-right pr-6">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {filteredUsers.length > 0 ? filteredUsers.map((user, idx) => (
                      <tr key={idx} onClick={() => openViewModal(user)} className={`border-b border-slate-50 hover:bg-slate-50/80 transition-colors group cursor-pointer ${selectedUsers.includes(user.id) ? 'bg-indigo-50/50' : ''}`}>
                        <td className="p-4 pl-6" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedUsers.includes(user.id)} onChange={(e) => handleSelectUser(e, user.id)} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" /></td>
                        <td className="p-4 font-black text-slate-700">{user.id}</td>
                        <td className="p-4">
                          <p className="font-bold text-slate-700 group-hover:text-indigo-600 transition-colors">{user.name}</p>
                          <p className="text-xs text-slate-400">{user.email}</p>
                          {user.role === 'STUDENT' && <p className={`text-[10px] font-bold mt-1 uppercase ${user.proctor_id ? 'text-emerald-500' : 'text-rose-500'}`}>{user.proctor_id ? `Mentor: ${user.proctor_id}` : 'UNASSIGNED'}</p>}
                        </td>
                        <td className="p-4"><span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase ${user.role === 'ADMIN' ? 'bg-rose-100 text-rose-700' : user.role === 'STUDENT' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>{user.role}</span></td>
                        <td className="p-4 text-slate-500 font-bold">{user.department}{user.role === 'STUDENT' && <span className="block text-[10px] text-indigo-400 mt-1 uppercase tracking-widest font-black">Year {user.year || '1'}</span>}</td>
                        <td className="p-4 pr-6 text-right"><button onClick={(e) => { e.stopPropagation(); openEditModal(user); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-600 rounded-lg text-xs font-bold transition-colors"><Edit3 size={14} /> Edit</button></td>
                      </tr>
                    )) : <tr><td colSpan="6" className="p-8 text-center text-slate-400 font-medium">No users found matching your filters.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- MODALS FOR PILLAR 1 --- */}
      {isViewDetailsOpen && selectedUser && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] max-w-md w-full relative shadow-2xl animate-scale-in overflow-hidden border border-slate-100">
            <div className="h-32 bg-gradient-to-br from-indigo-500 to-violet-600 relative">
              <button onClick={() => setIsViewDetailsOpen(false)} className="absolute top-6 right-6 text-white/70 hover:text-white bg-black/10 hover:bg-black/20 p-2 rounded-full transition-all">
                <X size={20} />
              </button>
            </div>
            <div className="px-8 pb-8 relative">
              <div className="h-24 w-24 bg-white p-2 rounded-full shadow-lg absolute -top-12 left-8">
                <div className="w-full h-full bg-slate-100 rounded-full flex items-center justify-center text-slate-400 text-3xl font-black">{selectedUser.name.charAt(0)}</div>
              </div>
              <div className="pt-16 mb-6">
                <h2 className="text-2xl font-black text-slate-800">{selectedUser.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2.5 py-0.5 rounded text-[10px] font-black tracking-widest uppercase ${selectedUser.role === 'ADMIN' ? 'bg-rose-100 text-rose-700' : selectedUser.role === 'STUDENT' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>{selectedUser.role}</span>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{selectedUser.id}</span>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl border border-slate-100"><div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-500 shrink-0"><Briefcase size={18}/></div><div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Department</p><p className="text-sm font-bold text-slate-800">{selectedUser.department}</p></div></div>
                {selectedUser.role === 'STUDENT' && <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl border border-slate-100"><div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-500 shrink-0"><Calendar size={18}/></div><div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Year of Study</p><p className="text-sm font-bold text-slate-800">Year {selectedUser.year || '1'}</p></div></div>}
                <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl border border-slate-100"><div className="h-10 w-10 rounded-lg bg-sky-50 flex items-center justify-center text-sky-500 shrink-0"><Mail size={18}/></div><div className="overflow-hidden"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Email Address</p><p className="text-sm font-bold text-slate-800 truncate">{selectedUser.email}</p></div></div>
                {selectedUser.role === 'STUDENT' && <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl border border-slate-100"><div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-500 shrink-0"><Shield size={18}/></div><div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Assigned Proctor</p>{selectedUser.proctor_id ? <p className="text-sm font-bold text-emerald-600">{selectedUser.proctor_id}</p> : <p className="text-sm font-bold text-rose-500 uppercase text-[11px] tracking-wider">Unassigned (Action Required)</p>}</div></div>}
              </div>
              <div className="mt-8">
                <button onClick={() => openEditModal(selectedUser)} className="w-full py-4 bg-slate-900 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-800 transition-all shadow-lg flex items-center justify-center gap-2"><Edit3 size={16} /> Edit User</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isProvisionOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 p-8 rounded-3xl max-w-md w-full relative shadow-2xl animate-scale-in">
            <button onClick={() => setIsProvisionOpen(false)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600"><X size={24} /></button>
            <h2 className="text-2xl font-black text-slate-800 mb-1">Create New Account</h2>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-6">Enter user details</p>

            <form onSubmit={handleCreateIdentity} className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">ID (Roll/Emp)</label><input required type="text" placeholder={newIdentity.role === 'STUDENT' ? "e.g. 21CS101" : "e.g. EMP101"} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-bold outline-none focus:ring-2 focus:ring-indigo-500" value={newIdentity.id} onChange={(e) => setNewIdentity({...newIdentity, id: e.target.value})} /></div>
                <div><label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Role</label><select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-bold outline-none focus:ring-2 focus:ring-indigo-500" value={newIdentity.role} onChange={(e) => setNewIdentity({...newIdentity, role: e.target.value})}><option value="STUDENT">Student</option><option value="FACULTY">Faculty</option><option value="HOD">HOD</option><option value="WARDEN">Warden</option></select></div>
              </div>
              <div><label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Full Name</label><input required type="text" placeholder="John Doe" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-bold outline-none focus:ring-2 focus:ring-indigo-500" value={newIdentity.name} onChange={(e) => setNewIdentity({...newIdentity, name: e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Department</label><select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-bold outline-none focus:ring-2 focus:ring-indigo-500" value={newIdentity.department} onChange={(e) => setNewIdentity({...newIdentity, department: e.target.value})}>
                  {departments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                  <option value="ALL">ALL (Admin/Warden)</option>
                </select></div>
                <div><label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Email</label><input required type="email" placeholder="user@college.edu" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-bold outline-none focus:ring-2 focus:ring-indigo-500" value={newIdentity.email} onChange={(e) => setNewIdentity({...newIdentity, email: e.target.value})} /></div>
              </div>
              {newIdentity.role === 'STUDENT' && <div><label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Year of Study</label><select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-bold outline-none focus:ring-2 focus:ring-indigo-500" value={newIdentity.year || 1} onChange={(e) => setNewIdentity({...newIdentity, year: parseInt(e.target.value)})}><option value={1}>1st Year</option><option value={2}>2nd Year</option><option value={3}>3rd Year</option><option value={4}>4th Year</option></select></div>}
              
              <button type="submit" disabled={isCreatingUser} className="w-full py-4 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-indigo-700 transition-all shadow-lg mt-4 disabled:opacity-50 flex justify-center items-center gap-2">
                {isCreatingUser && <Loader2 size={16} className="animate-spin" />}
                {isCreatingUser ? 'Processing...' : 'Create Account'}
              </button>
            </form>
          </div>
        </div>
      )}

      {isBulkOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 p-8 rounded-3xl max-w-md w-full relative shadow-2xl animate-scale-in text-center">
            <button onClick={() => setIsBulkOpen(false)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600"><X size={24} /></button>
            <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4"><UploadCloud size={32} /></div>
            <h2 className="text-2xl font-black text-slate-800 mb-1">Import Multiple Users</h2>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-6">Upload a CSV file to create multiple accounts at once</p>
            <form onSubmit={handleBulkUpload}>
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 mb-6 hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors">
                <input type="file" accept=".csv" onChange={(e) => setBulkFile(e.target.files[0])} disabled={isUploading} className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" />
              </div>
              <button type="submit" disabled={isUploading || !bulkFile} className="w-full py-4 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-indigo-700 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
                {isUploading ? <><Loader2 size={16} className="animate-spin" />Processing Upload...</> : 'Upload & Create Accounts'}
              </button>
            </form>
          </div>
        </div>
      )}

      {isEditOpen && selectedUser && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 p-8 rounded-3xl max-w-md w-full relative shadow-2xl animate-scale-in">
            <button onClick={() => setIsEditOpen(false)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600"><X size={24} /></button>
            <div className="flex items-center gap-4 mb-6">
              <div className="h-12 w-12 bg-slate-100 rounded-full flex items-center justify-center font-black text-slate-400 text-xl">{selectedUser.name.charAt(0)}</div>
              <div><h2 className="text-xl font-black text-slate-800">{selectedUser.name}</h2><p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{selectedUser.id}</p></div>
            </div>
            <form onSubmit={handleUpdateUser} className="space-y-5">
              {selectedUser.role !== 'STUDENT' && selectedUser.role !== 'ADMIN' && (
                <div><label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Change Role</label><select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-bold outline-none focus:ring-2 focus:ring-indigo-500" value={editFormData.role} onChange={(e) => setEditFormData({...editFormData, role: e.target.value})}><option value="FACULTY">Faculty</option><option value="HOD">HOD</option><option value="WARDEN">Warden</option></select></div>
              )}
              {selectedUser.role === 'STUDENT' && (
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-indigo-500 mb-2">Assign Proctor/Mentor</label>
                  <select className="w-full p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-900 font-bold outline-none focus:ring-2 focus:ring-indigo-500" value={editFormData.proctor_id || ''} onChange={(e) => setEditFormData({...editFormData, proctor_id: e.target.value})}><option value="">-- Unassigned --</option>{facultyList.map(fac => (<option key={fac.id} value={fac.id}>{fac.name} ({fac.department})</option>))}</select>
                  <p className="text-[10px] font-medium text-slate-400 mt-2">Connecting a student to a Proctor allows them to review leaves.</p>
                </div>
              )}
              <div><label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Department</label><select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-bold outline-none focus:ring-2 focus:ring-indigo-500" value={editFormData.department} onChange={(e) => setEditFormData({...editFormData, department: e.target.value})}>
                {departments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                <option value="ALL">ALL</option>
              </select></div>
              <div className="pt-4 border-t border-slate-100">
                <button type="button" onClick={handleCryptographicReset} disabled={isResettingPwd} className="w-full py-3 bg-rose-50 text-rose-600 rounded-xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-rose-100 transition-colors disabled:opacity-50">
                  {isResettingPwd ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />}
                  {isResettingPwd ? 'Resetting...' : 'Reset Password'}
                </button>
                <p className="text-[10px] text-center text-slate-400 mt-2">Instantly generates a new temporary password for this user.</p>
              </div>
              <div className="pt-2">
                <button type="submit" disabled={isUpdatingUser} className="w-full py-4 bg-slate-900 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-800 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">
                  {isUpdatingUser ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {isUpdatingUser ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );

  // ==========================================
  // VIEW 2: GLOBAL APPLICATION MATRIX (PILLAR 3)
  // ==========================================
  const renderApplications = () => (
    <div className="w-full h-full flex flex-col bg-slate-50 relative z-0">
      
      <div className="absolute top-0 left-0 right-0 h-[260px] md:h-[300px] bg-[#0c3669] -z-10"></div>

      {/* Top Header Section */}
      <div className="shrink-0 text-white pt-6 md:pt-8 px-4 md:px-8 relative z-[50]">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <button className="md:hidden text-blue-200 p-1.5 -ml-1.5 rounded-lg bg-white/10 border border-white/10 transition-colors hover:bg-white/20 hover:text-white" onClick={() => setIsMobileMenuOpen(true)}>
              <Menu size={18} />
            </button>
            <Database className="text-blue-300" size={20} />
            <p className="text-blue-200 font-semibold tracking-widest text-[10px] uppercase">Permission Management System</p>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-5 md:mb-6">Student Permission Requests</h1>
          
          <div className="flex flex-col md:flex-row items-center gap-3 md:gap-4 w-full">
            <div className="relative flex-1 w-full max-w-xl">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Search by Roll No, Name, or App ID..." 
                value={appSearch}
                onChange={(e) => setAppSearch(e.target.value)}
                className="w-full bg-white/10 border border-white/20 text-white placeholder-slate-400 rounded-xl md:rounded-2xl pl-10 md:pl-12 pr-4 md:pr-6 py-2.5 md:py-3.5 outline-none focus:ring-2 focus:ring-emerald-500 backdrop-blur-md text-sm"
              />
            </div>
            
            <div className="flex gap-2 md:gap-3 w-full md:w-auto">
              <div className="relative" ref={appFilterRef}>
                <button 
                  onClick={() => setShowAppFilters(!showAppFilters)}
                  className={`flex-1 md:flex-none px-4 md:px-6 py-2.5 md:py-3.5 border text-white rounded-xl md:rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-sm ${
                    showAppFilters || appStatusFilter !== 'ALL' || appDeptFilter !== 'ALL' || appYearFilter !== 'ALL' || appProctorFilter !== 'ALL'
                    ? 'bg-white text-emerald-700 border-white shadow-emerald-500/20' 
                    : 'bg-white/10 border-white/20 hover:bg-white/20'
                  }`}
                >
                  <Filter size={16} /> Filters
                </button>

                {showAppFilters && (
                  <div className="absolute top-full right-0 mt-3 w-[340px] bg-white rounded-3xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.3)] border border-slate-100 p-6 animate-scale-in origin-top-right text-slate-800 z-[100]">
                    <div className="space-y-5">
                      
                      {/* Status Filter */}
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Application Status</p>
                        <div className="grid grid-cols-2 gap-2">
                          {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map(s => (
                            <button key={s} onClick={() => setAppStatusFilter(s)} className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${appStatusFilter === s ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-50 text-slate-500 hover:bg-slate-200'}`}>
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Department Filter */}
                      <div className="border-t border-slate-100 pt-4">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Department</p>
                        <select value={appDeptFilter} onChange={(e) => { setAppDeptFilter(e.target.value); setAppProctorFilter('ALL'); }} className="w-full bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer">
                          <option value="ALL">All Departments</option>
                          {departments.map(dept => (
                            <option key={dept} value={dept}>{dept}</option>
                          ))}
                        </select>
                      </div>

                      {/* Year Filter */}
                      <div className="border-t border-slate-100 pt-4">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Year of Study</p>
                        <select value={appYearFilter} onChange={(e) => setAppYearFilter(e.target.value)} className="w-full bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer">
                          <option value="ALL">All Years</option>
                          <option value="1">1st Year</option><option value="2">2nd Year</option><option value="3">3rd Year</option><option value="4">4th Year</option>
                        </select>
                      </div>

                      {/* Dynamic Proctor Filter */}
                      <div className="border-t border-slate-100 pt-4">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Assigned Proctor</p>
                        <select value={appProctorFilter} onChange={(e) => setAppProctorFilter(e.target.value)} className="w-full bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer">
                          <option value="ALL">All Proctors</option>
                          {availableProctorsForFilter.map(p => (
                            <option key={p.id} value={p.id}>{p.name} {appDeptFilter === 'ALL' ? `(${p.department})` : ''}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex gap-3 border-t border-slate-100 pt-4 mt-2">
                        <button onClick={() => { setAppStatusFilter('ALL'); setAppDeptFilter('ALL'); setAppYearFilter('ALL'); setAppProctorFilter('ALL'); }} className="flex-1 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-800 transition-colors">Reset</button>
                        <button onClick={() => setShowAppFilters(false)} className="flex-1 py-3.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-transform">Apply</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <button onClick={handleExport} disabled={isExporting} className="flex-1 md:flex-none px-4 md:px-6 py-2.5 md:py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl md:rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-widest transition-all whitespace-nowrap flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 disabled:opacity-70">
                {isExporting ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                {isExporting ? 'Exporting...' : 'Download Report'}
              </button>
            </div>
          </div>
          
          {/* Active Filter Chips */}
          {(appStatusFilter !== 'ALL' || appDeptFilter !== 'ALL' || appYearFilter !== 'ALL' || appProctorFilter !== 'ALL') && (
            <div className="flex items-center gap-1.5 flex-wrap z-10 mt-4">
              {appStatusFilter !== 'ALL' && <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest">{appStatusFilter}</span>}
              {appDeptFilter !== 'ALL' && <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest">{appDeptFilter}</span>}
              {appYearFilter !== 'ALL' && <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest">YEAR {appYearFilter}</span>}
              {appProctorFilter !== 'ALL' && <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest">FILTERED PROCTOR</span>}
              <button onClick={() => { setAppStatusFilter('ALL'); setAppDeptFilter('ALL'); setAppYearFilter('ALL'); setAppProctorFilter('ALL'); }} className="text-white/50 hover:text-rose-400 p-1.5 transition-colors ml-1"><X size={14} /></button>
            </div>
          )}

        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 mt-6 md:mt-8 relative z-10 pb-10">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-black text-slate-800">All Permission Requests</h3>
                <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">{filteredApps.length} Records</span>
              </div>
              <button onClick={loadApplications} className="text-xs font-bold text-emerald-600 hover:text-emerald-800 uppercase tracking-widest flex items-center gap-1">
                Refresh List
              </button>
            </div>
            
            {appLoading ? (
              <div className="p-16 flex flex-col items-center justify-center text-slate-400">
                <Loader2 size={40} className="animate-spin mb-4 text-emerald-500" />
                <p className="font-bold tracking-widest uppercase text-xs">Loading Requests...</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase tracking-widest text-slate-500">
                      <th className="p-4 pl-6 font-bold">ID</th>
                      <th className="p-4 font-bold">Student Details</th>
                      <th className="p-4 font-bold">Duration</th>
                      <th className="p-4 font-bold">Status</th>
                      <th className="p-4 font-bold text-right pr-6">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {filteredApps.length > 0 ? (
                      filteredApps.map((app, idx) => (
                        <tr key={idx} onClick={() => setViewAppDetails(app)} className="border-b border-slate-50 hover:bg-slate-50/80 transition-colors group cursor-pointer">
                          <td className="p-4 pl-6">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-black tracking-widest uppercase ${app.leave_type === 'Leave' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                {app.leave_type}
                              </span>
                              <span className="text-xs font-bold text-slate-400 group-hover:text-emerald-600 transition-colors">APP-{app.application_id}</span>
                            </div>
                          </td>
                          <td className="p-4">
                            <p className="font-bold text-slate-700 group-hover:text-emerald-700 transition-colors">{app.student_name}</p>
                            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mt-0.5">{app.roll_no} • {app.department}</p>
                          </td>
                          <td className="p-4">
                            <span className="text-xs font-bold text-slate-600">{app.from_date} <span className="text-[10px] text-slate-400 mx-1">TO</span> {app.to_date}</span>
                          </td>
                          <td className="p-4">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase ${app.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : app.status === 'REJECTED' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'}`}>
                              {app.status}
                            </span>
                            {app.status === 'PENDING' && (
                              <span className="block mt-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest">At: {app.current_stage}</span>
                            )}
                          </td>
                          <td className="p-4 pr-6 text-right">
                            <button 
                              onClick={(e) => { e.stopPropagation(); setSelectedApp(app); setOverrideRemarks(''); setIsOverrideOpen(true); }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 rounded-lg text-xs font-bold transition-colors shadow-sm"
                            >
                              <AlertCircle size={14} /> Update Status
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5" className="p-8 text-center text-slate-400 font-medium">
                          No requests found matching your filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- APP DETAILS MODAL --- */}
      {viewAppDetails && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] max-w-xl w-full relative shadow-2xl animate-scale-in overflow-hidden border border-slate-100">
            <div className={`h-32 relative ${viewAppDetails.status === 'APPROVED' ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : viewAppDetails.status === 'REJECTED' ? 'bg-gradient-to-br from-rose-500 to-red-600' : 'bg-gradient-to-br from-blue-500 to-indigo-600'}`}>
              <button onClick={() => setViewAppDetails(null)} className="absolute top-6 right-6 text-white/70 hover:text-white bg-black/10 hover:bg-black/20 p-2 rounded-full transition-all">
                <X size={20} />
              </button>
              <div className="absolute bottom-6 left-8 text-white">
                <span className="bg-white/20 px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest mb-2 inline-block">APP-{viewAppDetails.application_id}</span>
                <h2 className="text-3xl font-black">{viewAppDetails.leave_type.toUpperCase()} REQUEST</h2>
              </div>
            </div>
            
            <div className="p-8 bg-slate-50/50">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5"><User size={12}/> Student</p>
                  <p className="font-bold text-slate-800">{viewAppDetails.student_name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{viewAppDetails.roll_no} • {viewAppDetails.department}</p>
                </div>
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5"><Clock size={12}/> Duration</p>
                  <p className="font-bold text-slate-800">{viewAppDetails.from_date}</p>
                  <p className="text-xs text-slate-500 mt-0.5">To: {viewAppDetails.to_date}</p>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 mb-6 relative overflow-hidden">
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${viewAppDetails.status === 'APPROVED' ? 'bg-emerald-500' : viewAppDetails.status === 'REJECTED' ? 'bg-rose-500' : 'bg-blue-500'}`}></div>
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Audit Trail / Status</h4>
                
                <div className="flex items-center justify-between">
                  <div>
                    <span className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-widest ${viewAppDetails.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : viewAppDetails.status === 'REJECTED' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'}`}>
                      {viewAppDetails.status}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-700">
                      {viewAppDetails.status === 'APPROVED' 
                        ? `Approved by ${viewAppDetails.current_stage || 'Authority'}`
                        : viewAppDetails.status === 'REJECTED' 
                        ? `Rejected at ${viewAppDetails.current_stage || 'Review'}`
                        : `Awaiting action from ${viewAppDetails.current_stage || 'Proctor'}`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setViewAppDetails(null)} className="flex-1 py-4 bg-white border border-slate-200 text-slate-600 font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-50 transition-all shadow-sm">
                  Close
                </button>
                <button onClick={() => { setViewAppDetails(null); setSelectedApp(viewAppDetails); setOverrideRemarks(''); setIsOverrideOpen(true); }} className="flex-1 py-4 bg-rose-50 text-rose-600 font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-rose-600 hover:text-white transition-all shadow-sm border border-rose-200 flex justify-center items-center gap-2">
                  <AlertCircle size={16} /> Update Status
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- OVERRIDE MODAL --- */}
      {isOverrideOpen && selectedApp && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 p-8 rounded-3xl max-w-md w-full relative shadow-2xl animate-scale-in">
            <button onClick={() => setIsOverrideOpen(false)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600"><X size={24} /></button>
            <h2 className="text-2xl font-black text-slate-800 mb-1">Update Application Status</h2>
            <p className="text-xs text-rose-500 font-bold uppercase tracking-wider mb-6">Approve or Reject Request</p>

            <div className="mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">App ID</span>
                    <span className="text-xs font-bold text-slate-800">{selectedApp.application_id}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Student</span>
                    <span className="text-xs font-bold text-slate-800">{selectedApp.roll_no}</span>
                </div>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Admin Remarks</label>
                <textarea 
                  required 
                  rows="3"
                  placeholder="Enter reason for approval or rejection..." 
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-bold outline-none focus:ring-2 focus:ring-rose-500 resize-none" 
                  value={overrideRemarks} 
                  onChange={(e) => setOverrideRemarks(e.target.value)} 
                ></textarea>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button onClick={() => handleOverride('REJECTED')} disabled={processingAction !== null} className="w-full py-4 bg-rose-50 text-rose-600 border border-rose-200 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-rose-600 hover:text-white transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50">
                  {processingAction === 'REJECTED' ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                  {processingAction === 'REJECTED' ? 'Rejecting...' : 'Reject Request'}
                </button>
                <button onClick={() => handleOverride('APPROVED')} disabled={processingAction !== null} className="w-full py-4 bg-emerald-50 text-emerald-600 border border-emerald-200 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50">
                  {processingAction === 'APPROVED' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                  {processingAction === 'APPROVED' ? 'Approving...' : 'Approve Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ==========================================
  // VIEW 3: SYSTEM BROADCAST OVERRIDE (PILLAR 2)
  // ==========================================
  const renderBroadcasts = () => (
    <div className="w-full h-full flex flex-col bg-slate-50 relative z-0">
      
      <div className="absolute top-0 left-0 right-0 h-[260px] md:h-[300px] bg-[#0c3669] -z-10"></div>

      {/* Top Header Section */}
      <div className="shrink-0 text-white pt-6 md:pt-8 px-4 md:px-8 relative z-[50]">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <button className="md:hidden text-blue-200 p-1.5 -ml-1.5 rounded-lg bg-white/10 border border-white/10 transition-colors hover:bg-white/20 hover:text-white" onClick={() => setIsMobileMenuOpen(true)}>
              <Menu size={18} />
            </button>
            <Radio className="text-blue-300" size={20} />
            <p className="text-blue-200 font-semibold tracking-widest text-[10px] uppercase">Campus Announcements</p>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-5 md:mb-6">Announcements</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 mt-4 md:mt-6 relative z-10 pb-10">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 items-start">
          
          {/* DEPLOY BROADCAST FORM */}
          <div className="lg:col-span-1 sticky top-0 z-20">
            <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-rose-100 overflow-hidden relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 to-red-600"></div>
              <div className="p-6 md:p-8">
                <h3 className="text-xl font-black text-slate-800 mb-2">Create Announcement</h3>
                <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest mb-6">Send messages directly to users</p>
                
                <form onSubmit={handleDeployBroadcast} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Title</label>
                    <input required type="text" value={broadcastForm.title} onChange={(e) => setBroadcastForm({...broadcastForm, title: e.target.value})} placeholder="e.g., Campus Holiday" className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-bold rounded-xl focus:ring-4 focus:ring-rose-500/20 focus:border-rose-500 block p-3.5 outline-none transition-all text-sm shadow-sm" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Message</label>
                    <textarea required rows="4" value={broadcastForm.description} onChange={(e) => setBroadcastForm({...broadcastForm, description: e.target.value})} placeholder="Enter your message here..." className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-medium rounded-xl focus:ring-4 focus:ring-rose-500/20 focus:border-rose-500 block p-3.5 outline-none transition-all shadow-sm resize-none text-sm"></textarea>
                  </div>
                  <button type="submit" disabled={isBroadcasting} className="w-full py-4 mt-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-rose-500/30 active:scale-95 disabled:opacity-50">
                    {isBroadcasting ? <Loader2 size={16} className="animate-spin" /> : <Radio size={16} />}
                    {isBroadcasting ? 'Sending...' : 'Send Announcement'}
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* MODERATION FEED / KILL SWITCH */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden flex flex-col h-full min-h-[400px]">
              
              <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/50 shrink-0">
                <h3 className="text-lg font-black text-slate-800">Past Announcements</h3>
                <div className="flex gap-3 w-full sm:w-auto">
                  <button onClick={handleExportBroadcasts} disabled={isExporting} className="flex-1 sm:flex-none text-[10px] md:text-xs font-bold text-[#0C3669] bg-[#0C3669]/5 hover:bg-[#0C3669]/10 px-4 py-2 rounded-xl uppercase tracking-widest flex items-center justify-center gap-1.5 transition-colors disabled:opacity-70">
                    {isExporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                    {isExporting ? 'Exporting...' : 'Download Report'}
                  </button>
                  <button onClick={loadModerationFeed} className="flex-1 sm:flex-none text-[10px] md:text-xs font-bold text-slate-500 hover:text-slate-800 px-4 py-2 uppercase tracking-widest flex items-center justify-center gap-1 transition-colors">
                    Refresh List
                  </button>
                </div>
              </div>

              <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 bg-white">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input 
                    type="text" 
                    placeholder="Search by Title or ID..." 
                    value={broadcastSearch}
                    onChange={(e) => setBroadcastSearch(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl pl-10 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-rose-500/20 text-sm font-medium"
                  />
                </div>
                <select 
                  value={broadcastRoleFilter} 
                  onChange={(e) => setBroadcastRoleFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 text-slate-600 rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-widest outline-none focus:ring-2 focus:ring-rose-500/20 cursor-pointer"
                >
                  <option value="ALL">All Origins</option>
                  <option value="ADMIN">Admins Only</option>
                  <option value="HOD">HODs Only</option>
                  <option value="FACULTY">Faculty Only</option>
                </select>
              </div>
              
              <div className="flex-1 overflow-x-auto">
                {modLoading ? (
                  <div className="p-16 flex flex-col items-center justify-center text-slate-400">
                    <Loader2 size={40} className="animate-spin mb-4 text-slate-300" />
                    <p className="font-bold tracking-widest uppercase text-xs">Loading Announcements...</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse min-w-[600px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase tracking-widest text-slate-500">
                        <th className="p-5 pl-8 font-black">Sender</th>
                        <th className="p-5 font-black">Message</th>
                        <th className="p-5 font-black">Sent To</th>
                        <th className="p-5 font-black text-right pr-8">Action</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {filteredModerationFeed.length > 0 ? (
                        filteredModerationFeed.map((ann, idx) => (
                          <tr key={idx} onClick={() => setViewBroadcastDetails(ann)} className="border-b border-slate-50 hover:bg-slate-50/80 transition-colors group cursor-pointer">
                            <td className="p-5 pl-8">
                              <span className={`px-2.5 py-1 rounded-md text-[10px] font-black tracking-widest uppercase ${ann.posted_role === 'ADMIN' ? 'bg-rose-100 text-rose-700' : 'bg-[#0C3669]/10 text-[#0C3669]'}`}>
                                {ann.posted_role}
                              </span>
                              <p className="text-xs font-bold text-slate-500 mt-2">{ann.posted_by}</p>
                            </td>
                            <td className="p-5 max-w-[250px]">
                              <div className="flex items-center gap-2 mb-1.5">
                                {ann.priority_level === 'EMERGENCY' && <AlertCircle size={14} className="text-rose-500 shrink-0" />}
                                <p className="text-base font-black text-slate-800 truncate group-hover:text-rose-600 transition-colors">{ann.title}</p>
                              </div>
                              <p className="text-sm text-slate-500 line-clamp-2 leading-relaxed">{ann.description}</p>
                            </td>
                            <td className="p-5">
                              <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1.5 rounded uppercase tracking-wider">{ann.target_role}</span>
                              {ann.target_dept !== 'ALL' && <span className="text-[10px] font-bold text-slate-500 ml-1">({ann.target_dept})</span>}
                            </td>
                            <td className="p-5 pr-8 text-right">
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleKillBroadcast(ann.announcement_id); }}
                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-rose-200 text-rose-500 hover:bg-rose-500 hover:text-white rounded-lg text-xs uppercase tracking-widest font-black transition-all shadow-sm"
                              >
                                <X size={14} /> Delete
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4" className="p-12 text-center text-slate-400 font-medium text-sm">
                            No announcements matching your search.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- BROADCAST DETAILS MODAL --- */}
      {viewBroadcastDetails && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] max-w-xl w-full relative shadow-2xl animate-scale-in overflow-hidden border border-slate-100">
            <div className={`h-32 relative ${viewBroadcastDetails.priority_level === 'EMERGENCY' ? 'bg-gradient-to-br from-rose-500 to-red-600' : 'bg-gradient-to-br from-indigo-500 to-blue-600'}`}>
              <button onClick={() => setViewBroadcastDetails(null)} className="absolute top-6 right-6 text-white/70 hover:text-white bg-black/10 hover:bg-black/20 p-2 rounded-full transition-all">
                <X size={20} />
              </button>
              <div className="absolute bottom-6 left-8 text-white">
                <span className="bg-white/20 px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest mb-2 inline-block">ID: {viewBroadcastDetails.announcement_id}</span>
                <h2 className="text-3xl font-black truncate max-w-sm">{viewBroadcastDetails.title}</h2>
              </div>
            </div>
            
            <div className="p-8 bg-slate-50/50">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5"><User size={12}/> Origin</p>
                  <p className="font-bold text-slate-800">{viewBroadcastDetails.posted_by}</p>
                  <p className="text-xs text-slate-500 mt-0.5 font-bold uppercase">{viewBroadcastDetails.posted_role}</p>
                </div>
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5"><Clock size={12}/> Time</p>
                  <p className="font-bold text-slate-800">{viewBroadcastDetails.created_at.split(' ')[0]}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{viewBroadcastDetails.created_at.split(' ')[1]}</p>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 mb-6 relative overflow-hidden">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Message</h4>
                <p className="text-sm text-slate-700 leading-relaxed font-medium whitespace-pre-wrap">
                  {viewBroadcastDetails.description}
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setViewBroadcastDetails(null)} className="flex-1 py-4 bg-white border border-slate-200 text-slate-600 font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-50 transition-all shadow-sm">
                  Close View
                </button>
                <button onClick={() => handleKillBroadcast(viewBroadcastDetails.announcement_id)} disabled={isDeletingAnnouncement} className="flex-1 py-4 bg-rose-50 text-rose-600 font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-rose-600 hover:text-white transition-all shadow-sm border border-rose-200 flex justify-center items-center gap-2 disabled:opacity-50">
                  {isDeletingAnnouncement ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                  {isDeletingAnnouncement ? 'Deleting...' : 'Delete Announcement'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ==========================================
  // VIEW 4: SYSTEM TELEMETRY (NEW PILLAR 4)
  // ==========================================
  const renderTelemetry = () => (
    <div className="w-full h-full flex flex-col bg-slate-50 relative z-0">
      
      <div className="absolute top-0 left-0 right-0 h-[260px] md:h-[300px] bg-[#0c3669] -z-10"></div>

      {/* Top Header Section */}
      <div className="shrink-0 text-white pt-6 md:pt-8 px-4 md:px-8 relative z-[50]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <button className="md:hidden text-blue-200 p-1.5 -ml-1.5 rounded-lg bg-white/10 border border-white/10 transition-colors hover:bg-white/20 hover:text-white" onClick={() => setIsMobileMenuOpen(true)}>
                <Menu size={18} />
              </button>
              <Activity className="text-blue-300" size={20} />
              <p className="text-blue-200 font-semibold tracking-widest text-[10px] uppercase">College Statistics</p>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">Overview Dashboard</h1>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 mt-6 md:mt-8 relative z-10 pb-10">
        <div className="max-w-7xl mx-auto">
          
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-widest">Live Statistics</h2>
            <button onClick={loadTelemetryData} disabled={isTelemetryLoading} className="text-xs font-bold text-cyan-600 hover:text-cyan-800 uppercase tracking-widest flex items-center gap-1.5 transition-colors disabled:opacity-50">
              {isTelemetryLoading ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />} Refresh Data
            </button>
          </div>

          {/* NEW BUSINESS METRICS GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 md:gap-6 mb-8">
            
            <div className="bg-white p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 flex flex-col relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><Users size={64}/></div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">Students in DB</p>
              <h3 className="text-3xl font-black text-slate-800 relative z-10 mb-4">{telemetry?.total_students_db ?? '---'}</h3>
              <div className="w-full bg-slate-100 h-1.5 rounded-full mt-auto"><div className="bg-cyan-500 h-1.5 rounded-full w-full"></div></div>
            </div>
            
            <div className="bg-white p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 flex flex-col relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><UserCheck size={64}/></div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">Registered Users</p>
              <h3 className="text-3xl font-black text-slate-800 relative z-10 mb-4">{telemetry?.registered_students ?? '---'}</h3>
              <div className="w-full bg-slate-100 h-1.5 rounded-full mt-auto"><div className="bg-[#0C3669] h-1.5 rounded-full w-full"></div></div>
            </div>
            
            <div className="bg-white p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 flex flex-col relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><FileText size={64}/></div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">Total Applications</p>
              <h3 className="text-3xl font-black text-slate-800 relative z-10 mb-4">{telemetry?.total_applications ?? '---'}</h3>
              <div className="w-full bg-slate-100 h-1.5 rounded-full mt-auto"><div className="bg-amber-500 h-1.5 rounded-full w-full"></div></div>
            </div>
            
            <div className="bg-white p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 flex flex-col relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><CheckCircle size={64}/></div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">Approved Permissions</p>
              <h3 className="text-3xl font-black text-slate-800 relative z-10 mb-4">{telemetry?.approved_applications ?? '---'}</h3>
              <div className="w-full bg-slate-100 h-1.5 rounded-full mt-auto"><div className="bg-emerald-500 h-1.5 rounded-full w-full"></div></div>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 flex flex-col relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><XCircle size={64}/></div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">Rejected Permissions</p>
              <h3 className="text-3xl font-black text-slate-800 relative z-10 mb-4">{telemetry?.rejected_applications ?? '---'}</h3>
              <div className="w-full bg-slate-100 h-1.5 rounded-full mt-auto"><div className="bg-rose-500 h-1.5 rounded-full w-full"></div></div>
            </div>
          </div>

          {/* DEPARTMENT CONFIGURATION */}
          <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden relative">
            <div className="p-6 md:p-8 flex flex-col md:flex-row gap-8 items-start">
              
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2.5 bg-slate-100 text-slate-600 rounded-xl"><Settings size={20}/></div>
                  <h3 className="text-xl font-black text-slate-800">Manage Departments</h3>
                </div>
                <p className="text-sm font-medium text-slate-500 mb-8 leading-relaxed max-w-2xl">
                  Add new departments to the college system. This instantly updates all dropdown filters and choices across the platform.
                </p>

                <form onSubmit={handleAddDepartment} className="bg-slate-50 p-6 rounded-2xl border border-slate-100 max-w-xl">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Register New Department</label>
                  <div className="flex gap-3">
                    <input 
                      required 
                      type="text" 
                      value={newDeptName} 
                      onChange={(e) => setNewDeptName(e.target.value.toUpperCase())} 
                      placeholder="e.g., AI & DATA SCIENCE" 
                      className="flex-1 bg-white border border-slate-200 text-slate-800 font-bold rounded-xl focus:ring-4 focus:ring-cyan-500/20 focus:border-cyan-500 px-4 py-3.5 outline-none transition-all text-sm uppercase" 
                    />
                    <button type="submit" disabled={isAddingDept || !newDeptName} className="px-6 py-3.5 bg-[#0C3669] hover:bg-[#0a2d59] text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg active:scale-95 disabled:opacity-50 whitespace-nowrap flex items-center gap-2">
                      {isAddingDept && <Loader2 size={16} className="animate-spin" />}
                      {isAddingDept ? 'Adding...' : 'Add Department'}
                    </button>
                  </div>
                </form>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );

  // ==========================================
  // MASTER LAYOUT (SIDEBAR & MAIN)
  // ==========================================
  return (
    <>
      <style>{`
        @keyframes scale-in { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .animate-scale-in { animation: scale-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .animate-fade-in-up { animation: fade-in-up 0.3s ease-out forwards; }
        @keyframes fade-in-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      <div className="flex h-screen bg-slate-50 overflow-hidden font-sans text-slate-800">
        
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

        {/* Custom Confirmation Modal */}
        {confirmDialog.show && (
          <div className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl animate-scale-in border border-slate-100 relative">
              <button onClick={() => setConfirmDialog({ show: false, message: '', onConfirm: null })} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors"><X size={20}/></button>
              <div className="flex items-center gap-4 mb-6 text-amber-500">
                <div className="p-3 bg-amber-50 rounded-2xl">
                  <AlertCircle size={32} />
                </div>
                <h2 className="text-xl font-black text-slate-800">Confirmation Required</h2>
              </div>
              <p className="text-slate-600 font-medium mb-8 whitespace-pre-wrap leading-relaxed">{confirmDialog.message}</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmDialog({ show: false, message: '', onConfirm: null })} className="flex-1 py-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-xl font-bold uppercase tracking-widest text-xs transition-colors">Cancel</button>
                <button onClick={confirmDialog.onConfirm} className="flex-1 py-4 bg-[#0C3669] hover:bg-[#0a2d59] text-white rounded-xl font-bold uppercase tracking-widest text-xs shadow-lg shadow-[#0C3669]/30 transition-all active:scale-95">Confirm</button>
              </div>
            </div>
          </div>
        )}

        {/* Sidebar */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300" onClick={() => setIsMobileMenuOpen(false)} />
        )}
        
        <aside className={`fixed md:static inset-y-0 left-0 z-50 w-[280px] bg-[#0C3669] text-slate-200 flex flex-col shrink-0 transition-transform duration-300 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 shadow-2xl md:shadow-none`}>
          <div className="h-24 flex items-center justify-between px-8 border-b border-white/5 mb-6 relative">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 bg-[#F58220] rounded-xl flex items-center justify-center font-black text-white text-xl shadow-lg">A</div>
              <span className="font-black text-xl tracking-tight text-white">Admin Portal</span>
            </div>
            <button className="md:hidden text-slate-400 hover:text-white bg-white/5 p-2 rounded-lg" onClick={() => setIsMobileMenuOpen(false)}>
              <X size={20} />
            </button>
          </div>

          <nav className="flex-1 px-5 space-y-2">
            {[
              { id: 'iam', label: 'User Management', icon: <Users size={20}/> },
              { id: 'applications', label: 'Permission Requests', icon: <Database size={20}/> },
              { id: 'broadcasts', label: 'Announcements', icon: <Radio size={20}/> },
              { id: 'telemetry', label: 'Overview Dashboard', icon: <Activity size={20}/> }
            ].map(item => (
              <button 
                key={item.id} 
                onClick={() => { setCurrentView(item.id); setIsMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all duration-300 ${currentView === item.id ? 'bg-[#F58220] text-white shadow-lg shadow-orange-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
              >
                {item.icon} <span className="tracking-wide text-sm">{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="p-6 border-t border-white/5">
            <button onClick={() => setShowLogoutConfirm(true)} className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl font-bold text-xs text-slate-400 hover:bg-rose-500 hover:text-white transition-all uppercase tracking-widest group">
              <LogOut size={16} className="transition-transform group-hover:-translate-x-1" /> Logout
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col overflow-hidden w-full relative">
          {currentView === 'iam' && renderIAM()}
          {currentView === 'applications' && renderApplications()}
          {currentView === 'broadcasts' && renderBroadcasts()}
          {currentView === 'telemetry' && renderTelemetry()}
        </main>

      </div>

      {/* ===== LOGOUT CONFIRMATION MODAL ===== */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="logout-modal-title">
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
              <h2 id="logout-modal-title" className="text-center text-2xl font-black text-slate-800 mb-2 tracking-tight">
                Sign Out?
              </h2>
              <p className="text-center text-slate-500 text-sm leading-relaxed mb-8">
                You're about to sign out of the <span className="font-bold text-slate-700">Admin Portal</span>. Any unsaved changes will be lost.
              </p>
              {/* Actions */}
              <div className="flex flex-col gap-3">
                <button
                  id="logout-confirm-btn"
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-white bg-rose-500 hover:bg-rose-600 shadow-lg shadow-rose-500/30 transition-all duration-200 active:scale-95 uppercase tracking-widest text-xs"
                >
                  <LogOut size={15} /> Yes, Sign Me Out
                </button>
                <button
                  id="logout-cancel-btn"
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