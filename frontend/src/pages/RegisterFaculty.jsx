import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { authAPI } from '../utils/api';

const EMP_ID_RE  = /^[A-Z0-9\-]{3,20}$/;
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_\-#^])[A-Za-z\d@$!%*?&_\-#^]{8,128}$/;

function getPasswordStrength(pwd) {
  if (!pwd) return { score: 0, label: '', color: '' };
  let score = 0;
  if (pwd.length >= 8)  score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[a-z]/.test(pwd)) score++;
  if (/\d/.test(pwd))    score++;
  if (/[@$!%*?&_\-#^]/.test(pwd)) score++;
  const labels = ['', 'Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
  const colors = ['', 'bg-rose-500', 'bg-orange-400', 'bg-yellow-400', 'bg-blue-500', 'bg-green-500'];
  return { score, label: labels[score], color: colors[score] };
}

function validateForm(data) {
  const errors = {};
  const empId = data.emp_id.trim().toUpperCase();

  if (!empId) {
    errors.emp_id = 'Employee ID is required';
  } else if (!EMP_ID_RE.test(empId)) {
    errors.emp_id = 'Employee ID must be 3–20 alphanumeric characters (hyphens allowed, no spaces)';
  }

  if (!data.password) {
    errors.password = 'Password is required';
  } else if (!PASSWORD_RE.test(data.password)) {
    errors.password =
      'Password must be 8–128 characters and include uppercase, lowercase, a digit, and a special character (@$!%*?&_-#^)';
  }

  if (!data.confirm_password) {
    errors.confirm_password = 'Please confirm your password';
  } else if (data.password !== data.confirm_password) {
    errors.confirm_password = 'Passwords do not match';
  }

  return errors;
}

export default function RegisterFaculty() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ emp_id: '', password: '', confirm_password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const strength = getPasswordStrength(formData.password);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors(prev => ({ ...prev, [field]: '' }));
    }
    setServerError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');

    const errors = validateForm(formData);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    try {
      const res = await authAPI.registerFaculty({
        emp_id: formData.emp_id.trim().toUpperCase(),
        password: formData.password,
        confirm_password: formData.confirm_password,
      });
      setSuccess(res.data.message || 'Faculty registration successful!');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) {
        const backendErrors = {};
        detail.forEach((d) => {
          const field = d.loc?.[d.loc.length - 1];
          if (field) backendErrors[field] = d.msg;
        });
        setFieldErrors(backendErrors);
      } else {
        setServerError(detail || 'Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const inputClass = (field) =>
    `w-full p-3 border-2 rounded-lg outline-none transition-colors text-sm ${
      fieldErrors[field]
        ? 'border-rose-400 focus:border-rose-500'
        : 'border-slate-200 focus:border-slate-800'
    }`;

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-slate-100 text-center">
          <CheckCircle2 size={48} className="text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">Registration Successful!</h2>
          <p className="text-slate-500 text-sm">{typeof success === 'string' ? success : 'Redirecting to login…'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-slate-100"
      >
        <h2 className="text-2xl font-extrabold text-slate-800 mb-2 text-center">Faculty / Staff Registration</h2>
        <p className="text-center text-slate-500 text-xs mb-6">
          Your Employee ID must already exist in the college records.
        </p>

        {serverError && (
          <div className="bg-rose-50 text-rose-600 p-3 rounded-lg text-sm mb-5 border border-rose-100 flex items-start gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            {serverError}
          </div>
        )}

        {/* Employee ID */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-slate-600 mb-1">
            Employee ID <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            placeholder="e.g., EMP1001"
            maxLength={20}
            className={inputClass('emp_id') + ' uppercase'}
            value={formData.emp_id}
            onChange={(e) => handleChange('emp_id', e.target.value.toUpperCase())}
            autoComplete="username"
          />
          {fieldErrors.emp_id ? (
            <p className="mt-1 text-xs text-rose-500 font-medium">{fieldErrors.emp_id}</p>
          ) : (
            <p className="mt-1 text-xs text-slate-400">3–20 alphanumeric characters (e.g., EMP1001)</p>
          )}
        </div>

        {/* Password */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-slate-600 mb-1">
            Password <span className="text-rose-500">*</span>
          </label>
          <input
            type="password"
            placeholder="Min 8 chars, uppercase, digit, special char"
            maxLength={128}
            className={inputClass('password')}
            value={formData.password}
            onChange={(e) => handleChange('password', e.target.value)}
            autoComplete="new-password"
          />
          {/* Strength bar */}
          {formData.password && (
            <div className="mt-2">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      i <= strength.score ? strength.color : 'bg-slate-200'
                    }`}
                  />
                ))}
              </div>
              <p className={`text-xs mt-1 font-medium ${strength.score >= 4 ? 'text-green-600' : 'text-slate-400'}`}>
                {strength.label}
              </p>
            </div>
          )}
          {fieldErrors.password ? (
            <p className="mt-1 text-xs text-rose-500 font-medium">{fieldErrors.password}</p>
          ) : (
            <p className="mt-1 text-xs text-slate-400">
              Must include uppercase, lowercase, number, and special character (@$!%*?&_-#^)
            </p>
          )}
        </div>

        {/* Confirm Password */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-slate-600 mb-1">
            Confirm Password <span className="text-rose-500">*</span>
          </label>
          <input
            type="password"
            placeholder="Re-enter your password"
            maxLength={128}
            className={inputClass('confirm_password')}
            value={formData.confirm_password}
            onChange={(e) => handleChange('confirm_password', e.target.value)}
            autoComplete="new-password"
          />
          {fieldErrors.confirm_password && (
            <p className="mt-1 text-xs text-rose-500 font-medium">{fieldErrors.confirm_password}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-slate-800 text-white font-bold py-3 rounded-lg hover:bg-slate-900 transition shadow-md disabled:opacity-70 flex items-center justify-center gap-2"
        >
          {loading && <Loader2 size={16} className="animate-spin" />}
          {loading ? 'Registering…' : 'Register Faculty'}
        </button>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already registered?{' '}
          <Link to="/login" className="text-blue-600 font-semibold hover:underline">
            Back to Login
          </Link>
        </p>
      </form>
    </div>
  );
}
