// AlarmOverlay.jsx
import { useEffect, useState, useRef } from 'react';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthContext';
import { AlertTriangle, Volume2, Clock, XCircle } from 'lucide-react';

const SOUND_MAP = {
  'RED CODE 1':
    'https://qyzrknfskbysqepuxqwj.supabase.co/storage/v1/object/public/alarm-sounds/red_code_1_ngung_tuan_hoan_ho_hap_3701fc8e-ff1d-4392-8912-1a89197b79d7.mp3',
  'RED CODE 2':
    'https://qyzrknfskbysqepuxqwj.supabase.co/storage/v1/object/public/alarm-sounds/red_code_2_cap_cuu_khan_cap_090638a2-3bf8-4b01-9fe2-afd08aa487bb.mp3',
  'BLUE CODE':
    'https://qyzrknfskbysqepuxqwj.supabase.co/storage/v1/object/public/alarm-sounds/blue_code_cap_cuu_noi_vien_32b451e1-5bd7-41d7-89c5-751015ab497f.mp3',
  'FIRE ALARM':
    'https://qyzrknfskbysqepuxqwj.supabase.co/storage/v1/object/public/alarm-sounds/khan_cap_bao_chay_6c80fd25-44c8-41e5-a0b8-c653172f4c8a.mp3',
};

const DEFAULT_SOUND = SOUND_MAP['RED CODE 1'];
const AUTO_STOP_DURATION = 60 * 1000; // 1 phút

export default function AlarmOverlay() {
  const { user, profile } = useAuth();

  const [activeAlarm, setActiveAlarm] = useState(null);
  const [ackList, setAckList] = useState([]);
  const [canPlaySound, setCanPlaySound] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState(0);

  // NEW: chỉ tắt/ẩn tại máy local, không ảnh hưởng timer global
  const [localDismissed, setLocalDismissed] = useState(false);

  // 2 audio riêng: option + khoa
  const optionAudioRef = useRef(new Audio());
  const deptAudioRef = useRef(new Audio());

  const timerRef = useRef(null);
  const activeAlarmRef = useRef(null);
  const autoResolvedRef = useRef(false);

  // luôn có profile mới nhất để tránh stale closure
  const profileRef = useRef(profile);

  useEffect(() => {
    activeAlarmRef.current = activeAlarm;
  }, [activeAlarm]);

  useEffect(() => {
    profileRef.current = profile;

    // Nếu đang có alarm mà profile vừa load sound_url => phát lại chuỗi để có âm khoa
    if (
      activeAlarmRef.current &&
      canPlaySound &&
      profile?.department_sound_url &&
      !localDismissed
    ) {
      playBothSounds(activeAlarmRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.department_sound_url]);

  // ---------------------------------------------------------------------------
  // 1) SUBSCRIBE REALTIME — CHỈ 1 LẦN
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const channel = supabase
      .channel('alarm-global')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alarms' },
        (payload) => {
          // chỉ activate nếu chưa có alarm hoặc id khác
          if (
            !activeAlarmRef.current ||
            activeAlarmRef.current.id !== payload.new.id
          ) {
            activateAlarm(payload.new);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'alarms' },
        (payload) => {
          if (
            payload.new.status === 'resolved' &&
            activeAlarmRef.current?.id === payload.new.id
          ) {
            stopAlarmLocal(); // resolved là global -> tắt hẳn
          }
        }
      )
      .subscribe();

    checkExistingAlarm();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // 2) KIỂM TRA ALARM ACTIVE KHI VỪA VÀO TRANG
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // 3) PHÁT ÂM THANH OPTION + KHOA (dept url từ profiles)
  // ---------------------------------------------------------------------------
  const playBothSounds = (alarm) => {
    if (!alarm) return;

    const optionSrc = SOUND_MAP[alarm.code_type] || DEFAULT_SOUND;

    try {
      optionAudioRef.current.onended = null;
      deptAudioRef.current.onended = null;

      // 1) phát option
      optionAudioRef.current.src = optionSrc;
      optionAudioRef.current.loop = false;
      optionAudioRef.current.currentTime = 0;

      const p1 = optionAudioRef.current.play();
      if (p1) p1.catch(() => setCanPlaySound(false));

      // 2) option xong -> phát khoa
      optionAudioRef.current.onended = () => {
        const deptSrcLatest = profileRef.current?.department_sound_url;

        if (deptSrcLatest) {
          deptAudioRef.current.src = deptSrcLatest;
          deptAudioRef.current.loop = false;
          deptAudioRef.current.currentTime = 0;

          const p2 = deptAudioRef.current.play();
          if (p2) p2.catch(() => setCanPlaySound(false));

          // loop cả chuỗi option -> khoa -> option...
          deptAudioRef.current.onended = () => playBothSounds(alarm);
        } else {
          // chưa có link khoa -> lặp lại option như cũ
          playBothSounds(alarm);
        }
      };
    } catch (e) {
      console.error('playBothSounds error:', e);
      setCanPlaySound(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 4) KÍCH HOẠT ALARM
  // ---------------------------------------------------------------------------
  const activateAlarm = (alarm) => {
    if (!alarm) return;

    // alarm mới -> show lại overlay local
    setLocalDismissed(false);

    autoResolvedRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);

    setActiveAlarm(alarm);

    const createdTime = new Date(alarm.created_at).getTime();
    const now = Date.now();
    const elapsed = now - createdTime;
    const remaining = Math.max(0, AUTO_STOP_DURATION - elapsed);

    if (canPlaySound) playBothSounds(alarm);

    // fallback timeout (global)
    timerRef.current = setTimeout(() => {
      if (!autoResolvedRef.current) {
        autoResolvedRef.current = true;
        autoResolveDB(alarm.id);
      }
    }, remaining);

    setTimeRemaining(remaining);
  };

  // ---------------------------------------------------------------------------
  // 5) COUNTDOWN + AUTO RESOLVE THEO THỜI GIAN THỰC
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!activeAlarm) return;

    const interval = setInterval(() => {
      const createdTime = new Date(activeAlarm.created_at).getTime();
      const now = Date.now();
      const left = Math.max(0, AUTO_STOP_DURATION - (now - createdTime));
      setTimeRemaining(left);

      // đảm bảo resolve dù browser delay timeout
      if (left === 0 && !autoResolvedRef.current) {
        autoResolvedRef.current = true;
        if (timerRef.current) clearTimeout(timerRef.current);
        autoResolveDB(activeAlarm.id);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeAlarm]);

  // ---------------------------------------------------------------------------
  // 6) ACKNOWLEDGMENTS
  // ---------------------------------------------------------------------------
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

    // auto ACK cho user hiện tại
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

  // ---------------------------------------------------------------------------
  // 7A) TẮT LOCAL CHỈ Ở MÁY HIỆN TẠI (KHÔNG HUỶ TIMER)
  // ---------------------------------------------------------------------------
  const dismissAlarmLocalOnly = () => {
    setLocalDismissed(true);

    optionAudioRef.current.pause();
    deptAudioRef.current.pause();
    optionAudioRef.current.currentTime = 0;
    deptAudioRef.current.currentTime = 0;

    // KHÔNG clear timerRef
    // KHÔNG setActiveAlarm(null)
  };

  // ---------------------------------------------------------------------------
  // 7B) STOP LOCAL THẬT SỰ (DÙNG KHI RESOLVED GLOBAL)
  // ---------------------------------------------------------------------------
  const stopAlarmLocal = () => {
    setActiveAlarm(null);
    activeAlarmRef.current = null;
    setAckList([]);
    setCanPlaySound(true);
    setLocalDismissed(false);

    optionAudioRef.current.pause();
    deptAudioRef.current.pause();
    optionAudioRef.current.currentTime = 0;
    deptAudioRef.current.currentTime = 0;

    if (timerRef.current) clearTimeout(timerRef.current);
  };

  // ---------------------------------------------------------------------------
  // 8) AUTO RESOLVE DB (GLOBAL)
  // ---------------------------------------------------------------------------
  const autoResolveDB = async (alarmId) => {
    stopAlarmLocal();

    await supabase
      .from('alarms')
      .update({ status: 'resolved' })
      .eq('id', alarmId);
  };

  // ---------------------------------------------------------------------------
  // 9) MANUAL STOP (chỉ tắt ở máy này)
  // ---------------------------------------------------------------------------
  const handleManualStop = () => dismissAlarmLocalOnly();

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------
  if (!activeAlarm || localDismissed) return null;

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

        {/* Bật loa nếu browser chặn autoplay */}
        {!canPlaySound && (
          <button
            onClick={() => {
              setCanPlaySound(true);
              if (activeAlarm) playBothSounds(activeAlarm);
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

        {/* Khoa đăng nhập (nhận code) */}
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
