import { Inject, Injectable } from '@nestjs/common';
import {
  formatSeoulShort,
  REPORT_CATEGORY_LABELS,
  REPORT_PRIORITY_ORDER,
  REPORT_RESOLVE_ACTIONS,
  type AdminReportChat,
  type AdminReportDetail,
  type AdminReportQueueItem,
  type ReportCategoryAll,
  type ReportOutcome,
  type ReportPriority,
  type ReportResolveAction,
  type ReportStatus,
} from '@meets/shared';
import { AccountStateService } from '../account-state/account-state.service';
import { APPROVAL } from '../admin/approval-status';
import { AuditService } from '../admin/audit.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { AppError } from '../common/app-error';
import { CLOCK, type Clock } from '../common/clock';
import { NotificationsService } from '../notifications/notifications.service';
import { PolicyService } from '../policy/policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProposalStateService } from '../proposals/proposal-state.service';
import { TrustService } from '../trust/trust.service';
import { ReportStateService } from './report-state.service';

const OPEN: ReportStatus[] = ['QUEUED', 'IN_REVIEW', 'SUSPENSION_PROPOSED'];
const DAY_MS = 24 * 60 * 60 * 1000;

const include = {
  appointment: { include: { event: { select: { name: true } }, participants: true } },
  reporter: { select: { id: true, nickname: true, ageClass: true } },
  target: { select: { id: true, nickname: true, ageClass: true } },
} as const;

/**
 * 운영 콘솔의 신고 처리 (정리문서 5장 "신고", 7장 권한표)
 * - 모든 열람과 변경은 누가·언제·왜(사유) 했는지 AuditLog에 남깁니다. (CLAUDE.md 규칙 5) 기록에는 대화 내용이나 신고 내용을 넣지 않습니다.
 * - 대화 기록은 이 신고 건에서만, 담당자가 사유를 적어야 볼 수 있습니다. 관리자도 대화는 열 수 없습니다. (권한표)
 * - 이용 정지는 신고 담당이 제안하고 다른 관리자가 확정합니다. (두 명 확인, 규칙 4)
 * - 운영 콘솔 화면은 아직 없고, 서버 기능과 규칙만 먼저 만들었습니다.
 */
@Injectable()
export class AdminReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly audit: AuditService,
    private readonly state: ReportStateService,
    private readonly accounts: AccountStateService,
    private readonly proposalState: ProposalStateService,
    private readonly appointments: AppointmentsService,
    private readonly notifications: NotificationsService,
    private readonly trust: TrustService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** 열람·조치 사유는 비워 둘 수 없습니다. */
  private async requireReason(reason: string | undefined): Promise<string> {
    const min = await this.policy.getNumber('ADMIN_REASON_MIN_LENGTH');
    const text = reason?.trim() ?? '';
    if ([...text].length < min) throw new AppError('REASON_REQUIRED', `사유를 ${min}자 이상 적어 주세요.`, { min });
    return text;
  }

  private async load(id: string) {
    const r = await this.prisma.report.findUnique({ where: { id }, include });
    if (!r) throw new AppError('NOT_FOUND', '신고를 찾을 수 없어요.');
    return r;
  }

  /** 처리 중인 신고는 담당자만 다룰 수 있습니다. */
  private assertMine(r: { status: string; assigneeId: string | null }, adminId: string) {
    if (r.status !== 'IN_REVIEW') throw new AppError('REPORT_STATE', '처리 중인 신고에서만 할 수 있어요.', { status: r.status });
    if (r.assigneeId !== adminId) throw new AppError('FORBIDDEN', '다른 담당자가 처리 중인 신고예요.');
  }

  private item(r: Awaited<ReturnType<AdminReportsService['load']>>, adminId: string): AdminReportQueueItem {
    return {
      id: r.id,
      status: r.status as ReportStatus,
      priority: r.priority as ReportPriority,
      category: r.category as ReportCategoryAll,
      categoryLabel: REPORT_CATEGORY_LABELS[r.category as ReportCategoryAll],
      eventName: r.appointment.event.name,
      createdAt: r.createdAt.toISOString(),
      assigned: !!r.assigneeId,
      assignedToMe: r.assigneeId === adminId,
    };
  }

  /** 신고 목록: 도움 요청 > 청소년 > 일반, 같으면 오래된 것 먼저. 이름·내용은 상세에서만 보입니다. */
  async queue(adminId: string, status?: ReportStatus): Promise<AdminReportQueueItem[]> {
    const where = status && OPEN.includes(status) ? [status] : OPEN;
    const rows = await this.prisma.report.findMany({ where: { status: { in: where } }, include, orderBy: { createdAt: 'asc' }, take: 200 });
    await this.audit.record({ actorId: adminId, action: 'REPORT_QUEUE_VIEW', targetType: 'Report' });
    const rank = (p: string) => REPORT_PRIORITY_ORDER.indexOf(p as ReportPriority);
    return rows.sort((a, b) => rank(a.priority) - rank(b.priority) || a.createdAt.getTime() - b.createdAt.getTime()).map((r) => this.item(r, adminId));
  }

  /** 신고 상세 (대화 내용은 들어 있지 않음) */
  async detail(adminId: string, id: string): Promise<AdminReportDetail> {
    const r = await this.load(id);
    const [pastTotal, pastUpheld, pending] = await Promise.all([
      this.prisma.report.count({ where: { targetId: r.targetId, id: { not: id } } }),
      this.prisma.report.count({ where: { targetId: r.targetId, id: { not: id }, upheld: true } }),
      this.prisma.adminApproval.findFirst({ where: { kind: 'USER_SUSPEND', targetId: id, status: APPROVAL.PENDING } }),
    ]);
    await this.audit.record({ actorId: adminId, action: 'REPORT_VIEW', targetType: 'Report', targetId: id });
    const arrived = (userId: string) => r.appointment.participants.find((p) => p.userId === userId)?.arrivedAt?.toISOString() ?? null;
    const a = r.appointment;
    return {
      ...this.item(r, adminId),
      detail: r.detail,
      appointment: { id: a.id, date: a.date, startTime: a.startTime, endTime: a.endTime, status: a.status },
      reporter: { nickname: r.reporter.nickname ?? '', ageClass: r.reporter.ageClass, arrivedAt: arrived(r.reporterId) },
      target: { nickname: r.target.nickname ?? '', ageClass: r.target.ageClass, arrivedAt: arrived(r.targetId) },
      targetPastReports: { total: pastTotal, upheld: pastUpheld },
      pendingSuspension: pending ? { approvalId: pending.id, proposedByMe: pending.proposedById === adminId } : null,
      outcome: (r.outcome as ReportOutcome | null) ?? null,
    };
  }

  /** 담당자로 지정 (대기 → 처리 중) */
  async claim(adminId: string, id: string) {
    await this.load(id);
    await this.prisma.$transaction(async (tx) => {
      await this.state.transition(tx, id, 'QUEUED', 'IN_REVIEW', { assigneeId: adminId });
      await this.audit.record({ actorId: adminId, action: 'REPORT_CLAIM', targetType: 'Report', targetId: id }, tx);
    });
    return { id, status: 'IN_REVIEW' as const };
  }

  /**
   * 대화 기록 열람: 이 신고 건에서만, 담당자가 사유를 적어야 합니다. 열 때마다 사유와 함께 기록합니다.
   * 기록(AuditLog)에는 사유만 남고 대화 내용은 들어가지 않습니다.
   */
  async viewChat(adminId: string, id: string, reason: string): Promise<AdminReportChat> {
    const text = await this.requireReason(reason);
    const r = await this.load(id);
    this.assertMine(r, adminId);
    await this.audit.record({ actorId: adminId, action: 'REPORT_CHAT_VIEW', targetType: 'Report', targetId: id, reason: text });
    const rows = await this.prisma.chatMessage.findMany({ where: { appointmentId: r.appointmentId }, orderBy: { seq: 'asc' }, take: 500 });
    return {
      reportId: id,
      messages: rows.map((m) => ({
        seq: m.seq,
        side: m.senderId === null ? 'SYSTEM' : m.senderId === r.reporterId ? 'REPORTER' : 'TARGET',
        body: m.body,
        createdAt: m.createdAt.toISOString(),
        contactDetected: m.contactDetected,
      })),
    };
  }

  /**
   * 조치하고 종결: 조치 없음 / 기록만 남기기 / 경고 / 기능 제한 (처리 중 → 종결)
   * 조치 없음이 아니면 '사실로 확인'으로 기록되어 신뢰 단계에 반영됩니다. 노쇼 건이면 상대의 노쇼로 확인됩니다.
   */
  async resolve(adminId: string, id: string, action: ReportResolveAction, reason: string) {
    const text = await this.requireReason(reason);
    const r = await this.load(id);
    this.assertMine(r, adminId);
    const upheld = REPORT_RESOLVE_ACTIONS[action].upheld;
    const now = this.clock.now();
    const days = await this.policy.getNumber('REPORT_RESTRICT_DAYS');
    await this.prisma.$transaction(async (tx) => {
      await this.state.transition(tx, id, 'IN_REVIEW', 'CLOSED', { upheld, outcome: action, resolvedAt: now });
      if (action === 'WARN') await this.notifications.notify(tx, r.targetId, 'ADMIN_WARNING', {});
      if (action === 'RESTRICT') {
        const endsAt = new Date(now.getTime() + days * DAY_MS);
        await tx.userRestriction.create({ data: { userId: r.targetId, reportId: id, kind: 'PROPOSALS', endsAt, createdAt: now } });
        await this.notifications.notify(tx, r.targetId, 'ADMIN_RESTRICTION', { until: formatSeoulShort(endsAt) });
      }
      if (upheld && r.category === 'NO_SHOW') {
        // 양쪽 도착 기록을 보고 상대의 노쇼로 확인함 (신뢰 단계 하락에 셈)
        await tx.appointmentParticipant.update({
          where: { appointmentId_userId: { appointmentId: r.appointmentId, userId: r.targetId } },
          data: { noShowConfirmed: true },
        });
      }
      await this.notifications.notify(tx, r.reporterId, 'REPORT_RESULT', { upheld });
      await this.audit.record({ actorId: adminId, action: `REPORT_${action}`, targetType: 'Report', targetId: id, reason: text }, tx);
    });
    if (upheld) await this.trust.recompute(r.targetId);
    return { id, status: 'CLOSED' as const, outcome: action };
  }

  /** 이용 정지 제안 (신고 담당). 다른 관리자가 확정해야 정지됩니다. (처리 중 → 정지 제안) */
  async proposeSuspension(adminId: string, id: string, reason: string) {
    const text = await this.requireReason(reason);
    const r = await this.load(id);
    this.assertMine(r, adminId);
    return this.prisma.$transaction(async (tx) => {
      const approval = await tx.adminApproval.create({ data: { kind: 'USER_SUSPEND', targetId: id, reason: text, proposedById: adminId } });
      await this.state.transition(tx, id, 'IN_REVIEW', 'SUSPENSION_PROPOSED');
      await this.audit.record({ actorId: adminId, action: 'USER_SUSPEND_PROPOSE', targetType: 'Report', targetId: id, reason: text }, tx);
      return { approvalId: approval.id, status: 'SUSPENSION_PROPOSED' as const };
    });
  }

  private async pendingSuspension(approvalId: string) {
    const approval = await this.prisma.adminApproval.findUnique({ where: { id: approvalId } });
    if (!approval || approval.kind !== 'USER_SUSPEND') throw new AppError('NOT_FOUND', '정지 제안을 찾을 수 없어요.');
    if (approval.status !== APPROVAL.PENDING) throw new AppError('APPROVAL_INVALID', '이미 처리된 제안이에요.');
    const report = await this.load(approval.targetId);
    if (report.status !== 'SUSPENSION_PROPOSED') throw new AppError('REPORT_STATE', '정지 제안 상태의 신고가 아니에요.', { status: report.status });
    return { approval, report };
  }

  /**
   * 이용 정지 확정 (관리자). 제안한 사람과 다른 사람이어야 합니다. (정지 제안 → 확정 → 종결)
   * 정지되면 로그인이 풀리고, 답을 기다리는 제안은 취소되고, 진행 중인 약속은 끝납니다. 상대에게는 이유 없이 취소로만 보입니다.
   */
  async confirmSuspension(adminId: string, approvalId: string) {
    const { approval, report } = await this.pendingSuspension(approvalId);
    if (approval.proposedById === adminId) throw new AppError('APPROVAL_INVALID', '제안한 사람이 직접 확정할 수 없어요.');
    const target = await this.prisma.user.findUniqueOrThrow({ where: { id: report.targetId }, select: { status: true } });
    if (target.status !== 'ACTIVE') {
      throw new AppError('REPORT_STATE', '이미 이용이 정지되었거나 탈퇴한 계정이에요. 정지 제안을 되돌려 주세요.');
    }
    const now = this.clock.now();
    const people = { proposedBy: approval.proposedById, confirmedBy: adminId };
    await this.prisma.$transaction(async (tx) => {
      await this.accounts.suspend(tx, report.targetId, people);
      const done = await tx.adminApproval.updateMany({
        where: { id: approvalId, status: APPROVAL.PENDING },
        data: { status: APPROVAL.CONFIRMED, confirmedById: adminId, decidedAt: now },
      });
      if (done.count !== 1) throw new AppError('APPROVAL_INVALID', '이미 처리된 제안이에요.');
      await this.state.transition(tx, report.id, 'SUSPENSION_PROPOSED', 'CONFIRMED', {}, people);
      await this.state.transition(tx, report.id, 'CONFIRMED', 'CLOSED', { upheld: true, outcome: 'SUSPEND', resolvedAt: now });
      await tx.session.deleteMany({ where: { userId: report.targetId } });
      const pending = await tx.proposal.findMany({
        where: { status: { in: ['SENT'] }, OR: [{ senderId: report.targetId }, { receiverId: report.targetId }] },
        select: { id: true },
      });
      for (const p of pending) await this.proposalState.transition(tx, p.id, 'SENT', 'CANCELLED');
      await this.appointments.endForSuspension(tx, report.targetId);
      await this.notifications.notify(tx, report.reporterId, 'REPORT_RESULT', { upheld: true });
      await this.audit.record({ actorId: adminId, action: 'USER_SUSPEND_CONFIRM', targetType: 'Report', targetId: report.id, reason: approval.reason }, tx);
    });
    return { id: report.id, status: 'CLOSED' as const, outcome: 'SUSPEND' as const };
  }

  /** 정지를 확정하지 않고 되돌림 (정지 제안 → 처리 중). 담당자가 다른 조치를 고를 수 있습니다. */
  async declineSuspension(adminId: string, approvalId: string, reason: string) {
    const text = await this.requireReason(reason);
    const { report } = await this.pendingSuspension(approvalId);
    await this.prisma.$transaction(async (tx) => {
      const done = await tx.adminApproval.updateMany({
        where: { id: approvalId, status: APPROVAL.PENDING },
        data: { status: APPROVAL.REJECTED, confirmedById: adminId, decidedAt: this.clock.now() },
      });
      if (done.count !== 1) throw new AppError('APPROVAL_INVALID', '이미 처리된 제안이에요.');
      await this.state.transition(tx, report.id, 'SUSPENSION_PROPOSED', 'IN_REVIEW');
      await this.audit.record({ actorId: adminId, action: 'USER_SUSPEND_DECLINE', targetType: 'Report', targetId: report.id, reason: text }, tx);
    });
    return { id: report.id, status: 'IN_REVIEW' as const };
  }
}
