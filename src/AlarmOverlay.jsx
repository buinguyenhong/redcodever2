import { useEffect, useState, useRef } from 'react';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthContext';
import { AlertTriangle, CheckCircle, Volume2, Clock, XCircle } from 'lucide-react';

// 1. CẤU HÌNH ÂM THANH
const SOUND_MAP = {
  'RED CODE 1': 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
  'RED CODE 2': 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
  'BLUE CODE': 'https://assets.mixkit.co/active_storage/sfx/2559/2559-preview.mp3',
  'FIRE ALARM': 'https://assets.mixkit.co/active_storage/sfx/1090/1090-preview.mp3',
};
const DEFAULT_SOUND = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';

// 2. CẤU HÌNH THỜI GIAN: 1 PHÚT = 60 * 1000 ms
const AUTO_STOP_DURATION = 60 * 1000;

export default function AlarmOverlay() {
  const { user, profile } = useAuth();

  const [activeAlarm, setActiveAlarm] = useState(null);
  const [ackList, setAckList] = useState([]);
  const [canPlaySound, setCanPlaySound] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState(0);

  const audioRef = useRef(new Audio());
  const timerRef = useRef(null);

  // Ref để luôn giữ giá trị activeAlarm mới nhất trong callback realtime
  const activeAlarmRef = useRef(null);

  // Đồng bộ ref với state
  useEffect(() => {
    activeAlarmRef.current = activeAlarm;
  }, [activeAlarm]);

  // Lắng nghe realtime ALARMS chỉ 1 lần
  useEffect(() => {
    const channel = supabase
      .channel('alarm-global')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alarms' },
        (payload) => {
          checkAndActivateAlarm(payload.new);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'alarms' },
        (payload) => {
          // Khi status = resolved -> nếu đang hiển thị alarm đó thì tắt
          if (
            payload.new.status === 'resolved' &&
            activeAlarmRef.current?.id === payload.new.id
          ) {
            stopAlarmLocal();
          }
        }
      )
      .subscribe();

    // Kiểm tra báo động hiện có khi mới vào trang
    checkExistingAlarm();

    return () => {
      supabase.removeChannel(channel);
      stopAlarmLocal();
    };
    // ✅ []: chỉ chạy một lần, không phụ thuộc activeAlarm nữa
  }, []);

  const checkExistingAlarm = async () => {
    const { data, error } = await supabase
      .from('alarms')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      // Có thể là "no rows", bỏ qua
      return;
    }

    if (data) {
      checkAndActivateAlarm(data);
    }
  };

  const checkAndActivateAlarm = (alarm) => {
    if (!alarm) return;

    const createdTime = new Date(alarm.created_at).getTime();
    const now = new Date().getTime();
    const elapsed = now - createdTime;

    // Nếu đã quá 1 phút so với lúc tạo -> Không hiển thị nữa
    if (elapsed >= AUTO_STOP_DURATION) {
      return;
    }

    setActiveAlarm(alarm);

    // Phát âm thanh
    const soundUrl = SOUND_MAP[alarm.code_type] || DEFAULT_SOUND;
    audioRef.current.src = soundUrl;
    audioRef.current.loop = true;
    playAlarm();

    // Tính thời gian còn lại để tắt
    const remaining = AUTO_STOP_DURATION - elapsed;

    if (timerRef.current) clearTimeout(timerRef.current);

    // Hẹn giờ: Khi hết 1 phút -> Gọi hàm tắt Database
    timerRef.current = setTimeout(() => {
      handleAutoResolveDB(alarm.id);
    }, remaining);
  };

  // Hiệu ứng đồng hồ đếm ngược
  useEffect(() => {
    if (!activeAlarm) {
      setTimeRemaining(0);
      return;
    }

    const interval = setInterval(() => {
      const createdTime = new Date(activeAlarm.created_at).getTime();
      const now = new Date().getTime();
      const left = Math.max(0, AUTO_STOP_DURATION - (now - createdTime));
      setTimeRemaining(left);

      if (left <= 0) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [activeAlarm]);

  // Logic nhận người xem (ack)
  useEffect(() => {
    if (!activeAlarm || !user) return;

    const fetchAcks = async () => {
      const { data } = await supabase
        .from('acknowledgments')
        .select('*')
        .eq('alarm_id', activeAlarm.id);
      if (data) setAckList(data);
    };
    fetchAcks();

    const ackChannel = supabase
      .channel(`ack-${activeAlarm.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'acknowledgments',
          filter: `alarm_id=eq.${activeAlarm.id}`,
        },
        (payload) => {
          setAckList((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    // Tự động xác nhận "Tôi đã nhận tin"
    const sendAutoAck = async () => {
      if (!profile) return;
      const { data } = await supabase
        .from('acknowledgments')
        .select('id')
        .eq('alarm_id', activeAlarm.id)
        .eq('receiver_id', user.id);

      if (data && data.length === 0) {
        await supabase.from('acknowledgments').insert({
          alarm_id: activeAlarm.id,
          receiver_id: user.id,
          receiver_department: profile.department_name,
        });
      }
    };
    sendAutoAck();

    return () => {
      supabase.removeChannel(ackChannel);
    };
  }, [activeAlarm, user, profile]);

  const playAlarm = () => {
    const playPromise = audioRef.current.play();
    if (playPromise !== undefined) {
      playPromise.catch((error) => {
        console.log('Auto-play bị chặn:', error);
        setCanPlaySound(false);
      });
    }
  };

  // Chỉ tắt ở máy hiện tại (UI)
  const stopAlarmLocal = () => {
    setActiveAlarm(null);
    activeAlarmRef.current = null;
    setAckList([]);
    setCanPlaySound(true);
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  // Tắt trên toàn hệ thống (Ghi vào DB)
  const handleAutoResolveDB = async (alarmId) => {
    if (!alarmId) return;
    console.log(
      'Hết 1 phút hoặc nhấn nút -> Tự động tắt báo động trên toàn hệ thống.',
    );
    stopAlarmLocal(); // Tắt local trước cho đỡ ồn

    // Cập nhật DB: status = 'resolved'
    // Khi DB update, sự kiện realtime 'UPDATE' sẽ bắn về các máy khác để tắt theo
    await supabase
      .from('alarms')
      .update({ status: 'resolved' })
      .eq('id', alarmId);
  };

  // Xử lý khi bấm nút tắt thủ công
  const handleManualStop = async () => {
    if (!activeAlarm) return;
    await handleAutoResolveDB(activeAlarm.id);
  };

  const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const s = totalSeconds % 60;
    return `${s}s`;
  };

  if (!activeAlarm) return null;

  const isRedCode =
    activeAlarm.code_type.includes('RED') ||
    activeAlarm.code_type.includes('FIRE');
  const bgColor = isRedCode
    ? 'bg-red-600 animate-alarm-bg'
    : 'bg-blue-600 animate-pulse';

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center text-white ${bgColor} transition-all duration-500`}
    >
      {/* Lớp nền mờ */}
      <div className="absolute inset-0 bg-black bg-opacity-50"></div>

      <div className="relative w-full h-full flex flex-col items-center justify-center p-4">
        {/* Đồng hồ đếm ngược to đùng */}
        <div className="absolute top-10 right-10 bg-white text-red-600 font-black text-4xl px-6 py-4 rounded-2xl shadow-2xl flex items-center border-4 border-red-600">
          <Clock className="mr-3 w-10 h-10 animate-spin-slow" />
          {formatTime(timeRemaining)}
        </div>

        {!canPlaySound && (
          <button
            onClick={() => {
              audioRef.current.play();
              setCanPlaySound(true);
            }}
            className="absolute top-10 left-10 bg-yellow-400 text-black px-8 py-4 rounded-full font-bold animate-bounce shadow-xl border-4 border-black text-xl z-50"
          >
            <Volume2 className="inline mr-2" /> BẬT LOA NGAY
          </button>
        )}

        {/* Biểu tượng cảnh báo */}
        <div className="mb-4 animate-bounce">
          <AlertTriangle
            size={180}
            className="text-yellow-300 drop-shadow-[0_10px_10px_rgba(0,0,0,0.8)]"
          />
        </div>

        {/* Tên mã báo động - Font cực to */}
        <h1 className="text-[10vw] leading-none font-black uppercase tracking-tighter mb-4 text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-300 drop-shadow-2xl text-center">
          {activeAlarm.code_type}
        </h1>

        {/* Vị trí */}
        <h2 className="text-5xl md:text-7xl font-bold mb-8 text-yellow-300 drop-shadow-md text-center bg-black bg-opacity-40 px-8 py-2 rounded-xl">
          TẠI: {activeAlarm.department_source}
        </h2>

        {/* Nội dung chi tiết */}
        <div className="text-3xl md:text-5xl font-bold text-center mb-10 max-w-5xl leading-relaxed bg-white text-red-700 p-6 rounded-xl shadow-2xl border-4 border-red-800">
          "{activeAlarm.message}"
        </div>

        {/* Footer: Danh sách đã nhận + Nút tắt */}
        <div className="absolute bottom-10 w-full max-w-7xl flex flex-col md:flex-row justify-between items-end px-4">
          {/* List đã nhận */}
          <div className="bg-black bg-opacity-60 p-6 rounded-2xl backdrop-blur-md border border-white/30 max-w-lg w-full mb-4 md:mb-0">
            <h3 className="font-bold text-gray-300 uppercase text-sm mb-3 flex items-center">
              <CheckCircle size={20} className="mr-2 text-green-400" /> Đơn vị
              đã tiếp nhận ({ackList.length}):
            </h3>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {ackList.map((ack) => (
                <span
                  key={ack.id}
                  className="bg-green-600 px-3 py-1 rounded-full text-sm font-bold shadow"
                >
                  {ack.receiver_department}
                </span>
              ))}
            </div>
          </div>

          {/* Nút tắt thủ công */}
          <button
            onClick={handleManualStop}
            className="bg-white text-red-700 px-10 py-6 rounded-2xl font-black text-2xl md:text-3xl shadow-[0_0_30px_rgba(255,255,255,0.6)] hover:bg-gray-100 hover:scale-105 transition-transform flex items-center uppercase border-b-8 border-gray-300"
          >
            <XCircle className="mr-3 w-10 h-10" /> XÁC NHẬN & TẮT (ĐÃ XỬ LÝ)
          </button>
        </div>
      </div>
    </div>
  );
}
