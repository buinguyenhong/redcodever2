const fs = require('fs');
const path = require('path');

// Cấu hình dự án
const projectName = '.';

// Hàm hỗ trợ ghi file an toàn
const writeFile = (filePath, content) => {
  const fullPath = path.join(projectName, filePath);
  const dirname = path.dirname(fullPath);
  
  // Thay thế placeholder thành dấu huyền (`) thật
  const realContent = content.split('__DAU_HUYEN__').join('`');

  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }

  fs.writeFileSync(fullPath, realContent);
  console.log(`[OK] Da tao file: ${filePath}`);
};

console.log("Dang khoi tao du an RedCode...");

// 1. Tạo các file cấu hình
writeFile('.env', `VITE_SUPABASE_URL=https://qyzrknfskbysqepuxqwj.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5enJrbmZza2J5c3FlcHV4cXdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyNDYzOTgsImV4cCI6MjA3ODgyMjM5OH0.YFpp9M9WFjuUbPIEENpm1wAmuyI4rfBRcWdYykc5Qf8`);

writeFile('.gitignore', `node_modules
.env
.DS_Store
dist
dist-ssr
*.local`);

writeFile('package.json', JSON.stringify({
  "name": "redcode-hospital-app",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "eslint . --ext js,jsx --report-unused-disable-directives --max-warnings 0",
    "preview": "vite preview"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.39.3",
    "date-fns": "^3.3.1",
    "lucide-react": "^0.323.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.22.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.56",
    "@types/react-dom": "^18.2.19",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.17",
    "eslint": "^8.56.0",
    "eslint-plugin-react": "^7.33.2",
    "eslint-plugin-react-hooks": "^4.6.0",
    "eslint-plugin-react-refresh": "^0.4.5",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1",
    "vite": "^5.1.4"
  }
}, null, 2));

writeFile('vite.config.js', `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})`);

writeFile('tailwind.config.js', `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      animation: {
        'pulse-fast': 'pulse 0.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}`);

writeFile('postcss.config.js', `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`);

writeFile('index.html', `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>RedCode Hospital Alert</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>`);

// 2. Tạo Source Code (Sử dụng __DAU_HUYEN__ thay cho dấu huyền để tránh lỗi string)

writeFile('src/index.css', `@tailwind base;
@tailwind components;
@tailwind utilities;

@keyframes flash-red {
  0%, 100% { background-color: rgba(220, 38, 38, 0.9); }
  50% { background-color: rgba(153, 27, 27, 0.95); }
}
.animate-alarm-bg {
  animation: flash-red 1s infinite;
}
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-track { background: #f1f1f1; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }`);

writeFile('src/main.jsx', `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { BrowserRouter } from 'react-router-dom'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)`);

writeFile('src/supabaseClient.js', `import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);`);

writeFile('src/AuthContext.jsx', `import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId) => {
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (!error && data) setProfile(data);
    } catch (error) {
      console.error("Lỗi tải profile:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);`);

writeFile('src/Login.jsx', `import { useState } from 'react';
import { supabase } from './supabaseClient';
import { ShieldAlert } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) setError('Đăng nhập thất bại: ' + error.message);
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
}`);

writeFile('src/AlarmOverlay.jsx', `import { useEffect, useState, useRef } from 'react';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthContext';
import { AlertTriangle, CheckCircle, Volume2 } from 'lucide-react';

const ALARM_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'; 

export default function AlarmOverlay() {
  const { user, profile } = useAuth();
  const [activeAlarm, setActiveAlarm] = useState(null);
  const [ackList, setAckList] = useState([]);
  const [canPlaySound, setCanPlaySound] = useState(true);
  const audioRef = useRef(new Audio(ALARM_SOUND_URL));

  useEffect(() => {
    audioRef.current.loop = true;

    const channel = supabase
      .channel('alarm-global')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alarms' }, (payload) => {
        if (payload.new.status === 'active') {
          setActiveAlarm(payload.new);
          playAlarm();
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'alarms' }, (payload) => {
        if (payload.new.status === 'resolved' && activeAlarm?.id === payload.new.id) {
          stopAlarm();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      stopAlarm();
    };
  }, [activeAlarm]);

  useEffect(() => {
    if (!activeAlarm) return;

    const fetchAcks = async () => {
      const { data } = await supabase.from('acknowledgments').select('*').eq('alarm_id', activeAlarm.id);
      if (data) setAckList(data);
    };
    fetchAcks();

    const ackChannel = supabase
      .channel('ack-room')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'acknowledgments', filter: __DAU_HUYEN__alarm_id=eq.\${activeAlarm.id}__DAU_HUYEN__ }, (payload) => {
        setAckList((prev) => [...prev, payload.new]);
      })
      .subscribe();

    const sendAutoAck = async () => {
      if(!profile) return;
      const { data } = await supabase.from('acknowledgments').select('id').eq('alarm_id', activeAlarm.id).eq('receiver_id', user.id);
      if (data && data.length === 0) {
        await supabase.from('acknowledgments').insert({
          alarm_id: activeAlarm.id,
          receiver_id: user.id,
          receiver_department: profile.department_name
        });
      }
    };
    sendAutoAck();

    return () => supabase.removeChannel(ackChannel);
  }, [activeAlarm, user, profile]);

  const playAlarm = () => {
    audioRef.current.currentTime = 0;
    const playPromise = audioRef.current.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => {
            console.log("Trình duyệt chặn tự phát âm thanh:", error);
            setCanPlaySound(false);
        });
    }
  };

  const stopAlarm = () => {
    setActiveAlarm(null);
    setAckList([]);
    setCanPlaySound(true);
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
  };

  const handleResolve = async () => {
    const { error } = await supabase
      .from('alarms')
      .update({ status: 'resolved' })
      .eq('id', activeAlarm.id);
    
    if(!error) stopAlarm();
  };

  if (!activeAlarm) return null;

  const isRedCode = activeAlarm.code_type.includes('Red') || activeAlarm.code_type.includes('RED');
  const bgColor = isRedCode ? 'bg-red-600 animate-alarm-bg' : 'bg-blue-600';

  return (
    <div className={__DAU_HUYEN__fixed inset-0 z-50 flex flex-col items-center justify-center text-white \${bgColor}__DAU_HUYEN__}>
      <div className="p-8 text-center bg-black bg-opacity-60 rounded-xl backdrop-blur-md max-w-5xl w-full mx-4 border-4 border-white shadow-2xl">
        
        {!canPlaySound && (
            <button onClick={() => { audioRef.current.play(); setCanPlaySound(true); }} className="mb-4 flex items-center justify-center bg-yellow-500 text-black px-6 py-3 rounded-full font-bold animate-bounce mx-auto shadow-lg border-2 border-black">
                <Volume2 className="mr-2" /> BẤM VÀO ĐÂY ĐỂ BẬT CÒI HÚ
            </button>
        )}

        <AlertTriangle size={100} className="mx-auto mb-4 animate-bounce text-yellow-300" />
        
        <h1 className="text-6xl md:text-8xl font-black uppercase tracking-widest mb-2 drop-shadow-lg">{activeAlarm.code_type}</h1>
        <h2 className="text-3xl md:text-5xl font-bold mb-6 text-yellow-300 drop-shadow-md">TẠI: {activeAlarm.department_source}</h2>
        <p className="text-2xl md:text-4xl mb-8 bg-white text-black p-6 rounded-lg font-bold border-l-8 border-red-800 shadow-inner">"{activeAlarm.message}"</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left bg-black bg-opacity-40 p-6 rounded-lg mb-8 max-h-60 overflow-y-auto border border-white/20">
            <div>
                <h3 className="font-bold border-b border-gray-400 mb-2 pb-1 text-gray-300 uppercase text-sm tracking-wider">Thông tin gửi:</h3>
                <p className="text-xl font-mono">{new Date(activeAlarm.created_at).toLocaleTimeString()}</p>
            </div>
            <div>
                <h3 className="font-bold border-b border-gray-400 mb-2 pb-1 flex items-center text-gray-300 uppercase text-sm tracking-wider">
                    <CheckCircle size={16} className="mr-2 text-green-400"/> Đã tiếp nhận ({ackList.length}):
                </h3>
                <ul className="text-base space-y-2 font-mono">
                    {ackList.map(ack => (
                        <li key={ack.id} className="flex items-center text-green-300">
                            <span className="w-2 h-2 bg-green-500 rounded-full mr-3 animate-pulse shadow-[0_0_10px_#22c55e]"></span>
                            {ack.receiver_department}
                        </li>
                    ))}
                </ul>
            </div>
        </div>

        <button 
            onClick={handleResolve}
            className="w-full py-5 bg-white text-red-900 font-black text-2xl rounded-lg shadow-xl hover:bg-gray-100 transition transform hover:scale-[1.02] active:scale-95 uppercase border-b-8 border-gray-300"
        >
            Xác nhận xử lý / Tắt báo động
        </button>
      </div>
    </div>
  );
}`);

writeFile('src/Dashboard.jsx', `import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthContext';
import { Bell, LogOut, History, Activity, Shield, CheckCircle } from 'lucide-react';

const ALARM_TYPES = [
  { code: 'RED CODE 1', label: 'Ngừng tuần hoàn hô hấp', color: 'bg-red-600' },
  { code: 'RED CODE 2', label: 'Cấp cứu khẩn cấp', color: 'bg-red-500' },
  { code: 'BLUE CODE', label: 'Cấp cứu nội viện', color: 'bg-blue-600' },
  { code: 'FIRE ALARM', label: 'Báo cháy', color: 'bg-orange-600' },
];

export default function Dashboard() {
  const { profile, user } = useAuth();
  const [selectedCode, setSelectedCode] = useState(ALARM_TYPES[0]);
  const [message, setMessage] = useState('');
  const [logs, setLogs] = useState([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchLogs();
    const channel = supabase
      .channel('dashboard-logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alarms' }, (payload) => {
        setLogs(prev => [payload.new, ...prev]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'alarms' }, (payload) => {
         setLogs(prev => prev.map(log => log.id === payload.new.id ? payload.new : log));
      })
      .subscribe();
      
    return () => supabase.removeChannel(channel);
  }, []);

  const fetchLogs = async () => {
    const { data } = await supabase
      .from('alarms')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setLogs(data);
  };

  const handleSendAlarm = async () => {
    if (!confirm(__DAU_HUYEN__[CẢNH BÁO] Bạn chắc chắn muốn phát tín hiệu \${selectedCode.code}?__DAU_HUYEN__)) return;
    
    setSending(true);
    const { error } = await supabase.from('alarms').insert({
      sender_id: user.id,
      department_source: profile?.department_name || 'Không xác định',
      code_type: selectedCode.code,
      message: message || selectedCode.label,
      status: 'active'
    });

    if (error) alert('Lỗi gửi: ' + error.message);
    else {
        setMessage('');
    }
    setSending(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-30 shadow-sm">
        <div className="flex items-center space-x-3">
            <div className="bg-red-600 p-2 rounded-lg text-white shadow-lg shadow-red-200">
                <Activity size={24} />
            </div>
            <div>
                <h1 className="text-xl font-bold text-slate-800 leading-none">RedCode System</h1>
                <p className="text-xs text-slate-500 font-medium mt-1">Bệnh Viện Đa Khoa</p>
            </div>
        </div>
        <div className="flex items-center space-x-4">
            <div className="text-right hidden md:block">
                <div className="font-bold text-slate-700">{profile?.department_name || 'Đang tải...'}</div>
                <div className="text-xs text-slate-500">{user?.email}</div>
            </div>
            <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition" title="Đăng xuất">
                <LogOut size={20} />
            </button>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 space-y-6">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                    <h2 className="text-xl font-bold mb-6 flex items-center text-slate-800">
                        <Shield className="mr-2 text-red-600"/> Bảng Điều Khiển Báo Động
                    </h2>
                    
                    <div className="grid grid-cols-2 gap-4 mb-8">
                        {ALARM_TYPES.map((type) => (
                            <button
                                key={type.code}
                                onClick={() => setSelectedCode(type)}
                                className={__DAU_HUYEN__relative p-6 rounded-xl text-left transition-all duration-200 overflow-hidden group \${
                                    selectedCode.code === type.code 
                                    ? \`\${type.color} text-white shadow-lg ring-4 ring-offset-2 ring-slate-200 scale-[1.02]\` 
                                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                                }__DAU_HUYEN__}
                            >
                                <div className="font-black text-xl mb-1">{type.code}</div>
                                <div className={__DAU_HUYEN__text-sm font-medium \${selectedCode.code === type.code ? 'text-white/90' : 'text-slate-500'}__DAU_HUYEN__}>{type.label}</div>
                                {selectedCode.code === type.code && <div className="absolute top-2 right-2"><CheckCircle size={20}/></div>}
                            </button>
                        ))}
                    </div>

                    <div className="mb-8">
                        <label className="block text-sm font-bold text-slate-700 mb-2">Thông điệp chi tiết (Tùy chọn)</label>
                        <div className="relative">
                            <input 
                                type="text" 
                                className="w-full bg-slate-50 border border-slate-300 p-4 pl-4 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition text-lg"
                                placeholder={__DAU_HUYEN__Ví dụ: \${selectedCode.label} tại phòng 301...__DAU_HUYEN__}
                                value={message}
                                onChange={e => setMessage(e.target.value)}
                            />
                        </div>
                    </div>

                    <button 
                        onClick={handleSendAlarm}
                        disabled={sending}
                        className="w-full py-5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white text-xl font-black uppercase rounded-xl shadow-lg hover:shadow-red-200 transition-all disabled:opacity-50 flex justify-center items-center gap-3 active:scale-[0.98]"
                    >
                        <Bell className="animate-pulse" /> 
                        {sending ? 'ĐANG GỬI TÍN HIỆU...' : 'KÍCH HOẠT BÁO ĐỘNG'}
                    </button>
                </div>
            </div>

            <div className="lg:col-span-4">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 h-full flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-lg font-bold flex items-center text-slate-800">
                            <History className="mr-2 text-slate-400"/> Nhật ký gần đây
                        </h2>
                        <button onClick={fetchLogs} className="text-xs text-blue-600 hover:underline">Làm mới</button>
                    </div>
                    
                    <div className="space-y-3 flex-1 overflow-y-auto pr-2 max-h-[600px] custom-scrollbar">
                        {logs.map(log => (
                            <div key={log.id} className={__DAU_HUYEN__p-4 rounded-xl border border-slate-100 transition hover:shadow-md \${log.status === 'active' ? 'bg-red-50 border-red-100' : 'bg-white'}__DAU_HUYEN__}>
                                <div className="flex justify-between items-start mb-2">
                                    <span className={__DAU_HUYEN__text-xs font-bold px-2 py-1 rounded \${log.code_type.includes('RED') ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}__DAU_HUYEN__}>
                                        {log.code_type}
                                    </span>
                                    <span className="text-xs text-slate-400">{new Date(log.created_at).toLocaleTimeString()}</span>
                                </div>
                                <div className="font-bold text-slate-800 text-sm mb-1">{log.department_source}</div>
                                <div className="text-slate-600 text-sm italic mb-2">"{log.message}"</div>
                                <div className="flex items-center justify-end">
                                    {log.status === 'active' ? (
                                        <span className="flex items-center text-xs font-bold text-red-600 animate-pulse">
                                            <span className="w-2 h-2 bg-red-600 rounded-full mr-1"></span> Đang báo động
                                        </span>
                                    ) : (
                                        <span className="text-xs font-medium text-slate-400 flex items-center">
                                            <CheckCircle size={12} className="mr-1"/> Đã kết thúc
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                        {logs.length === 0 && <p className="text-slate-400 text-center py-10 text-sm">Chưa có dữ liệu báo động</p>}
                    </div>
                </div>
            </div>
        </div>
      </main>
    </div>
  );
}`);

writeFile('src/App.jsx', `import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import Login from './Login';
import Dashboard from './Dashboard';
import AlarmOverlay from './AlarmOverlay';

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen text-slate-500 font-medium">Đang kết nối máy chủ...</div>;
  return user ? children : <Navigate to="/login" />;
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { user } = useAuth();
  return (
    <>
      {user && <AlarmOverlay />}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />
      </Routes>
    </>
  );
}`);

console.log("\n🎉 THANH CONG! File setup.js da chay xong.");
console.log("👉 Hay chay lenh: npm install && npm run dev");