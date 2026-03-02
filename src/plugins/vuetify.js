import 'vuetify/styles';
import { createVuetify } from 'vuetify';
import { aliases, md } from 'vuetify/iconsets/md';

export default createVuetify({
  icons: {
    defaultSet: 'md',
    aliases,
    sets: { md },
  },
  theme: {
    defaultTheme: 'dark',
    themes: {
      dark: {
        colors: {
          background: '#000000',
          surface: '#0A0A0A',
          'surface-variant': '#141414',
          primary: '#e5a00d',
          'on-background': '#E0E0E0',
          'on-surface': '#E0E0E0',
        },
      },
    },
  },
});
