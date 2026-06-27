import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';          // Combined auth page (login + register)
import StudentDashboard from './pages/StudentDashboard';
import StaffDashboard from './pages/StaffDashboard';
import AdminDashboard from './pages/AdminDashboard';
import QuickAction from './pages/QuickAction';

// Self-Healing Role-Based Route Guard
const ProtectedRoute = ({ children, allowedRoles }) => {
  const token = localStorage.getItem('token');
  const userRole = localStorage.getItem('role');

  // FIX: Explicitly check for corrupted strings to prevent 401 API loops
  if (
    !token || 
    token === 'undefined' || 
    token === 'null' || 
    !userRole || 
    userRole === 'undefined' || 
    userRole === 'null'
  ) {
    // Purge the contaminated storage records
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    return <Navigate to="/login" replace />;
  }
  
  if (allowedRoles && !allowedRoles.includes(userRole)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-xl shadow-lg border border-red-100 text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-2">403: Access Denied</h2>
          <p className="text-gray-600">Your role ({userRole}) is not authorized to view this page.</p>
        </div>
      </div>
    );
  }
  return children;
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        {/* /register/* redirects to the combined auth page which handles all modes */}
        <Route path="/register/student" element={<Login />} />
        <Route path="/register/faculty" element={<Login />} />

        <Route path="/action" element={<QuickAction />} />

        {/* Protected Dashboard Routes */}
        <Route path="/dashboard/student" element={
          <ProtectedRoute allowedRoles={['STUDENT']}><StudentDashboard /></ProtectedRoute>
        } />
        
        
        {/* We route Faculty, HOD, and Warden to a unified Staff dashboard that adapts to them */}
        <Route path="/dashboard/staff" element={
          <ProtectedRoute allowedRoles={['FACULTY', 'HOD', 'WARDEN']}><StaffDashboard /></ProtectedRoute>
        } />

        {/* Master Admin Route */}
        <Route path="/dashboard/admin" element={
          <ProtectedRoute allowedRoles={['ADMIN']}><AdminDashboard /></ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}