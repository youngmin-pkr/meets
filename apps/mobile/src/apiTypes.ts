/** 서버(또는 데모 모드)와 주고받는 값의 모양 */
import type {
  BlockView,
  ReportInput,
  ReviewInput,
  TrustView,
  ChatMessageView,
  ChatSummary,
  ChatView,
  AppointmentView,
  HelpResult,
  InstantEventView,
  InstantStatusView,
  InstantStyleInput,
  PartyInvitePreview,
  PartyView,
  SafetySettings,
  ShareLinkView,
  CancelReason,
  NotificationView,
  ProposalInput,
  ProposalView,
  MaskBox,
  MyTicketStatus,
  TicketConfirmResult,
  TicketKind,
  AgreedTerm,
  CandidateDetail,
  CandidatesResponse,
  MatchOptions,
  PreferenceInput,
  PreferenceView,
  EventCategory,
  EventDetail,
  EventReportInput,
  EventReportResult,
  EventSummary,
  IdentityResult,
  SignupStep,
} from '@meets/shared';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export interface SignupConfig {
  identityProvider: string;
  terms: Array<{ code: string; title: string; version: string; required: boolean }>;
  nicknameMinLength: number;
  nicknameMaxLength: number;
  fandomMaxCount: number;
  signupMinAge: number;
  avatarColors: Record<string, string>;
}

export interface Me {
  nickname: string | null;
  avatarInitial: string | null;
  avatarColor: string | null;
  fandomPublic: boolean;
  fandoms: Array<{ id: string; name: string }>;
  notificationChoice: 'ALLOWED' | 'DENIED' | null;
  nextStep: SignupStep;
}

/** 앱이 부르는 기능 목록. 실제 서버와 데모 모드가 똑같이 따릅니다. */
export interface Backend {
  setSessionToken(token: string | null): void;
  getConfig(): Promise<SignupConfig>;
  verifyIdentity(verificationToken: string, agreedTerms: AgreedTerm[]): Promise<IdentityResult>;
  getMe(): Promise<Me>;
  updateProfile(nickname: string, avatarColor: string): Promise<Me>;
  searchFandoms(q: string): Promise<Array<{ id: string; name: string }>>;
  setFandoms(fandomIds: string[], isPublic: boolean): Promise<Me>;
  setNotificationChoice(granted: boolean): Promise<Me>;
  listEvents(query: { q?: string; category?: EventCategory }): Promise<EventSummary[]>;
  getEvent(id: string): Promise<EventDetail>;
  reportEvent(input: EventReportInput): Promise<EventReportResult>;
  getPreference(eventId: string): Promise<PreferenceView | null>;
  savePreference(eventId: string, input: PreferenceInput): Promise<PreferenceView>;
  getCandidates(eventId: string, options: MatchOptions): Promise<CandidatesResponse>;
  getCandidate(eventId: string, userId: string): Promise<CandidateDetail>;
  registerWait(eventId: string, includeImmersionPlus: boolean): Promise<{ endsOn: string; includeImmersionPlus: boolean }>;
  getTicketStatus(eventId: string): Promise<MyTicketStatus>;
  startTicket(eventId: string, kind: TicketKind): Promise<{ id: string; status: string }>;
  uploadTicketImage(id: string, imageBase64: string, mimeType: string, masks: MaskBox[]): Promise<{ id: string; status: string }>;
  confirmTicket(id: string, reservationNumber: string, admissibleDayIds: string[]): Promise<TicketConfirmResult>;
  planAttendance(eventId: string): Promise<MyTicketStatus>;
  sendProposal(eventId: string, input: ProposalInput): Promise<ProposalView>;
  listProposals(): Promise<ProposalView[]>;
  acceptProposal(id: string): Promise<AppointmentView>;
  rejectProposal(id: string): Promise<{ id: string; status: string }>;
  cancelProposal(id: string): Promise<{ id: string; status: string }>;
  listAppointments(): Promise<AppointmentView[]>;
  getAppointment(id: string): Promise<AppointmentView>;
  /** '갈 수 있어요' (전날 확인), 행사 일정이 바뀐 뒤에는 '바뀐 일정으로 갈게요' */
  confirmAppointment(id: string): Promise<AppointmentView>;
  cancelAppointment(id: string, reason?: CancelReason): Promise<AppointmentView>;
  arriveAppointment(id: string): Promise<AppointmentView>;
  reportNoShow(id: string): Promise<AppointmentView>;
  /** 안전: 설정, 도움 요청('벗어나고 싶어요'), 안전 확인 답, 믿는 사람 링크 */
  getSafetySettings(): Promise<SafetySettings>;
  updateSafetySettings(patch: Partial<SafetySettings>): Promise<SafetySettings>;
  requestHelp(appointmentId: string): Promise<HelpResult>;
  /** 'HELP'로 답하면 도움 요청과 같습니다 */
  answerSafetyCheck(appointmentId: string, checkId: string, answer: 'OK' | 'HELP'): Promise<AppointmentView | HelpResult>;
  listShareLinks(appointmentId: string): Promise<ShareLinkView[]>;
  createShareLink(appointmentId: string, showStatus: boolean): Promise<ShareLinkView>;
  revokeShareLink(linkId: string): Promise<{ revoked: true }>;
  /** 일행 (2~4명, 초대 링크로 합류, 전원이 입력하면 후보가 열림) */
  /** 즉석 동행: 오늘 쓸 수 있는 행사, 행사장에 있다고 알리기(켜기·끄기), 대기, 후보 */
  getInstantEvents(): Promise<InstantEventView[]>;
  getInstantStatus(eventId: string): Promise<InstantStatusView>;
  turnOnInstant(eventId: string, style?: InstantStyleInput): Promise<InstantStatusView>;
  turnOffInstant(eventId: string): Promise<InstantStatusView>;
  getInstantCandidates(eventId: string): Promise<CandidatesResponse>;
  getInstantCandidate(eventId: string, userId: string): Promise<CandidateDetail>;
  createParty(eventId: string): Promise<PartyView>;
  getEventParty(eventId: string): Promise<{ party: PartyView | null }>;
  listParties(): Promise<PartyView[]>;
  getParty(id: string): Promise<PartyView>;
  leaveParty(id: string): Promise<{ left: true }>;
  disbandParty(id: string): Promise<{ disbanded: true }>;
  /** 대표: 입력하지 않은 친구를 빼고 진행 */
  proceedParty(id: string): Promise<PartyView>;
  /** 일행 제안 초안 만들기 (나머지 일행원이 모두 동의해야 제안이 나감) */
  createPartyProposal(partyId: string, input: ProposalInput): Promise<ProposalView>;
  agreeProposal(id: string): Promise<ProposalView>;
  declineProposal(id: string): Promise<{ id: string; status: string }>;
  getPartyCandidates(id: string, options: MatchOptions): Promise<CandidatesResponse>;
  getPartyCandidate(id: string, userId: string): Promise<CandidateDetail>;
  previewPartyInvite(token: string): Promise<PartyInvitePreview>;
  joinParty(token: string): Promise<PartyView>;
  listNotifications(): Promise<{ items: NotificationView[]; unread: number }>;
  markNotificationsRead(): Promise<{ unread: number }>;
  getHomeSummary(): Promise<HomeSummary>;
  /** 앱 안 채팅. after를 주면 그 번호 다음 메시지만 */
  listChats(): Promise<ChatSummary[]>;
  getChat(appointmentId: string, after?: number): Promise<ChatView>;
  /** 연락처가 감지되면 CONTACT_DETECTED. confirmContact=true면 '그래도 보낼게요' */
  sendChat(appointmentId: string, body: string, confirmContact?: boolean): Promise<ChatMessageView>;
  /** 후기 (내용은 상대에게 보이지 않음). mutual=true면 서로 '또 같이 가고 싶어요'를 고른 것 */
  submitReview(appointmentId: string, input: ReviewInput): Promise<{ done: true; mutual: boolean }>;
  /** 차단 (상대에게 알리지 않음). 진행 중인 약속은 끝납니다 */
  blockUser(userId: string): Promise<{ blocked: true }>;
  /** 채팅 규칙 화면: 약속 상대를 차단하고 약속을 끝냄 */
  /** 여러 명이 만나는 약속이면 누구를 차단하는지(targetId)도 알려야 합니다 */
  blockCounterpart(appointmentId: string, targetId?: string): Promise<{ blocked: true }>;
  unblockUser(userId: string): Promise<{ blocked: false }>;
  listBlocks(): Promise<BlockView[]>;
  sendReport(input: ReportInput): Promise<{ id: string; received: true; blocked: boolean }>;
  getTrust(): Promise<TrustView>;
}

/** 홈 화면 요약 */
export interface HomeSummary {
  unreadNotifications: number;
  hasVerifiedTicket: boolean;
}
