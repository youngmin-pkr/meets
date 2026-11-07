import { createApp } from './app.factory';
import { loadConfig } from './config';

async function main() {
  const app = await createApp(loadConfig());
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`서버가 ${port}번 포트에서 실행 중입니다.`);
}

main().catch((error: Error) => {
  // 설정 오류 같은 시작 실패. 메시지에는 개인정보가 들어가지 않습니다.
  console.error(`서버를 시작하지 못했습니다: ${error.message}`);
  process.exit(1);
});
