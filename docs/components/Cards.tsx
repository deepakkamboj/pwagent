import React from 'react';
import Link from 'next/link';

interface CardProps {
  icon?: React.ReactNode;
  title: string;
  href: string;
  children?: React.ReactNode;
}

export function Card({ icon, title, href, children }: CardProps) {
  return (
    <Link href={href} className="pwagent-card" style={{ textDecoration: 'none' }}>
      <div className="pwagent-card-content">
        {icon && <div className="pwagent-card-icon">{icon}</div>}
        <h3 className="pwagent-card-title">{title}</h3>
        {children && <div className="pwagent-card-description">{children}</div>}
      </div>
      <style jsx>{`
        .pwagent-card-content {
          display: block;
          padding: 1.5rem;
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          color: inherit;
          transition: all 0.2s ease;
          background-color: var(--card-bg, #ffffff);
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
          height: 100%;
        }
        :global(.dark) .pwagent-card-content {
          background-color: #18181b;
          border-color: #27272a;
        }
        .pwagent-card-content:hover {
          border-color: #6366f1;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          transform: translateY(-2px);
        }
        .pwagent-card-icon {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          width: 2.25rem;
          height: 2.25rem;
          color: #6366f1;
          margin-bottom: 0.75rem;
        }
        .pwagent-card-icon :global(svg) {
          width: 100%;
          height: 100%;
        }
        .pwagent-card-title {
          font-size: 1.0625rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
          margin-top: 0;
        }
        .pwagent-card-description {
          font-size: 0.875rem;
          color: #6b7280;
          line-height: 1.5;
        }
        :global(.dark) .pwagent-card-description {
          color: #9ca3af;
        }
        .pwagent-card-description :global(p) {
          margin: 0;
        }
      `}</style>
    </Link>
  );
}

interface CardsProps {
  children: React.ReactNode;
  cols?: number;
}

export function Cards({ children, cols = 2 }: CardsProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: '1rem',
        marginTop: '1.5rem',
        marginBottom: '1.5rem',
      }}
    >
      {children}
    </div>
  );
}
