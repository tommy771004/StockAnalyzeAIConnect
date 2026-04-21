import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { AlertTriangle, Download, Save } from 'lucide-react';

const data = [
  { name: '低折扣', profit: 65, revenue: 80 },
  { name: '標準', profit: 45, revenue: 90 },
  { name: '激進折扣', profit: 25, revenue: 70 },
];

export default function Simulator() {
  const [discounts, setDiscounts] = useState({ server: 15, storage: 10, network: 20 });

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">利潤模擬器</h2>
        <div className="flex space-x-4">
          <button className="px-4 py-2 bg-pink-50 text-pink-700 rounded-lg font-medium flex items-center"><Download size={18} className="mr-2" /> 匯出模擬結果</button>
          <button className="px-4 py-2 bg-pink-900 text-white rounded-lg font-medium flex items-center"><Save size={18} className="mr-2" /> 儲存情境</button>
        </div>
      </div>

      {/* Alert */}
      <div className="bg-pink-50 border border-pink-200 p-4 rounded-2xl flex items-start text-pink-900">
        <AlertTriangle className="mr-3 text-pink-600 mt-0.5" />
        <div>
          <p className="font-bold">毛利臨界預警</p>
          <p className="text-sm">當前模擬配置利潤率為 12.4%，低於公司設定的 15% 警示門檻。請重新評估折扣策略。</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-8">
        {/* Discount Sliders */}
        <div className="bg-[var(--card-bg)] p-8 rounded-3xl border border-[var(--border-color)] shadow-sm">
          <h3 className="font-bold mb-6">折扣層級設定</h3>
          <div className="space-y-8">
            {[
              { label: '運算與伺服器', key: 'server', max: 30 },
              { label: '精密儲存', key: 'storage', max: 25 },
              { label: '進階網路設備', key: 'network', max: 40 },
            ].map((item) => (
              <div key={item.key}>
                <div className="flex justify-between mb-2">
                  <label className="text-sm text-gray-600">{item.label}</label>
                  <span className="bg-pink-100 text-pink-700 px-2 py-0.5 rounded text-xs font-bold">{discounts[item.key as keyof typeof discounts]}% OFF</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={item.max}
                  value={discounts[item.key as keyof typeof discounts]}
                  onChange={(e) => setDiscounts({ ...discounts, [item.key]: parseInt(e.target.value) })}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-pink-600"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div className="bg-[var(--card-bg)] p-8 rounded-3xl border border-[var(--border-color)] shadow-sm">
          <h3 className="font-bold mb-6">利潤 vs. 折扣曲線</h3>
          <ResponsiveContainer width="100%" height={300} minWidth={1} minHeight={1}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} />
              <YAxis axisLine={false} tickLine={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="profit" name="利潤額" fill="#db2777" radius={[10, 10, 0, 0]} />
              <Bar dataKey="revenue" name="營收額" fill="#f472b6" radius={[10, 10, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Summary Cards */}
        <div className="space-y-6">
          <div className="bg-[var(--card-bg)] p-6 rounded-3xl border border-[var(--border-color)] shadow-sm">
            <p className="text-gray-500 text-sm">總營收額</p>
            <h4 className="text-3xl font-bold">NT$ 2.48M</h4>
          </div>
          <div className="bg-[var(--card-bg)] p-6 rounded-3xl border border-[var(--border-color)] shadow-sm">
            <p className="text-gray-500 text-sm">預估淨利潤</p>
            <h4 className="text-3xl font-bold">NT$ 308K</h4>
          </div>
          <div className="bg-pink-950 text-white p-6 rounded-3xl shadow-sm">
            <p className="text-pink-200 text-sm">總利潤率</p>
            <h4 className="text-3xl font-bold mb-2">12.4%</h4>
            <div className="w-full bg-pink-800 h-2 rounded-full">
              <div className="bg-pink-500 h-2 rounded-full" style={{ width: '12.4%' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
