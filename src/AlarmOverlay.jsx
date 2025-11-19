import { useEffect, useState, useRef } from 'react';
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
    <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center text-white ${bgColor}`}>
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
}