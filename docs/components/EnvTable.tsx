import React from 'react';

interface EnvRow {
  name: string;
  description: string;
  default?: string;
  required?: boolean;
}

interface EnvTableProps {
  vars: EnvRow[];
}

export function EnvTable({ vars }: EnvTableProps) {
  return (
    <div style={{ overflowX: 'auto', margin: '1.5rem 0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
            <th style={th}>Variable</th>
            <th style={th}>Description</th>
            <th style={th}>Default</th>
            <th style={th}>Required</th>
          </tr>
        </thead>
        <tbody>
          {vars.map((v) => (
            <tr key={v.name} style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={tdCode}>
                <code>{v.name}</code>
              </td>
              <td style={td}>{v.description}</td>
              <td style={td}>{v.default ? <code>{v.default}</code> : '—'}</td>
              <td style={td}>{v.required ? '✓' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.625rem 0.75rem',
  fontWeight: 600,
  fontSize: '0.8125rem',
  color: '#6b7280',
};
const td: React.CSSProperties = { padding: '0.625rem 0.75rem', verticalAlign: 'top' };
const tdCode: React.CSSProperties = { ...td, fontWeight: 600, color: '#6366f1' };
