/** 서버(또는 데모 모드)와 주고받는 값의 모양 */
import type {
  AppointmentView,
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
}
