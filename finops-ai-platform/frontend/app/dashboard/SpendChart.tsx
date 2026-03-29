'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface Props {
  data: Array<{ date: string; cost: number }>
}

export default function SpendChart({ data }: Props) {
  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: '#334155' }}
          />
          <YAxis
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `$${v.toFixed(4)}`}
            width={72}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 8,
              color: '#f1f5f9',
              fontSize: 13,
            }}
            formatter={(value) => [`$${Number(value).toFixed(6)}`, 'Cost']}
          />
          <Line
            type="monotone"
            dataKey="cost"
            stroke="#6366f1"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#6366f1' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
