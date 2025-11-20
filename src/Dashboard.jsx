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

  // 📌 LẤY LOG — KHÔNG FILTER STATUS NỮA → KHÔNG LỖI 406
  const fetchLogs = async () => {
    const { data, error } = await supabase
      .from('alarms')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error("Error fetching alarms:", error);
      return;
    }

    if (data) setLogs(data);
  };

  useEffect(() => {
    fetchLogs();

    // 📌 Realtime cập nhật log
    const channel = supabase
      .channel('realtime-alarms')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'alarms' },
        () => fetchLogs()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // 📌 Gửi báo động
  const handleSendAlarm = async () => {
    if (!confirm(`[CẢNH BÁO] Bạn chắc chắn muốn phát tín hiệu ${selectedCode.code}?`))
      return;
    
    setSending(true);

    const { error } = await supabase.from('alarms').insert({
      sender_id: user.id,
      department_source: profile?.department_name || 'Không xác định',
      code_type: selectedCode.code,
      message: message || selectedCode.label,
      status: 'Đang báo động', // Giá trị khớp DB
    });

    setSending(false);

    if (error) {
      alert("Không thể gửi báo động!");
      console.error(error);
    } else {
      setMessage('');
      alert("Đã gửi tín hiệu báo động!");
    }
  };

  // 📌 Format giờ
  const formatDate = (dt) =>
    new Date(dt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="p-4 max-w-7xl mx-auto">
      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Shield size={24} /> Bảng Điều Khiển Báo Động
        </h2>

        <div className="flex items-center gap-3">
          <span className="text-slate-700 text-sm text-right">
            <strong>{profile?.department_name}</strong><br />
            {profile?.email}
          </span>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-red-500 flex items-center gap-1"
          >
            <LogOut size={18} /> Đăng xuất
          </button>
        </div>
      </div>

      {/* ALARM SELECTOR */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {ALARM_TYPES.map((item) => (
          <div
            key={item.code}
            onClick={() => setSelectedCode(item)}
            className={`cursor-pointer p-4 rounded-xl shadow text-white font-bold ${
              selectedCode.code === item.code ? `${item.color} shadow-lg` : item.color + " opacity-70"
            }`}
          >
            {item.code}
            <div className="text-sm opacity-80">{item.label}</div>
          </div>
        ))}
      </div>

      {/* MESSAGE INPUT */}
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Thông điệp chi tiết (tùy chọn)..."
        className="w-full p-3 border rounded mb-4"
      />

      {/* SEND BUTTON */}
      <button
        onClick={handleSendAlarm}
        disabled={sending}
        className="w-full py-4 bg-red-600 text-white rounded-xl font-bold text-lg shadow-md"
      >
        <Bell className="inline mr-2" /> {sending ? "Đang gửi..." : "KÍCH HOẠT BÁO ĐỘNG"}
      </button>

      {/* LOGS */}
      <div className="mt-10">
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
          <History /> Nhật ký gần đây
        </h3>

        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
          {logs.map((l) => (
            <div
              key={l.id}
              className={`p-4 rounded-xl shadow border ${
                l.status === "Đang báo động"
                  ? "border-red-400 bg-red-50"
                  : "border-slate-300 bg-white"
              }`}
            >
              <div className="flex justify-between">
                <span className="font-bold">{l.code_type}</span>
                <span className="text-sm">{formatDate(l.created_at)}</span>
              </div>
              <div className="text-sm mt-1">
                <strong>{l.department_source}</strong>
              </div>
              <div className="italic text-slate-600 mt-1">"{l.message}"</div>

              <div className="mt-2 text-sm flex items-center gap-1">
                {l.status === "Đang báo động" ? (
                  <>
                    <Activity size={14} className="text-red-500" />
                    <span className="text-red-600">Đang báo động</span>
                  </>
                ) : (
                  <>
                    <CheckCircle size={14} className="text-green-600" />
                    <span className="text-green-600">Đã kết thúc</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
