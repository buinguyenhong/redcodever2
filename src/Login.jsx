import { useState } from 'react';
import { supabase } from './supabaseClient';
import { ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError('Đăng nhập thất bại: ' + error.message);
      setLoading(false);
      return;
    }

    // 🎯 Redirect ngay sau khi đăng nhập thành công
    navigate('/');
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-100">
      <div className="w-full max-w-md p-8 bg-white rounded-xl shadow-xl border border-slate-200">
        <div className="flex justify-center mb-6 text-red-600">
          <ShieldAlert size={64} />
        </div>
        <h2 className="mb-2 text-2xl font-bold text-center text-slate-800">Hệ Thống RedCode</h2>
        
        {error && <div className="p-3 mb-4 text-sm text-red-700 bg-red-100 rounded border border-red-200">{error}</div>}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700">Email Khoa/Phòng</label>
            <input
              type="email"
              required
              className="w-full p-3 mt-1 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition"
              placeholder="khoa.capcuu@bv.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700">Mật khẩu</label>
            <input
              type="password"
              required
              className="w-full p-3 mt-1 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button
            disabled={loading}
            className="w-full py-3 font-bold text-white transition bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 shadow-lg hover:shadow-red-200"
          >
            {loading ? 'Đang xác thực...' : 'Đăng Nhập Hệ Thống'}
          </button>
        </form>
      </div>
    </div>
  );
}
