// app.json 설정에 더해, GitHub Pages처럼 하위 주소(/meets)에 올릴 때의 기준 주소를 정합니다.
// 예: EXPO_BASE_URL=/meets npx expo export --platform web
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...(config.experiments ?? {}),
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
});
