/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    // Tailwind v4 (@tailwindcss/postcss) handles vendor prefixing via Lightning CSS;
    // autoprefixer is redundant and was removed.
    '@tailwindcss/postcss': {},
  },
};

export default config;
