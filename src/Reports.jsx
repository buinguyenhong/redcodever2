import { useState } from 'react';
import { supabase } from './supabaseClient';

export default function Reports() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const exportLogs = async () => {
    if (!from || !to) {
      alert("Vui lòng chọn đủ ngày bắt đầu và ngày kết thúc.");
      return;
    }

    const { data } = await supabase
      .from('alarms')
      .select('*')
      .gte('created_at', new Date(from).toISOString())
      .lte('created_at', new Date(to).toISOString())
      .order('created_at', { ascending: true });

    const rows = data || [];
    const header = ['Thời gian', 'Khoa/Phòng', 'Code', 'Thông điệp', 'Trạng thái'];

    const csvData = [
      header.join(','),
      ...rows.map(r => [
        `"${new Date(r.created_at).toLocaleString()}"`,
        r.department_source,
        r.code_type,
        `"${r.message?.replace(/"/g, '""')}"`,
        r.status,
      ].join(','))
    ].join('\n');
    const csvWithBom = "\uFEFF" + csvData;

    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `redcode_logs_${from}_to_${to}.csv`;
    link.click();
  };

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Xuất báo cáo log</h1>

      <div className="bg-white p-6 rounded-xl shadow border space-y-4">
        <div>
          <label className="font-bold">Từ ngày</label>
          <input
            type="date"
            className="w-full p-3 border rounded-lg"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>

        <div>
          <label className="font-bold">Đến ngày</label>
          <input
            type="date"
            className="w-full p-3 border rounded-lg"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>

        <button
          onClick={exportLogs}
          className="w-full py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700"
        >
          Xuất file CSV
        </button>
      </div>
    </div>
  );
}
