import { createApp } from './app.factory';
import { AppointmentsService } from './appointments/appointments.service';
import { loadConfig } from './config';
import { PartiesService } from './parties/parties.service';
import { ProposalsService } from './proposals/proposals.service';

/** 1분마다: 만료된 제안 정리, 전날 확인 요청·마감, 약속 시작·끝, 다시 정하기 기한 */
const TICK_MS = 60 * 1000;

async function main() {
  const app = await createApp(loadConfig());
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`서버가 ${port}번 포트에서 실행 중입니다.`);

  const appointments = app.get(AppointmentsService);
  const proposals = app.get(ProposalsService);
  const parties = app.get(PartiesService);
  let running = false;
  setInterval(() => {
    if (running) return;
    running = true;
    Promise.all([proposals.expireDue(), appointments.settle(), parties.settleAll()])
      // 오류 메시지에는 개인정보가 들어가지 않습니다. (이름·종류만 남김)
      .catch((error: Error) => console.error(`시간 작업 실패: ${error.name}`))
      .finally(() => (running = false));
  }, TICK_MS);
}

main().catch((error: Error) => {
  // 설정 오류 같은 시작 실패. 메시지에는 개인정보가 들어가지 않습니다.
  console.error(`서버를 시작하지 못했습니다: ${error.message}`);
  process.exit(1);
});
