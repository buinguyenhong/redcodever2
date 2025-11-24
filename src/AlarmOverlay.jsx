// AlarmOverlay.jsx
import { useEffect, useState, useRef } from 'react';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthContext';
import { AlertTriangle, Volume2, Clock, XCircle } from 'lucide-react';

const SOUND_MAP = {
  'RED CODE 1': 'https://qyzrknfskbysqepuxqwj.supabase.co/storage/v1/object/public/alarm-sounds/red_code_1_ngung_tuan_hoan_ho_hap_3701fc8e-ff1d-4392-8912-1a89197b79d7.mp3',
  'RED CODE 2': 'https://qyzrknfskbysqepuxqwj.supabase.co/storage/v1/object/public/alarm-sounds/red_code_2_cap_cuu_khan_cap_090638a2-3bf8-4b01-9fe2-afd08aa487bb.mp3',
  'BLUE CODE': 'https://qyzrknfskbysqepuxqwj.supabase.co/storage/v1/object/public/alarm-sounds/blue_code_cap_cuu_noi_vien_32b451e1-5bd7-41d7-89c5-751015ab497f.mp3',
  'FIRE ALARM': 'https://qyzrknfskbysqepuxqwj.supabase.co/storage/v1/object/public/alarm-sounds/khan_cap_bao_chay_6c80fd25-44c8-41e5-a0b8-c653172f4c8a.mp3',
};
const DEFAULT_SOUND = SOUND_MAP['RED CODE 1'];

const AUTO_STOP_DURATION = 60 * 1000; // 1 phút

export default function AlarmOverlay() {
  const { user, profile } = useAuth();

  const [activeAlarm, setActiveAlarm] = useState(null);
  const [ackList, setAckList] = useState([]);
  const [canPlaySound, setCanPlaySound] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState(0);

  // 2 audio riêng: option + khoa
  const optionAudioRef = useRef(new Audio());
  const deptAudioRef = useRef(new Audio());

  const timerRef = useRef(null);

  // Để không bị reset khi realtime update
  const activeAlarmRef = useRef(null);

  useEffect(() => {
    activeAlarmRef.current = activeAlarm;
  }, [activeAlarm]);

  //---------------------------------------------------------------------------
  // 1) SUBSCRIBE REALTIME — CHỈ 1 LẦN, KHÔNG BAO GIỜ PHỤ THUỘC activeAlarm
  //---------------------------------------------------------------------------
  useEffect(() => {
    const channel = supabase
      .channel('alarm-global')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alarms' },
        (payload) => {
          // Chỉ set nếu chưa có báo động nào đang hiển thị
          if (!activeAlarmRef.current) {
            activateAlarm(payload.new);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'alarms' },
        (payload) => {
          // Chỉ tắt nếu alarm của tôi được đổi trạng thái
          if (
            payload.new.status === 'resolved' &&
            activeAlarmRef.current?.id === payload.new.id
          ) {
            stopAlarmLocal();
          }
        }
      )
      .subscribe();

    checkExistingAlarm();

    return () => supabase.removeChannel(channel);
  }, []);

  //---------------------------------------------------------------------------
  // 2) KIỂM TRA BÁO ĐỘNG ĐANG ACTIVE TRONG DB KHI VỪA VÀO TRANG
  //---------------------------------------------------------------------------
  const checkExistingAlarm = async () => {
    const { data } = await supabase
      .from('alarms')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (data) activateAlarm(data);
  };

  //---------------------------------------------------------------------------
  // 3) PHÁT 2 ÂM THANH: option (giữ nguyên) -> khoa đăng nhập (từ profiles)
  //---------------------------------------------------------------------------
  const playBothSounds = (alarm) => {
    if (!alarm) return;

    const optionSrc = SOUND_MAP[alarm.code_type] || DEFAULT_SOUND;
    const deptSrc = profile?.department_sound_url; // link mp3 lưu trong public.profiles

    try {
      // reset handlers cũ
      optionAudioRef.current.onended = null;
      deptAudioRef.current.onended = null;

      // 1) phát option
      optionAudioRef.current.src = optionSrc;
      optionAudioRef.current.loop = false;
      optionAudioRef.current.currentTime = 0;

      const p1 = optionAudioRef.current.play();
      if (p1) p1.catch(() => setCanPlaySound(false));

      // 2) option xong thì phát khoa (nếu có)
      optionAudioRef.current.onended = () => {
        if (!deptSrc) {
          // chưa set link khoa => lặp lại option (giống hành vi cũ)
          playBothSounds(alarm);
          return;
        }

        deptAudioRef.current.src = deptSrc;
        deptAudioRef.current.loop = false;
        deptAudioRef.current.currentTime = 0;

        const p2 = deptAudioRef.current.play();
        if (p2) p2.catch(() => setCanPlaySound(false));

        // loop cả chuỗi
        deptAudioRef.current.onended = () => playBothSounds(alarm);
      };
    } catch (e) {
      console.error('playBothSounds error:', e);
      setCanPlaySound(false);
    }
  };

  //---------------------------------------------------------------------------
  // 4) HÀM KÍCH HOẠT ALARM (KHÔNG BAO GIỜ RESET TIMER KHÔNG CẦN THIẾT)
  //---------------------------------------------------------------------------
  const activateAlarm = (alarm) => {
    if (!alarm) return;

    setActiveAlarm(alarm);

    const createdTime = new Date(alarm.created_at).getTime();
    const now = Date.now();
    const elapsed = now - createdTime;

    const remaining = Math.max(0, AUTO_STOP_DURATION - elapsed);

    // Phát âm thanh option + khoa đăng nhập
    if (canPlaySound) {
      playBothSounds(alarm);
    }

    // Tắt timer cũ nếu có
    if (timerRef.current) clearTimeout(timerRef.current);

    // Setup timer tự tắt cho toàn hệ thống
    timerRef.current = setTimeout(() => {
      autoResolveDB(alarm.id);
    }, remaining);

    // Thiết lập countdown
    setTimeRemaining(remaining);
  };

  //---------------------------------------------------------------------------
  // 5) COUNTDOWN
  //---------------------------------------------------------------------------
  useEffect(() => {
    if (!activeAlarm) return;

    const interval = setInterval(() => {
      const createdTime = new Date(activeAlarm.created_at).getTime();
      const now = Date.now();
      const left = Math.max(0, AUTO_STOP_DURATION - (now - createdTime));
      setTimeRemaining(left);
    }, 1000);

    return () => clearInterval(interval);
  }, [activeAlarm]);

  //---------------------------------------------------------------------------
  // 6) LẤY DANH SÁCH ĐƠN VỊ ĐÃ NHẬN
  //---------------------------------------------------------------------------
  useEffect(() => {
    if (!activeAlarm) return;

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

    // Gửi auto ACK
    const sendAck = async () => {
      const { data } = await supabase
        .from('acknowledgments')
        .select('*')
        .eq('alarm_id', activeAlarm.id)
        .eq('receiver_id', user.id);

      if (!data || data.length === 0) {
        await supabase.from('acknowledgments').insert({
          alarm_id: activeAlarm.id,
          receiver_id: user.id,
          receiver_department: profile?.department_name,
        });
      }
    };

    sendAck();

    return () => supabase.removeChannel(ackChannel);
  }, [activeAlarm, user, profile]);

  //---------------------------------------------------------------------------
  // 7) TẮT CHỈ TRÊN MÁY HIỆN TẠI
  //---------------------------------------------------------------------------
  const stopAlarmLocal = () => {
    setActiveAlarm(null);
    activeAlarmRef.current = null;
    setAckList([]);
    setCanPlaySound(true);

    // dừng cả 2 audio
    optionAudioRef.current.pause();
    deptAudioRef.current.pause();
    optionAudioRef.current.currentTime = 0;
    deptAudioRef.current.currentTime = 0;

    if (timerRef.current) clearTimeout(timerRef.current);
  };

  //---------------------------------------------------------------------------
  // 8) TỰ ĐỘNG UPDATE DB SAU 1 PHÚT
  //---------------------------------------------------------------------------
  const autoResolveDB = async (alarmId) => {
    stopAlarmLocal(); // Tắt local

    await supabase
      .from('alarms')
      .update({ status: 'resolved' })
      .eq('id', alarmId);
  };

  //---------------------------------------------------------------------------
  // 9) NÚT XÁC NHẬN — CHỈ TẮT LOCAL
  //---------------------------------------------------------------------------
  const handleManualStop = () => {
    stopAlarmLocal(); // KHÔNG update DB
  };

  //---------------------------------------------------------------------------
  // RENDER
  //---------------------------------------------------------------------------
  if (!activeAlarm) return null;

  const isRed =
    activeAlarm.code_type.includes('RED') ||
    activeAlarm.code_type.includes('FIRE');

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center ${
        isRed ? 'bg-red-600 animate-alarm-bg' : 'bg-blue-600 animate-pulse'
      }`}
    >
      <div className="absolute inset-0 bg-black/50"></div>

      <div className="relative text-white text-center px-10 max-w-4xl">
        {/* Timer */}
        <div className="absolute top-10 right-10 bg-white text-red-600 px-6 py-4 rounded-2xl text-4xl font-black">
          <Clock className="inline-block mr-3" />
          {Math.floor(timeRemaining / 1000)}s
        </div>

        {!canPlaySound && (
          <button
            onClick={() => {
              setCanPlaySound(true);
              playBothSounds(activeAlarm);
            }}
            className="absolute top-10 left-10 bg-yellow-400 text-black px-8 py-4 font-bold rounded-xl animate-bounce"
          >
            <Volume2 className="inline mr-2" /> BẬT LOA
          </button>
        )}

        <AlertTriangle
          size={180}
          className="mx-auto text-yellow-300 animate-bounce"
        />

        <h1 className="text-[10vw] font-black uppercase mt-4">
          {activeAlarm.code_type}
        </h1>

        <h2 className="text-5xl font-bold mt-4 bg-black/40 px-6 py-2 inline-block rounded-xl">
          TẠI: {activeAlarm.department_source}
        </h2>

        {/* (tuỳ chọn) hiển thị khoa đăng nhập, khớp với âm thanh */}
        <h3 className="text-4xl font-bold mt-4 bg-black/30 px-6 py-2 inline-block rounded-xl">
          Khoa nhận: {profile?.department_name || 'Không xác định'}
        </h3>

        <p className="text-4xl font-bold text-red-700 bg-white p-6 rounded-xl max-w-3xl mx-auto mt-6">
          "{activeAlarm.message}"
        </p>

        {/* Footer */}
        <div className="mt-10">
          <button
            onClick={handleManualStop}
            className="bg-white text-red-700 px-12 py-6 text-3xl font-black rounded-xl"
          >
            <XCircle className="inline mr-2" /> XÁC NHẬN & TẮT TẠI MÁY NÀY
          </button>
        </div>
      </div>
    </div>
  );
}
