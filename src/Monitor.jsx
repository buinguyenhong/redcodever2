import { useEffect, useState, useMemo } from 'react';
import { supabase } from './supabaseClient';

export default function Monitor() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const fetchStatus = async () => {
      const { data, error } = await supabase
        .from("online_status")
        .select(`
          user_id,
          device_id,
          last_seen,
          profiles (
            email,
            department_name
          )
        `);

      if (error) {
        console.error('Fetch online_status error:', error);
        setRows([]);
        return;
      }

      setRows(data || []);
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const now = Date.now();

  // ✅ Sort: Online lên trước, cùng trạng thái thì last_seen mới hơn lên trước
  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const lastA = new Date(a.last_seen).getTime();
      const lastB = new Date(b.last_seen).getTime();
      const onlineA = now - lastA <= 30000;
      const onlineB = now - lastB <= 30000;

      // 1) Online trước Offline
      if (onlineA !== onlineB) return onlineB - onlineA;

      // 2) Cùng Online/Offline thì last_seen mới hơn lên trước
      return lastB - lastA;
    });
  }, [rows, now]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Giám sát thiết bị</h1>

      <div className="bg-white rounded-xl shadow p-6 border border-slate-200">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b text-left">
              <th className="py-3">Khoa/Phòng</th>
              <th>Email</th>
              <th>Device</th>
              <th>Trạng thái</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const last = new Date(row.last_seen).getTime();
              const isOnline = now - last <= 30000;

              return (
                <tr className="border-b" key={row.device_id}>
                  <td className="py-2">{row.profiles?.department_name}</td>
                  <td>{row.profiles?.email}</td>
                  <td>{row.device_id}</td>
                  <td>
                    <span
                      className={`inline-flex items-center text-sm font-bold ${
                        isOnline ? 'text-green-600' : 'text-slate-400'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full mr-2 ${
                          isOnline ? 'bg-green-500' : 'bg-slate-400'
                        }`}
                      ></span>
                      {isOnline ? 'Online' : 'Offline'}
                    </span>
                  </td>
                  <td>{new Date(row.last_seen).toLocaleTimeString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
