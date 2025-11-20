import { useState, useEffect } from 'react';
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

  // ===============================
  // 📌 Lấy lịch sử báo động (ĐÃ FIX 406: KHÔNG LỌC status nữa)
  // ===============================
  const fetchLogs = async () => {
    const { data, error } = await supabase
      .from('alarms')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error("Fetch error:", error);
      return;
    }

    setLogs(data || []);
  };

  useEffect(() => {
    fetchLogs();

    const channel = supabase
      .channel('dashboard-logs')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alarms' },
        (payload) => setLogs(prev => [payload.new, ...prev])
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'alarms' },
        (payload) =>
          setLogs(prev => prev.map(l => (l.id === payload.new.id ? payload.new : l)))
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // ===============================
  // 📌 Gửi báo động
  // ===============================
  const handleSendAlarm = async () => {
    if (!confirm(`[CẢNH BÁO] Bạn có chắc muốn kích hoạt ${selectedCode.code}?`)) return;

    setSending(true);

    const { error } = await supabase.from('alarms').insert({
      sender_id: user.id,
      department_source: profile?.department_name || 'Không xác định',
      code_type: selectedCode.code,
      message: message || selectedCode.label,
      status: 'Đang báo động', // <--- KHỚP DATABASE, KHÔNG DÙNG "active"
    });

    setSending(false);

    if (error) {
      alert("Không thể kích hoạt báo động!");
      console.error(error);
    } else {
      setMessage('');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-30 shadow-sm">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => (window.location.href = '#/monitor')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition"
          >
            Giám sát thiết bị
          </button>

          <button
            onClick={() => (window.location.href = '#/reports')}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 transition"
          >
            Xuất báo cáo
          </button>

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
            <div className="font-bold text-slate-700">{profile?.department_name}</div>
            <div className="text-xs text-slate-500">{user?.email}</div>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition"
            title="Đăng xuất"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <main className="p-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT SIDE */}
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-xl font-bold mb-6 flex items-center text-slate-800">
                <Shield className="mr-2 text-red-600" /> Bảng Điều Khiển Báo Động
              </h2>

              {/* ALARM TYPES */}
              <div className="grid grid-cols-2 gap-4 mb-8">
                {ALARM_TYPES.map((type) => (
                  <button
                    key={type.code}
                    onClick={() => setSelectedCode(type)}
                    className={`relative p-6 rounded-xl text-left transition-all duration-200 ${
                      selectedCode.code === type.code
                        ? `${type.color} text-white shadow-lg ring-4 ring-offset-2 ring-slate-200 scale-[1.02]`
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    <div className="font-black text-xl mb-1">{type.code}</div>
                    <div
                      className={`text-sm font-medium ${
                        selectedCode.code === type.code ? 'text-white/90' : 'text-slate-500'
                      }`}
                    >
                      {type.label}
                    </div>
                    {selectedCode.code === type.code && (
                      <div className="absolute top-2 right-2">
                        <CheckCircle size={20} />
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {/* MESSAGE */}
              <div className="mb-8">
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Thông điệp chi tiết (Tùy chọn)
                </label>

                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-300 p-4 rounded-xl focus:ring-2 focus:ring-red-500 outline-none transition text-lg"
                  placeholder={`Ví dụ: ${selectedCode.label} tại phòng 301...`}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>

              {/* SEND BUTTON */}
              <button
                onClick={handleSendAlarm}
                disabled={sending}
                className="w-full py-5 bg-gradient-to-r from-red-600 to-red-700 text-white text-xl font-black uppercase rounded-xl shadow-lg disabled:opacity-50 flex justify-center items-center gap-3"
              >
                <Bell className="animate-pulse" />
                {sending ? 'ĐANG GỬI TÍN HIỆU...' : 'KÍCH HOẠT BÁO ĐỘNG'}
              </button>
            </div>
          </div>

          {/* RIGHT SIDE – LOGS */}
          <div className="lg:col-span-4">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 h-full flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-bold flex items-center text-slate-800">
                  <History className="mr-2 text-slate-400" /> Nhật ký gần đây
                </h2>
                <button onClick={fetchLogs} className="text-xs text-blue-600 hover:underline">
                  Làm mới
                </button>
              </div>

              <div className="space-y-3 overflow-y-auto max-h-[600px] pr-2">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-4 rounded-xl border ${
                      log.status === 'Đang báo động'
                        ? 'bg-red-50 border-red-200'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span
                        className={`text-xs font-bold px-2 py-1 rounded ${
                          log.code_type.includes('RED')
                            ? 'bg-red-100 text-red-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {log.code_type}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(log.created_at).toLocaleTimeString()}
                      </span>
                    </div>

                    <div className="font-bold text-slate-800 text-sm">{log.department_source}</div>
                    <div className="text-slate-600 text-sm italic mb-2">"{log.message}"</div>

                    <div className="flex justify-end">
                      {log.status === 'Đang báo động' ? (
                        <span className="flex items-center text-xs font-bold text-red-600 animate-pulse">
                          <span className="w-2 h-2 bg-red-600 rounded-full mr-1"></span>
                          Đang báo động
                        </span>
                      ) : (
                        <span className="flex items-center text-xs text-slate-500">
                          <CheckCircle size={12} className="mr-1" />
                          Đã kết thúc
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {logs.length === 0 && (
                  <p className="text-slate-400 text-center py-10 text-sm">
                    Chưa có dữ liệu báo động
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
