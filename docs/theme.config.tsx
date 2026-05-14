import { DocsThemeConfig } from 'nextra-theme-docs';
import { useRouter } from 'next/router';

const config: DocsThemeConfig = {
  logo: (
    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '1.75rem',
          height: '1.75rem',
          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
          color: '#fff',
          borderRadius: '0.375rem',
          fontWeight: 700,
          fontSize: '0.8125rem',
          letterSpacing: '-0.02em',
        }}
      >
        pw
      </span>
      <span style={{ fontWeight: 700, fontSize: '1.0625rem', letterSpacing: '-0.02em' }}>
        pwagent docs
      </span>
    </span>
  ),
  project: {
    link: 'https://github.com/microsoft/pwagent',
  },
  docsRepositoryBase: 'https://github.com/microsoft/pwagent/tree/main/docs',
  footer: {
    content: (
      <span style={{ fontSize: '0.8125rem' }}>
        {new Date().getFullYear()} © Microsoft — pwagent v0.4 · MIT License ·{' '}
        <a href="http://127.0.0.1:7337" style={{ color: '#6366f1' }}>
          Open portal →
        </a>
      </span>
    ),
  },
  head: () => {
    const { asPath, defaultLocale, locale } = useRouter();
    const url = `https://pwagent.docs.local${defaultLocale === locale ? asPath : `/${locale}${asPath}`}`;
    return (
      <>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta property="og:url" content={url} />
        <meta property="og:title" content="pwagent docs" />
        <meta
          property="og:description"
          content="Multi-agent Playwright testing — Squad design, GitHub Copilot SDK runtime."
        />
        <title>pwagent docs</title>
      </>
    );
  },
  sidebar: {
    defaultMenuCollapseLevel: 1,
    toggleButton: true,
  },
  toc: {
    backToTop: true,
    float: true,
  },
  editLink: {
    content: 'Edit this page on GitHub →',
  },
  feedback: {
    content: 'Question? Open an issue →',
    labels: 'docs',
  },
  navigation: {
    prev: true,
    next: true,
  },
  darkMode: true,
  banner: {
    key: 'pwagent-v04',
    content: (
      <>
        🎉 pwagent v0.4 is feature-complete — bearer auth, loopback enforcement, service installers, audit/config editors all shipped.
      </>
    ),
    dismissible: true,
  },
};

export default config;
