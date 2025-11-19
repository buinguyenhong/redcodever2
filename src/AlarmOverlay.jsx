import { useEffect, useState, useRef } from 'react';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthContext';
import { AlertTriangle, CheckCircle, Volume2, Clock } from 'lucide-react';

// 1. CẤU HÌNH ÂM THANH RIÊNG TẠI ĐÂY
// Bạn có thể thay link mp3 khác tùy thích
const SOUND_MAP = {
  'RED CODE 1': 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3', // Tiếng còi hú gấp
  'RED CODE 2': 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3', // (Tạm dùng chung, thay nếu muốn)
  'BLUE CODE': 'https://assets.mixkit.co/active_storage/sfx/2559/2559-preview.mp3', // Tiếng 'Ping' điện tử dồn dập
  'FIRE ALARM': 'https://assets.mixkit.co/active_storage/sfx/1090/1090-preview.mp3', // Tiếng chuông báo cháy
};

// Fallback nếu không tìm thấy loại (Mặc định)
const DEFAULT_SOUND = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';

// Thời gian tự động tắt (5 phút = 300000 ms)
const AUTO_STOP_DURATION = 5 * 60 * 1000;

export default function AlarmOverlay() {
  const { user, profile } = useAuth();
  const [activeAlarm, setActiveAlarm] = useState(null);
  const [ackList, setAckList] = useState([]);
  const [canPlaySound, setCanPlaySound] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState(0); // Hiển thị đếm ngược
  const audioRef = useRef(new Audio());
  const timerRef = useRef(null); // Để quản lý việc hủy hẹn giờ

  // Xử lý logic nhận tin nhắn Realtime
  useEffect(() => {
    const channel = supabase
      .channel('alarm-global')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alarms' }, (payload) => {
        checkAndActivateAlarm(payload.new);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'alarms' }, (payload) => {
        // Nếu ai đó tắt thủ công (resolved) -> Tắt luôn
        if (payload.new.status === 'resolved' && activeAlarm?.id === payload.new.id) {
          stopAlarm();
        }
      })
      .subscribe();

    // Kiểm tra ngay khi load trang xem có báo động nào đang active không
    checkExistingAlarm();

    return () => {
      supabase.removeChannel(channel);
      stopAlarm();
    };
  }, [activeAlarm]); // Re-run khi activeAlarm đổi để cập nhật logic

  // Hàm kiểm tra báo động cũ khi mới F5 lại trang
  const checkExistingAlarm = async () => {
    const { data } = await supabase
      .from('alarms')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (data) {
      checkAndActivateAlarm(data);
    }
  };

  // Logic kiểm tra thời gian 5 phút
  const checkAndActivateAlarm = (alarm) => {
    const createdTime = new Date(alarm.created_at).getTime();
    const now = new Date().getTime();
    const elapsed = now - createdTime;

    // Nếu báo động đã quá 5 phút -> Bỏ qua (Coil như đã tắt)
    if (elapsed >= AUTO_STOP_DURATION) {
      console.log("Báo động đã quá hạn 5 phút, bỏ qua.");
      return;
    }

    // Nếu còn hạn -> Kích hoạt
    setActiveAlarm(alarm);
    
    // Chọn âm thanh dựa trên loại code
    const soundUrl = SOUND_MAP[alarm.code_type] || DEFAULT_SOUND;
    audioRef.current.src = soundUrl;
    audioRef.current.loop = true;
    playAlarm();

    // Thiết lập tự động tắt sau thời gian còn lại
    const remaining = AUTO_STOP_DURATION - elapsed;
    
    // Clear timer cũ nếu có
    if (timerRef.current) clearTimeout(timerRef.current);
    
    // Set timer mới
    timerRef.current = setTimeout(() => {
      handleAutoResolve(alarm.id);
    }, remaining);
  };

  // Hiệu ứng đếm ngược thời gian trên màn hình (Optional - cho đẹp)
  useEffect(() => {
    if (!activeAlarm) return;
    const interval = setInterval(() => {
        const createdTime = new Date(activeAlarm.created_at).getTime();
        const now = new Date().getTime();
        const left = Math.max(0, AUTO_STOP_DURATION - (now - createdTime));
        setTimeRemaining(left);
        
        if (left <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeAlarm]);

  // Xử lý danh sách xác nhận (Ack) - Giữ nguyên như cũ
  useEffect(() => {
    if (!activeAlarm) return;

    const fetchAcks = async () => {
      const { data } = await supabase.from('acknowledgments').select('*').eq('alarm_id', activeAlarm.id);
      if (data) setAckList(data);
    };
    fetchAcks();

    const ackChannel = supabase
      .channel(`ack-${activeAlarm.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'acknowledgments', filter: `alarm_id=eq.${activeAlarm.id}` }, (payload) => {
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
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  // Hàm xử lý khi hết giờ (Tự động tắt phía Client)
  const handleAutoResolve = (alarmId) => {
    console.log("Đã hết 5 phút, tự động tắt màn hình báo động.");
    stopAlarm();
    // Tùy chọn: Có thể update DB thành resolved nếu muốn, nhưng để an toàn
    // chỉ cần tắt hiển thị ở máy trạm là đủ.
  };

  const handleResolveClick = async () => {
    // Update DB để tắt cho tất cả mọi người
    const { error } = await supabase
      .from('alarms')
      .update({ status: 'resolved' })
      .eq('id', activeAlarm.id);
    
    if(!error) stopAlarm();
  };

  // Format thời gian đếm ngược (mm:ss)
  const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (!activeAlarm) return null;

  const isRedCode = activeAlarm.code_type.includes('Red') || activeAlarm.code_type.includes('RED') || activeAlarm.code_type.includes('Fire') || activeAlarm.code_type.includes('FIRE');
  const bgColor = isRedCode ? 'bg-red-600 animate-alarm-bg' : 'bg-blue-600';

  return (
    <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center text-white ${bgColor}`}>
      <div className="relative p-8 text-center bg-black bg-opacity-70 rounded-xl backdrop-blur-md max-w-5xl w-full mx-4 border-4 border-white shadow-2xl">
        
        {/* Đồng hồ đếm ngược góc phải */}
        <div className="absolute top-4 right-4 flex items-center bg-white text-black px-3 py-1 rounded-full font-mono font-bold">
            <Clock size={16} className="mr-2" />
            Tự động tắt: {formatTime(timeRemaining)}
        </div>

        {!canPlaySound && (
            <button onClick={() => { audioRef.current.play(); setCanPlaySound(true); }} className="mb-4 flex items-center justify-center bg-yellow-500 text-black px-6 py-3 rounded-full font-bold animate-bounce mx-auto shadow-lg border-2 border-black">
                <Volume2 className="mr-2" /> BẤM VÀO ĐÂY ĐỂ BẬT LOA
            </button>
        )}

        <AlertTriangle size={80} className="mx-auto mb-4 animate-bounce text-yellow-300" />
        
        <h1 className="text-5xl md:text-7xl font-black uppercase tracking-widest mb-2 drop-shadow-lg">{activeAlarm.code_type}</h1>
        <h2 className="text-2xl md:text-4xl font-bold mb-6 text-yellow-300 drop-shadow-md">TẠI: {activeAlarm.department_source}</h2>
        <p className="text-xl md:text-3xl mb-8 bg-white text-black p-4 rounded-lg font-bold border-l-8 border-red-800 shadow-inner">"{activeAlarm.message}"</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left bg-black bg-opacity-40 p-4 rounded-lg mb-6 max-h-60 overflow-y-auto border border-white/20">
            <div>
                <h3 className="font-bold border-b border-gray-400 mb-2 pb-1 text-gray-300 uppercase text-xs tracking-wider">Thông tin gửi:</h3>
                <p className="text-lg font-mono">{new Date(activeAlarm.created_at).toLocaleTimeString()}</p>
            </div>
            <div>
                <h3 className="font-bold border-b border-gray-400 mb-2 pb-1 flex items-center text-gray-300 uppercase text-xs tracking-wider">
                    <CheckCircle size={14} className="mr-2 text-green-400"/> Đã tiếp nhận ({ackList.length}):
                </h3>
                <ul className="text-sm space-y-2 font-mono">
                    {ackList.map(ack => (
                        <li key={ack.id} className="flex items-center text-green-300">
                            <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse shadow-[0_0_10px_#22c55e]"></span>
                            {ack.receiver_department}
                        </li>
                    ))}
                </ul>
            </div>
        </div>

        <button 
            onClick={handleResolveClick}
            className="w-full py-4 bg-white text-red-900 font-black text-xl rounded-lg shadow-xl hover:bg-gray-100 transition transform hover:scale-[1.02] active:scale-95 uppercase border-b-8 border-gray-300"
        >
            Xác nhận xử lý / Tắt báo động
        </button>
      </div>
    </div>
  );
}
