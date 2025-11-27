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

  const optionAudioRef = useRef(new Audio());
  const deptAudioRef = useRef(new Audio());
  const timerRef = useRef(null);

  const activeAlarmRef = useRef(null);
  const autoResolvedRef = useRef(false);

  useEffect(() => {
    activeAlarmRef.current = activeAlarm;
  }, [activeAlarm]);

  // 1) SUBSCRIBE REALTIME
  useEffect(() => {
    const channel = supabase
      .channel('alarm-global')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alarms' }, (payload) => {
        if (!activeAlarmRef.current || activeAlarmRef.current.id !== payload.new.id) {
          activateAlarm(payload.new);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'alarms' }, (payload) => {
        if (payload.new.status === 'resolved' && activeAlarmRef.current?.id === payload.new.id) {
          stopAlarmLocal();
        }
      })
      .subscribe();

    checkExistingAlarm();
    return () => supabase.removeChannel(channel);
  }, []);

  // 2) KIỂM TRA ALARM ACTIVE
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

  // 3) PHÁT ÂM THANH OPTION + KHOA
  const playBothSounds = (alarm) => {
    if (!alarm) return;
    const optionSrc = SOUND_MAP[alarm.code_type] || DEFAULT_SOUND;
    const deptSrc = profile?.department_sound_url;
    console.log("deptSrc:", deptSrc);

    try {
      optionAudioRef.current.onended = null;
      deptAudioRef.current.onended = null;

      // Phát option
      optionAudioRef.current.src = optionSrc;
      optionAudioRef.current.currentTime = 0;
      optionAudioRef.current.play().catch(() => setCanPlaySound(false));

      optionAudioRef.current.onended = () => {
        if (deptSrc) {
          deptAudioRef.current.src = deptSrc;
          deptAudioRef.current.currentTime = 0;
          deptAudioRef.current.play().catch(() => setCanPlaySound(false));

          deptAudioRef.current.onended = () => {
            // Sau khi khoa xong thì phát lại option
            playBothSounds(alarm);
          };
        } else {
          // Nếu chưa cấu hình khoa → lặp lại option
          playBothSounds(alarm);
        }
      };
    } catch (e) {
      console.error('playBothSounds error:', e);
      setCanPlaySound(false);
    }
  };

  // 4) KÍCH HOẠT ALARM
  const activateAlarm = (alarm) => {
    if (!alarm) return;
    autoResolvedRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);

    setActiveAlarm(alarm);

    const createdTime = new Date(alarm.created_at).getTime();
    const now = Date.now();
    const elapsed = now - createdTime;
    const remaining = Math.max(0, AUTO_STOP_DURATION - elapsed);

    if (canPlaySound) playBothSounds(alarm);

    timerRef.current = setTimeout(() => {
      if (!autoResolvedRef.current) {
        autoResolvedRef.current = true;
        autoResolveDB(alarm.id);
      }
    }, remaining);

    setTimeRemaining(remaining);
  };

  // 5) COUNTDOWN
  useEffect(() => {
    if (!activeAlarm) return;
    const interval = setInterval(() => {
      const createdTime = new Date(activeAlarm.created_at).getTime();
      const now = Date.now();
      const left = Math.max(0, AUTO_STOP_DURATION - (now - createdTime));
      setTimeRemaining(left);
      if (left === 0 && !autoResolvedRef.current) {
        autoResolvedRef.current = true;
        if (timerRef.current) clearTimeout(timerRef.current);
        autoResolveDB(activeAlarm.id);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [activeAlarm]);

  // 6) ACKNOWLEDGMENTS
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

  // 7) STOP LOCAL
  const stopAlarmLocal = () => {
    setActiveAlarm(null);
    activeAlarmRef.current = null;
    setAckList([]);
    setCanPlaySound(true);
    optionAudioRef.current.pause();
    deptAudioRef.current.pause();
    optionAudioRef.current.currentTime = 0;
    deptAudioRef.current.currentTime = 0;
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  // 8) AUTO RESOLVE DB
  const autoResolveDB = async (alarmId) => {
    stopAlarmLocal();
    await supabase.from('alarms').update({ status: 'resolved' }).eq('id', alarmId);
  };

  // 9) MANUAL STOP
  const handleManualStop = () => stopAlarmLocal();

  // RENDER
  if (!activeAlarm) return null;
  const isRed = activeAlarm.code_type.includes('RED') || activeAlarm.code_type.includes('FIRE');

  return (
    <div className={`fixed inset-0 z-[9999] flex items-center justify-center ${isRed ? 'bg-red-600 animate-alarm-bg' : 'bg-blue-600 animate-pulse'}`}>
      <div className="absolute inset-0 bg-black/50"></div>
      <div className="relative text-white text-center px-10 max-w-4xl">
