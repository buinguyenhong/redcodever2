import { useState } from 'react';
import { supabase } from './supabaseClient';
import * as XLSX from 'xlsx';

export default function Reports() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);

  const exportLogsXLSX = async () => {
    if (!from || !to) {
      alert("Vui lòng chọn đủ ngày bắt đầu và ngày kết thúc.");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from('alarms')
      .select('*')
      .gte('created_at', new Date(from).toISOString())
      .lte('created_at', new Date(to).toISOString())
      .order('created_at', { ascending: true });

    setLoading(false);

    if (error) {
      alert('Lỗi xuất log: ' + error.message);
      return;
    }

    const rows = data || [];

    // Chuẩn hoá dữ liệu cho Excel
    const excelRows = rows.map((r, i) => ({
      "STT": i + 1,
      "Thời gian": new Date(r.created_at).toLocaleString('vi-VN'),
      "Khoa/Phòng": r.department_source || '',
      "Code": r.code_type || '',
      "Thông điệp": r.message || '',
      "Trạng thái": r.status || '',
    }));

    // Tạo workbook & worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelRows, { skipHeader: false });

    // Set độ rộng cột (cho đẹp và dễ đọc)
    ws['!cols'] = [
      { wch: 6 },   // STT
      { wch: 22 },  // Thời gian
      { wch: 18 },  // Khoa/Phòng
      { wch: 14 },  // Code
      { wch: 40 },  // Thông điệp
      { wch: 14 },  // Trạng thái
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Logs');

    // Tên file
    const fileName = `redcode_logs_${from}_to_${to}.xlsx`;

    // Xuất file
    XLSX.writeFile(wb, fileName, { compression: true });
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
          onClick={exportLogsXLSX}
          disabled={loading}
          className="w-full py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? "Đang xuất..." : "Xuất file Excel (.xlsx)"}
        </button>
      </div>
    </div>
  );
}
