import nextra from 'nextra';

const withNextra = nextra({
  theme: 'nextra-theme-docs',
  themeConfig: './theme.config.tsx',
  defaultShowCopyCode: true,
  latex: false,
  search: {
    codeblocks: false,
  },
});

export default withNextra({
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
});
