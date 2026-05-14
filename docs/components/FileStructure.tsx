import React from 'react';

interface FileStructureProps {
  children: React.ReactNode;
}

export function FileStructure({ children }: FileStructureProps) {
  return (
    <pre
      style={{
        background: '#0f172a',
        color: '#e2e8f0',
        padding: '1rem 1.25rem',
        borderRadius: '0.5rem',
        fontSize: '0.8125rem',
        lineHeight: 1.6,
        overflowX: 'auto',
        margin: '1rem 0',
      }}
    >
      <code>{children}</code>
    </pre>
  );
}
