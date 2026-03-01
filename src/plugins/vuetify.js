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
          primary: '#e5a00d',
        },
      },
    },
  },
});
