import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import Field from "../../ui/Field";
import Btn from "../../ui/Btn";
import Alert from "../../ui/Alert";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Set by ProtectedRoute when it bounced an unauthenticated visit here (e.g.
  // a Slack "View & Decide" deep link) — send them back to it, not "/".
  const from = (location.state as { from?: { pathname: string; search: string } } | null)?.from;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);

  const emailError = touched && !email ? "Email is required" : touched && !/^\S+@\S+\.\S+$/.test(email) ? "Enter a valid email" : "";
  const passwordError = touched && !password ? "Password is required" : "";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!email || !/^\S+@\S+\.\S+$/.test(email) || !password) return;
    setLoading(true);
    setError("");
    try {
      await login(email, password);
      navigate(from ? `${from.pathname}${from.search || ""}` : "/", { replace: true });
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1120] flex items-center justify-center p-4">
      <div className="w-full max-w-[420px] bg-white dark:bg-[#1E293B] rounded-2xl p-10 pb-8 shadow-lg border border-gray-200 dark:border-gray-700/40">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-primary rounded-[10px] flex items-center justify-center font-extrabold text-lg text-white">
            N
          </div>
          <div>
            <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9] leading-tight">
              Neoteric Properties
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 leading-tight">
              Project Cost Center
            </div>
          </div>
        </div>

        <h4 className="text-lg font-bold text-[#1A1A2E] dark:text-[#F1F5F9] mb-1">Sign in</h4>
        <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-6">
          Enter your credentials to continue
        </p>

        {error && <div className="mb-5"><Alert type="error" message={error} /></div>}

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field
            label="Email" required type="email" autoComplete="email"
            placeholder="you@example.com"
            value={email} error={emailError}
            onChange={e => setEmail(e.target.value)}
          />

          <div className="relative">
            <Field
              label="Password" required type={showPassword ? "text" : "password"} autoComplete="current-password"
              placeholder="••••••••"
              value={password} error={passwordError}
              onChange={e => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              style={{ top: 34 }}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <Btn type="submit" label="Sign in" color="primary" loading={loading} className="w-full mt-1" />
        </form>
      </div>
    </div>
  );
}
