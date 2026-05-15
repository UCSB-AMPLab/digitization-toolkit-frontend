import { fontFamily } from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      // ── Font ────────────────────────────────────────────────────────────────
      fontFamily: {
        sans: ['Mulish', ...fontFamily.sans],
      },
      fontWeight: {
        extralight: '200',
        light:      '300',
        regular:    '400',
        medium:     '500',
        semibold:   '600',
        bold:       '700',
        extrabold:  '800',
        black:      '900',
      },

      // ── Colors ──────────────────────────────────────────────────────────────
      colors: {
        // Default
        bg:           '#131110',
        surface:      '#242C23',
        'surface-alt':'#1C211C',
        light:        '#EDE8DC',
        'light-grey': '#ABB7B7',

        // Primary
        primary: {
          DEFAULT: '#5A8C62',
          hover:   '#4e7a56',
          focus:   '#6a9e72',
        },
        secondary: {
          DEFAULT: '#96B1F0',
          hover:   '#7e9de8',
        },
        highlight: {
          DEFAULT: '#E1B778',
          hover:   '#d4a45e',
        },

        // Status
        success: '#6FBF73',
        error:   '#D6674A',
        warning: '#D09A44',
      },

      // ── Font sizes ───────────────────────────────────────────────────────────
      fontSize: {
        'xxs':  ['9px',  { lineHeight: '1.3' }],
        'xs':   ['12px', { lineHeight: '1.4' }],
        'sm':   ['14px', { lineHeight: '1.4' }],
        'base': ['16px', { lineHeight: '1.5' }],
        'lead': ['21px', { lineHeight: '1.5' }],
        'h4':   ['20px', { lineHeight: '1.2', fontWeight: '600' }],
        'h3':   ['24px', { lineHeight: '1.2', fontWeight: '700' }],
        'h2':   ['28px', { lineHeight: '1.2', fontWeight: '700' }],
        'h1':   ['40px', { lineHeight: '1.1', fontWeight: '900' }],
      },

      // ── Border radius ────────────────────────────────────────────────────────
      borderRadius: {
        'sm': '4px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
      },

      // ── Box shadows ──────────────────────────────────────────────────────────
      boxShadow: {
        'sm': '0 1px 3px rgba(0,0,0,0.4)',
        'md': '0 4px 12px rgba(0,0,0,0.5)',
        'lg': '0 8px 24px rgba(0,0,0,0.6)',
      },

      // ── Min sizes (touch targets) ────────────────────────────────────────────
      minHeight: {
        'touch':    '44px',
        'touch-lg': '52px',
      },
      minWidth: {
        'touch':    '44px',
        'touch-lg': '52px',
      },

      // ── Border colors ────────────────────────────────────────────────────────
      borderColor: {
        DEFAULT:  'rgba(171, 183, 183, 0.15)',
        focus:    '#5A8C62',
        error:    '#D6674A',
      },
    },
  },
  plugins: [],
};
