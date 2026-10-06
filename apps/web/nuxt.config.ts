export default defineNuxtConfig({
  compatibilityDate: '2026-10-06',
  srcDir: 'app',
  ssr: false,
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  typescript: {
    strict: true,
    typeCheck: true,
  },
  runtimeConfig: {
    public: {
      apiBaseUrl: 'http://localhost:3001',
      useMockApi: true,
    },
  },
  app: {
    head: {
      title: 'BagiNota',
      htmlAttrs: { lang: 'id' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        {
          name: 'description',
          content: 'Bagi bon restoran tanpa akun. Foto, periksa, centang siapa bayar apa.',
        },
        { name: 'theme-color', content: '#0b6e4f' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
})
