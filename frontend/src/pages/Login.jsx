import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2, ArrowRight, AlertCircle, CheckCircle2,
  GraduationCap, Users, Eye, EyeOff, Shield
} from "lucide-react";
import { authAPI } from "../utils/api";
import logoImage from "../assets/adityauniversity_logo.png";

const ROLL_NO_RE  = /^[A-Z0-9]{4,20}$/;
const EMP_ID_RE   = /^[A-Z0-9\-]{3,20}$/;
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_\-#^])[A-Za-z\d@$!%*?&_\-#^]{8,128}$/;

function getStrength(pwd) {
  if (!pwd) return { score: 0, label: "", color: "" };
  let s = 0;
  if (pwd.length >= 8) s++;
  if (/[A-Z]/.test(pwd)) s++;
  if (/[a-z]/.test(pwd)) s++;
  if (/\d/.test(pwd)) s++;
  if (/[@$!%*?&_\-#^]/.test(pwd)) s++;
  const lbl = ["","Very Weak","Weak","Fair","Strong","Very Strong"];
  const col = ["","#ef4444","#f97316","#eab308","#3b82f6","#22c55e"];
  return { score: s, label: lbl[s], color: col[s] };
}

/* ── Shared input styles (light theme) ── */
const inputStyle = (error) => ({
  width:"100%", padding:"11px 14px", background:"#f8fafc",
  border:`1.5px solid ${error ? "#f43f5e" : "#e2e8f0"}`,
  borderRadius:"8px", color:"#1e293b", fontSize:"14px", fontWeight:500,
  outline:"none", boxSizing:"border-box", transition:"border-color 0.2s",
});
const labelStyle = {
  display:"block", fontSize:"11px", fontWeight:700,
  textTransform:"uppercase", letterSpacing:"0.08em",
  color:"#64748b", marginBottom:"6px",
};

function PasswordInput({ label, value, onChange, error, hint, placeholder, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ marginBottom:"14px" }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ position:"relative" }}>
        <input
          type={show ? "text" : "password"}
          value={value} onChange={onChange}
          placeholder={placeholder} maxLength={128}
          autoComplete={autoComplete || "new-password"}
          style={{ ...inputStyle(error), paddingRight:"42px" }}
          onFocus={e => { if (!error) e.target.style.borderColor = "#0c3669"; }}
          onBlur={e  => { if (!error) e.target.style.borderColor = "#e2e8f0"; }}
        />
        <button type="button" onClick={() => setShow(s => !s)}
          style={{ position:"absolute", right:"12px", top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#94a3b8", display:"flex", padding:0 }}>
          {show ? <EyeOff size={16}/> : <Eye size={16}/>}
        </button>
      </div>
      {error && <p style={{ marginTop:"5px", fontSize:"11px", color:"#f43f5e", fontWeight:600 }}>{error}</p>}
      {!error && hint && <p style={{ marginTop:"5px", fontSize:"11px", color:"#94a3b8" }}>{hint}</p>}
    </div>
  );
}

function TextInput({ label, value, onChange, error, hint, placeholder, maxLength, autoComplete }) {
  return (
    <div style={{ marginBottom:"14px" }}>
      <label style={labelStyle}>{label}</label>
      <input
        type="text" value={value} onChange={onChange}
        placeholder={placeholder} maxLength={maxLength || 20}
        autoComplete={autoComplete || "off"}
        style={inputStyle(error)}
        onFocus={e => { if (!error) e.target.style.borderColor = "#0c3669"; }}
        onBlur={e  => { if (!error) e.target.style.borderColor = "#e2e8f0"; }}
      />
      {error && <p style={{ marginTop:"5px", fontSize:"11px", color:"#f43f5e", fontWeight:600 }}>{error}</p>}
      {!error && hint && <p style={{ marginTop:"5px", fontSize:"11px", color:"#94a3b8" }}>{hint}</p>}
    </div>
  );
}

function StrengthBar({ password }) {
  const s = getStrength(password);
  if (!password) return null;
  return (
    <div style={{ marginTop:"-6px", marginBottom:"14px" }}>
      <div style={{ display:"flex", gap:"4px", marginBottom:"4px" }}>
        {[1,2,3,4,5].map(i => (
          <div key={i} style={{ flex:1, height:"3px", borderRadius:"99px", background: i <= s.score ? s.color : "#e2e8f0", transition:"background 0.3s" }}/>
        ))}
      </div>
      <p style={{ fontSize:"11px", color: s.color, fontWeight:600, margin:0 }}>{s.label}</p>
    </div>
  );
}

export default function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode]           = useState("login");
  const [isFaculty, setIsFaculty] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [serverError, setServerError] = useState("");
  const [success, setSuccess]     = useState("");

  const [loginId, setLoginId]   = useState("");
  const [loginPwd, setLoginPwd] = useState("");
  const [loginErr, setLoginErr] = useState({});

  const [sRoll, setSRoll] = useState("");
  const [sPwd, setSPwd]   = useState("");
  const [sCnf, setSCnf]   = useState("");
  const [sErr, setSErr]   = useState({});

  const [fEmp, setFEmp] = useState("");
  const [fPwd, setFPwd] = useState("");
  const [fCnf, setFCnf] = useState("");
  const [fErr, setFErr] = useState({});

  const reset = () => { setServerError(""); setSuccess(""); setLoginErr({}); setSErr({}); setFErr({}); };
  const switchMode = (m) => { reset(); setMode(m); };

  const handleLogin = async (e) => {
    e.preventDefault(); setServerError("");
    const errs = {};
    const uid = loginId.trim().toUpperCase();
    if (!uid) errs.identifier = isFaculty ? "Employee ID is required" : "Roll number is required";
    else if (isFaculty && !EMP_ID_RE.test(uid)) errs.identifier = "Employee ID: 3-20 alphanumeric (hyphens ok)";
    else if (!isFaculty && !ROLL_NO_RE.test(uid)) errs.identifier = "Roll number: 4-20 alphanumeric chars";
    if (!loginPwd.trim()) errs.password = "Password is required";
    if (Object.keys(errs).length) { setLoginErr(errs); return; }
    setLoading(true);
    try {
      const payload = isFaculty ? { emp_id: uid, password: loginPwd } : { roll_no: uid, password: loginPwd };
      const res = isFaculty ? await authAPI.loginFaculty(payload) : await authAPI.loginStudent(payload);
      const token = res.data.access_token || res.data.token;
      const role  = res.data.role;
      if (!token) { setServerError("No access token returned."); return; }
      localStorage.setItem("token", token);
      localStorage.setItem("role", role);
      if (role === "ADMIN")        navigate("/dashboard/admin");
      else if (role === "STUDENT") navigate("/dashboard/student");
      else                          navigate("/dashboard/staff");
    } catch (err) {
      setServerError(err.response?.data?.detail || "Authentication failed. Check your credentials.");
    } finally { setLoading(false); }
  };

  const handleRegStudent = async (e) => {
    e.preventDefault(); setServerError("");
    const errs = {};
    const roll = sRoll.trim().toUpperCase();
    if (!roll) errs.roll_no = "Roll number is required";
    else if (!ROLL_NO_RE.test(roll)) errs.roll_no = "Roll number: 4-20 alphanumeric chars";
    if (!sPwd) errs.password = "Password is required";
    else if (!PASSWORD_RE.test(sPwd)) errs.password = "Need uppercase, lowercase, digit & special char";
    if (!sCnf) errs.confirm_password = "Please confirm your password";
    else if (sPwd !== sCnf) errs.confirm_password = "Passwords do not match";
    if (Object.keys(errs).length) { setSErr(errs); return; }
    setLoading(true);
    try {
      await authAPI.registerStudent({ roll_no: roll, password: sPwd, confirm_password: sCnf });
      setSuccess("Student registered! Redirecting to login...");
      setTimeout(() => { setSuccess(""); switchMode("login"); }, 2000);
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) { const be = {}; detail.forEach(d => { const f = d.loc?.[d.loc.length-1]; if (f) be[f]=d.msg; }); setSErr(be); }
      else setServerError(detail || "Registration failed. Please try again.");
    } finally { setLoading(false); }
  };

  const handleRegFaculty = async (e) => {
    e.preventDefault(); setServerError("");
    const errs = {};
    const emp = fEmp.trim().toUpperCase();
    if (!emp) errs.emp_id = "Employee ID is required";
    else if (!EMP_ID_RE.test(emp)) errs.emp_id = "Employee ID: 3-20 alphanumeric (hyphens ok)";
    if (!fPwd) errs.password = "Password is required";
    else if (!PASSWORD_RE.test(fPwd)) errs.password = "Need uppercase, lowercase, digit & special char";
    if (!fCnf) errs.confirm_password = "Please confirm your password";
    else if (fPwd !== fCnf) errs.confirm_password = "Passwords do not match";
    if (Object.keys(errs).length) { setFErr(errs); return; }
    setLoading(true);
    try {
      const res = await authAPI.registerFaculty({ emp_id: emp, password: fPwd, confirm_password: fCnf });
      setSuccess(res.data.message || "Faculty registered! Redirecting...");
      setTimeout(() => { setSuccess(""); switchMode("login"); }, 2000);
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) { const be = {}; detail.forEach(d => { const f = d.loc?.[d.loc.length-1]; if (f) be[f]=d.msg; }); setFErr(be); }
      else setServerError(detail || "Registration failed. Please try again.");
    } finally { setLoading(false); }
  };

  /* ── Tab button (light) ── */
  const tabBtn = (active) => ({
    flex:1, padding:"10px 8px", fontSize:"12px", fontWeight:700,
    textTransform:"uppercase", letterSpacing:"0.07em", cursor:"pointer",
    background:"none", border:"none",
    color: active ? "#0c3669" : "#94a3b8",
    borderBottom: active ? "2px solid #f58220" : "2px solid #e2e8f0",
    transition:"all 0.2s", display:"flex", alignItems:"center", justifyContent:"center", gap:"5px",
  });

  const submitBtn = {
    width:"100%", padding:"13px", borderRadius:"8px", border:"none", cursor:"pointer",
    background:"linear-gradient(135deg, #0c3669, #1a4f8a)",
    color:"#fff", fontSize:"14px", fontWeight:800, letterSpacing:"0.08em", textTransform:"uppercase",
    display:"flex", alignItems:"center", justifyContent:"center", gap:"8px",
    boxShadow:"0 4px 16px rgba(12,54,105,0.25)", marginTop:"8px", transition:"all 0.2s",
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-100" style={{ fontFamily:"'Inter','Segoe UI',sans-serif" }}>

      {/* ── LEFT PANEL — Navy blue ── */}
      <div className="hidden md:flex w-full md:w-[42%] flex-col justify-center items-center relative overflow-hidden" style={{
        padding:"48px 40px",
        background:"linear-gradient(160deg, #0c3669 0%, #0a2a52 60%, #081e3d 100%)",
      }}>
        {/* Subtle pattern overlay */}
        <div style={{ position:"absolute", inset:0, backgroundImage:"radial-gradient(circle at 20% 80%, rgba(245,130,32,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.05) 0%, transparent 40%)", zIndex:0 }}/>
        <div style={{ position:"relative", zIndex:1, width:"100%", maxWidth:"340px" }}>

          {/* Logo + Name side by side */}
          <div className="animate-slide-up" style={{ display:"flex", alignItems:"center", gap:"22px", marginBottom:"48px" }}>
            <img
              src={logoImage} alt="Aditya University"
              style={{ height:"108px", width:"108px", objectFit:"contain", flexShrink:0,
                filter:"drop-shadow(0 4px 16px rgba(0,0,0,0.35))",
                borderRadius:"50%", background:"#fff", padding:"7px", boxSizing:"border-box" }}
            />
            <div>
              <h1 style={{ fontSize:"46px", fontWeight:900, color:"#f58220", letterSpacing:"0.05em", margin:"0 0 3px", lineHeight:1 }}>ADITYA</h1>
              <p style={{ fontSize:"13px", fontWeight:800, color:"#93c5fd", letterSpacing:"0.5em", margin:"0 0 7px" }}>UNIVERSITY</p>
              <p style={{ fontSize:"12px", color:"rgba(255,255,255,0.5)", margin:0 }}>Permission & Leave Management</p>
            </div>
          </div>

          {/* Feature cards */}
          {[
            { icon:<GraduationCap size={18}/>, title:"Student Portal", desc:"Apply for leave, track status & download approved letters" },
            { icon:<Users size={18}/>, title:"Faculty Dashboard", desc:"Review applications via one-click email approval links" },
            { icon:<Shield size={18}/>, title:"HOD Final Review", desc:"Multi-level approval with JWT-protected magic links" },
          ].map((f,i) => (
            <div key={i} className={`animate-slide-up delay-${(i + 1) * 100}`} style={{ display:"flex", gap:"14px", alignItems:"flex-start", padding:"14px 16px", marginBottom:"10px", background:"rgba(255,255,255,0.06)", borderRadius:"10px", border:"1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ color:"#f58220", flexShrink:0, marginTop:"2px" }}>{f.icon}</div>
              <div>
                <p style={{ margin:0, fontSize:"13px", fontWeight:700, color:"#f1f5f9" }}>{f.title}</p>
                <p style={{ margin:"3px 0 0", fontSize:"11.5px", color:"rgba(255,255,255,0.45)", lineHeight:1.5 }}>{f.desc}</p>
              </div>
            </div>
          ))}

          <p className="animate-slide-up delay-400" style={{ marginTop:"28px", fontSize:"12px", color:"rgba(255,255,255,0.25)", fontStyle:"italic", textAlign:"center" }}>
            "Education is the most powerful weapon which you can use to change the world."
          </p>
        </div>
      </div>

      {/* ── RIGHT PANEL — White ── */}
      <div className="flex-1 w-full flex flex-col justify-center items-center bg-white overflow-y-auto p-6 md:p-10">

        <div className="w-full max-w-[400px]">

          {/* Mobile Logo */}
          <div className="md:hidden flex items-center justify-center gap-4 mb-6 animate-slide-up">
            <img
              src={logoImage} alt="Aditya University"
              style={{ height:"60px", width:"60px", objectFit:"contain", flexShrink:0,
                filter:"drop-shadow(0 4px 12px rgba(0,0,0,0.15))",
                borderRadius:"50%", background:"#fff", padding:"4px", boxSizing:"border-box" }}
            />
            <div>
              <h1 style={{ fontSize:"26px", fontWeight:900, color:"#0c3669", letterSpacing:"0.05em", margin:"0 0 2px", lineHeight:1 }}>ADITYA</h1>
              <p style={{ fontSize:"11px", fontWeight:800, color:"#f58220", letterSpacing:"0.4em", margin:0 }}>UNIVERSITY</p>
            </div>
          </div>

          {/* Alerts */}
          {success && (
            <div style={{ background:"#f0fdf4", border:"1.5px solid #86efac", borderRadius:"10px", padding:"12px 16px", marginBottom:"20px", display:"flex", alignItems:"center", gap:"10px", color:"#16a34a", fontSize:"13px", fontWeight:600 }}>
              <CheckCircle2 size={16} style={{ flexShrink:0 }}/> {success}
            </div>
          )}
          {serverError && (
            <div style={{ background:"#fff1f2", border:"1.5px solid #fca5a5", borderRadius:"10px", padding:"12px 16px", marginBottom:"20px", display:"flex", alignItems:"flex-start", gap:"10px", color:"#dc2626", fontSize:"13px", fontWeight:600 }}>
              <AlertCircle size={16} style={{ flexShrink:0, marginTop:"1px" }}/> {serverError}
            </div>
          )}

          {/* ════ LOGIN ════ */}
          {mode === "login" && (
            <>
              <h2 className="animate-slide-up" style={{ margin:"0 0 4px", fontSize:"26px", fontWeight:800, color:"#0c3669" }}>Welcome Back</h2>
              <p className="animate-slide-up delay-100" style={{ margin:"0 0 24px", fontSize:"13px", color:"#94a3b8" }}>Sign in to your Aditya University portal</p>

              {/* Student / Staff tabs */}
              <div className="animate-slide-up delay-200" style={{ display:"flex", borderBottom:"2px solid #e2e8f0", marginBottom:"20px" }}>
                <button type="button" style={tabBtn(!isFaculty)} onClick={() => { setIsFaculty(false); setLoginErr({}); setLoginId(""); setLoginPwd(""); }}>
                  <GraduationCap size={13}/> Student
                </button>
                <button type="button" style={tabBtn(isFaculty)} onClick={() => { setIsFaculty(true); setLoginErr({}); setLoginId(""); setLoginPwd(""); }}>
                  <Users size={13}/> Staff / Admin
                </button>
              </div>

              <form onSubmit={handleLogin} noValidate className="animate-slide-up delay-300">
                <TextInput
                  label={isFaculty ? "Employee ID" : "Roll Number"}
                  placeholder={isFaculty ? "e.g., EMP1001" : "e.g., 23CS101"}
                  value={loginId}
                  onChange={e => { setLoginId(e.target.value.toUpperCase()); if(loginErr.identifier) setLoginErr(p=>({...p,identifier:""})); }}
                  error={loginErr.identifier}
                  maxLength={20} autoComplete="username"
                />
                <PasswordInput
                  label="Password" placeholder="Enter your password"
                  value={loginPwd}
                  onChange={e => { setLoginPwd(e.target.value); if(loginErr.password) setLoginErr(p=>({...p,password:""})); }}
                  error={loginErr.password} autoComplete="current-password"
                />
                <button type="submit" disabled={loading} style={submitBtn}
                  onMouseEnter={e => { e.currentTarget.style.background = "linear-gradient(135deg,#0a2d5a,#0c3669)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "linear-gradient(135deg,#0c3669,#1a4f8a)"; e.currentTarget.style.transform = "translateY(0)"; }}>
                  {loading ? <Loader2 size={17} className="animate-spin"/> : <><span>Sign In</span><ArrowRight size={17}/></>}
                </button>
              </form>

              <div className="animate-slide-up delay-400" style={{ height:"1px", background:"#f1f5f9", margin:"24px 0" }}/>
              <p className="animate-slide-up delay-500" style={{ textAlign:"center", fontSize:"13px", color:"#94a3b8", margin:0 }}>
                New here?{" "}
                <span style={{ color:"#f58220", fontWeight:700, cursor:"pointer" }} onClick={() => switchMode("register-student")}>Student</span>
                {" "}or{" "}
                <span style={{ color:"#f58220", fontWeight:700, cursor:"pointer" }} onClick={() => switchMode("register-faculty")}>Faculty</span>
                {" "}registration
              </p>
            </>
          )}

          {/* ════ STUDENT REGISTER ════ */}
          {mode === "register-student" && (
            <>
              <h2 className="animate-slide-up" style={{ margin:"0 0 4px", fontSize:"26px", fontWeight:800, color:"#0c3669" }}>Student Registration</h2>
              <p className="animate-slide-up delay-100" style={{ margin:"0 0 24px", fontSize:"13px", color:"#94a3b8" }}>Your roll number must exist in the college database.</p>
              <form onSubmit={handleRegStudent} noValidate className="animate-slide-up delay-200">
                <TextInput label="Roll Number" placeholder="e.g., 23CS101"
                  value={sRoll} onChange={e => { setSRoll(e.target.value.toUpperCase()); if(sErr.roll_no) setSErr(p=>({...p,roll_no:""})); }}
                  error={sErr.roll_no} hint="4-20 alphanumeric characters" maxLength={20} autoComplete="username"/>
                <PasswordInput label="Password" placeholder="Min 8 chars: uppercase, digit, special"
                  value={sPwd} onChange={e => { setSPwd(e.target.value); if(sErr.password) setSErr(p=>({...p,password:""})); }}
                  error={sErr.password} hint="Uppercase, lowercase, digit & special char (@$!%*?&_-#^)"/>
                <StrengthBar password={sPwd}/>
                <PasswordInput label="Confirm Password" placeholder="Re-enter your password"
                  value={sCnf} onChange={e => { setSCnf(e.target.value); if(sErr.confirm_password) setSErr(p=>({...p,confirm_password:""})); }}
                  error={sErr.confirm_password}/>
                <button type="submit" disabled={loading} style={submitBtn}
                  onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}>
                  {loading ? <Loader2 size={17} className="animate-spin"/> : "Create Student Account"}
                </button>
              </form>
              <div className="animate-slide-up delay-300" style={{ height:"1px", background:"#f1f5f9", margin:"24px 0" }}/>
              <p className="animate-slide-up delay-400" style={{ textAlign:"center", fontSize:"13px", color:"#94a3b8", margin:0 }}>
                Already registered?{" "}
                <span style={{ color:"#0c3669", fontWeight:700, cursor:"pointer" }} onClick={() => switchMode("login")}>Sign in here</span>
              </p>
            </>
          )}

          {/* ════ FACULTY REGISTER ════ */}
          {mode === "register-faculty" && (
            <>
              <h2 className="animate-slide-up" style={{ margin:"0 0 4px", fontSize:"26px", fontWeight:800, color:"#0c3669" }}>Faculty Registration</h2>
              <p className="animate-slide-up delay-100" style={{ margin:"0 0 24px", fontSize:"13px", color:"#94a3b8" }}>Your Employee ID must exist in the college records.</p>
              <form onSubmit={handleRegFaculty} noValidate className="animate-slide-up delay-200">
                <TextInput label="Employee ID" placeholder="e.g., EMP1001"
                  value={fEmp} onChange={e => { setFEmp(e.target.value.toUpperCase()); if(fErr.emp_id) setFErr(p=>({...p,emp_id:""})); }}
                  error={fErr.emp_id} hint="3-20 alphanumeric characters (hyphens allowed)" maxLength={20} autoComplete="username"/>
                <PasswordInput label="Password" placeholder="Min 8 chars: uppercase, digit, special"
                  value={fPwd} onChange={e => { setFPwd(e.target.value); if(fErr.password) setFErr(p=>({...p,password:""})); }}
                  error={fErr.password} hint="Uppercase, lowercase, digit & special char (@$!%*?&_-#^)"/>
                <StrengthBar password={fPwd}/>
                <PasswordInput label="Confirm Password" placeholder="Re-enter your password"
                  value={fCnf} onChange={e => { setFCnf(e.target.value); if(fErr.confirm_password) setFErr(p=>({...p,confirm_password:""})); }}
                  error={fErr.confirm_password}/>
                <button type="submit" disabled={loading} style={submitBtn}
                  onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}>
                  {loading ? <Loader2 size={17} className="animate-spin"/> : "Create Faculty Account"}
                </button>
              </form>
              <div className="animate-slide-up delay-300" style={{ height:"1px", background:"#f1f5f9", margin:"24px 0" }}/>
              <p className="animate-slide-up delay-400" style={{ textAlign:"center", fontSize:"13px", color:"#94a3b8", margin:0 }}>
                Already registered?{" "}
                <span style={{ color:"#0c3669", fontWeight:700, cursor:"pointer" }} onClick={() => switchMode("login")}>Sign in here</span>
              </p>
            </>
          )}

          <p style={{ marginTop:"32px", fontSize:"11px", color:"#cbd5e1", textAlign:"center" }}>
            © {new Date().getFullYear()} Aditya University · Permission Management System
          </p>
        </div>
      </div>

    </div>
  );
}
