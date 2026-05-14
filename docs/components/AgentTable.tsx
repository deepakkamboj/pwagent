import React from 'react';

interface AgentRow {
  name: string;
  role: string;
  inputs: string;
  outputs: string;
  model?: string;
}

interface AgentTableProps {
  agents: AgentRow[];
}

export function AgentTable({ agents }: AgentTableProps) {
  return (
    <div style={{ overflowX: 'auto', margin: '1.5rem 0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
            <th style={cellHead}>Agent</th>
            <th style={cellHead}>Role</th>
            <th style={cellHead}>Inputs</th>
            <th style={cellHead}>Outputs</th>
            <th style={cellHead}>Model</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => (
            <tr key={a.name} style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={cellName}>
                <code>{a.name}</code>
              </td>
              <td style={cell}>{a.role}</td>
              <td style={cell}>{a.inputs}</td>
              <td style={cell}>{a.outputs}</td>
              <td style={cell}>
                <code style={{ fontSize: '0.75rem' }}>{a.model ?? '—'}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const cellHead: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.625rem 0.75rem',
  fontWeight: 600,
  fontSize: '0.8125rem',
  color: '#6b7280',
};

const cell: React.CSSProperties = {
  padding: '0.625rem 0.75rem',
  verticalAlign: 'top',
};

const cellName: React.CSSProperties = {
  ...cell,
  fontWeight: 600,
  color: '#6366f1',
};
