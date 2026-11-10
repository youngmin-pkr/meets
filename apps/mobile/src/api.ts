/**
 * 서버와 주고받는 부분
 *
 * - 보통: EXPO_PUBLIC_API_URL의 서버로 요청합니다. (예: http://192.168.0.10:3000)
 * - 데모 모드(EXPO_PUBLIC_DEMO_MODE=1): 서버 없이 브라우저 안의 가짜 서버(demoBackend)를 씁니다.
 *   GitHub Pages에 올리는 웹 버전용입니다.
 * 로그인 토큰은 지금은 앱이 켜져 있는 동안만 기억합니다.
 */
import type {
  BlockView,
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
  NotificationView,
  ProposalView,
  MyTicketStatus,
  TicketConfirmResult,
  AgreedTerm,
  CandidateDetail,
  CandidatesResponse,
  EventDetail,
  EventReportResult,
  EventSummary,
  IdentityResult,
  PreferenceView,
} from '@meets/shared';
import { ApiError, type Backend, type HomeSummary, type Me, type SignupConfig } from './apiTypes';
import { createDemoBackend } from './demoBackend';

export { ApiError, type HomeSummary, type Me, type SignupConfig } from './apiTypes';

export const IS_DEMO = process.env.EXPO_PUBLIC_DEMO_MODE === '1';

function createHttpBackend(baseUrl: string): Backend {
  let sessionToken: string | null = null;

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError('NETWORK', '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiError(data.code ?? 'UNKNOWN', data.message ?? '잠시 후 다시 시도해 주세요.', data.detail);
    }
    return data as T;
  }

  return {
    setSessionToken: (token) => {
      sessionToken = token;
    },
    getConfig: () => call<SignupConfig>('GET', '/signup/config'),
    verifyIdentity: (verificationToken: string, agreedTerms: AgreedTerm[]) =>
      call<IdentityResult>('POST', '/auth/identity', { verificationToken, agreedTerms }),
    getMe: () => call<Me>('GET', '/me'),
    updateProfile: (nickname, avatarColor) => call<Me>('PUT', '/me/profile', { nickname, avatarColor }),
    searchFandoms: (q) =>
      call<Array<{ id: string; name: string }>>('GET', `/fandoms?q=${encodeURIComponent(q)}`),
    setFandoms: (fandomIds, isPublic) => call<Me>('PUT', '/me/fandoms', { fandomIds, isPublic }),
    setNotificationChoice: (granted) => call<Me>('POST', '/me/notification-choice', { granted }),
    listEvents: ({ q, category }) => {
      const parts = [q ? `q=${encodeURIComponent(q)}` : '', category ? `category=${category}` : ''].filter(Boolean);
      return call<EventSummary[]>('GET', `/events${parts.length ? `?${parts.join('&')}` : ''}`);
    },
    getEvent: (id) => call<EventDetail>('GET', `/events/${encodeURIComponent(id)}`),
    reportEvent: (input) => call<EventReportResult>('POST', '/event-reports', input),
    getPreference: async (eventId) =>
      (await call<{ preference: PreferenceView | null }>('GET', `/events/${encodeURIComponent(eventId)}/preference`)).preference,
    savePreference: (eventId, input) =>
      call<PreferenceView>('PUT', `/events/${encodeURIComponent(eventId)}/preference`, input),
    getCandidates: (eventId, o) => {
      const parts = [
        o.dayId ? `dayId=${encodeURIComponent(o.dayId)}` : '',
        o.sort ? `sort=${o.sort}` : '',
        o.shortTime ? 'shortTime=true' : '',
        o.immersionPlus ? 'immersionPlus=true' : '',
      ].filter(Boolean);
      return call<CandidatesResponse>(
        'GET',
        `/events/${encodeURIComponent(eventId)}/candidates${parts.length ? `?${parts.join('&')}` : ''}`,
      );
    },
    getCandidate: (eventId, userId) =>
      call<CandidateDetail>('GET', `/events/${encodeURIComponent(eventId)}/candidates/${encodeURIComponent(userId)}`),
    registerWait: (eventId, includeImmersionPlus) =>
      call<{ endsOn: string; includeImmersionPlus: boolean }>(
        'POST',
        `/events/${encodeURIComponent(eventId)}/wait-registrations`,
        { includeImmersionPlus },
      ),
    getTicketStatus: (eventId) => call<MyTicketStatus>('GET', `/events/${encodeURIComponent(eventId)}/ticket`),
    startTicket: (eventId, kind) =>
      call<{ id: string; status: string }>('POST', `/events/${encodeURIComponent(eventId)}/tickets`, { kind }),
    uploadTicketImage: (id, imageBase64, mimeType, masks) =>
      call<{ id: string; status: string }>('POST', `/tickets/${encodeURIComponent(id)}/image`, { imageBase64, mimeType, masks }),
    confirmTicket: (id, reservationNumber, admissibleDayIds) =>
      call<TicketConfirmResult>('POST', `/tickets/${encodeURIComponent(id)}/confirm`, { reservationNumber, admissibleDayIds }),
    planAttendance: (eventId) => call<MyTicketStatus>('POST', `/events/${encodeURIComponent(eventId)}/attendance-plan`),
    sendProposal: (eventId, input) => call<ProposalView>('POST', `/events/${encodeURIComponent(eventId)}/proposals`, input),
    listProposals: () => call<ProposalView[]>('GET', '/me/proposals'),
    acceptProposal: (id) => call<AppointmentView>('POST', `/proposals/${encodeURIComponent(id)}/accept`),
    rejectProposal: (id) => call<{ id: string; status: string }>('POST', `/proposals/${encodeURIComponent(id)}/reject`),
    cancelProposal: (id) => call<{ id: string; status: string }>('POST', `/proposals/${encodeURIComponent(id)}/cancel`),
    listAppointments: () => call<AppointmentView[]>('GET', '/me/appointments'),
    getAppointment: (id) => call<AppointmentView>('GET', `/appointments/${encodeURIComponent(id)}`),
    confirmAppointment: (id) => call<AppointmentView>('POST', `/appointments/${encodeURIComponent(id)}/confirm`),
    cancelAppointment: (id, reason) => call<AppointmentView>('POST', `/appointments/${encodeURIComponent(id)}/cancel`, reason ? { reason } : {}),
    arriveAppointment: (id) => call<AppointmentView>('POST', `/appointments/${encodeURIComponent(id)}/arrive`),
    reportNoShow: (id) => call<AppointmentView>('POST', `/appointments/${encodeURIComponent(id)}/no-show`),
    getSafetySettings: () => call<SafetySettings>('GET', '/me/safety-settings'),
    updateSafetySettings: (patch) => call<SafetySettings>('PUT', '/me/safety-settings', patch),
    requestHelp: (id) => call<HelpResult>('POST', `/appointments/${encodeURIComponent(id)}/help`),
    answerSafetyCheck: (id, checkId, answer) =>
      call<AppointmentView | HelpResult>('POST', `/appointments/${encodeURIComponent(id)}/safety-checks/${encodeURIComponent(checkId)}/answer`, { answer }),
    listShareLinks: (id) => call<ShareLinkView[]>('GET', `/appointments/${encodeURIComponent(id)}/share-links`),
    createShareLink: (id, showStatus) => call<ShareLinkView>('POST', `/appointments/${encodeURIComponent(id)}/share-links`, { showStatus }),
    revokeShareLink: (linkId) => call<{ revoked: true }>('DELETE', `/share-links/${encodeURIComponent(linkId)}`),
    getInstantEvents: () => call<InstantEventView[]>('GET', '/me/instant-events'),
    getInstantStatus: (eventId) => call<InstantStatusView>('GET', `/events/${encodeURIComponent(eventId)}/instant`),
    turnOnInstant: (eventId, style) => call<InstantStatusView>('PUT', `/events/${encodeURIComponent(eventId)}/instant`, style ? { style } : {}),
    turnOffInstant: (eventId) => call<InstantStatusView>('DELETE', `/events/${encodeURIComponent(eventId)}/instant`),
    getInstantCandidates: (eventId) => call<CandidatesResponse>('GET', `/events/${encodeURIComponent(eventId)}/instant/candidates`),
    getInstantCandidate: (eventId, userId) => call<CandidateDetail>('GET', `/events/${encodeURIComponent(eventId)}/instant/candidates/${encodeURIComponent(userId)}`),
    createParty: (eventId) => call<PartyView>('POST', `/events/${encodeURIComponent(eventId)}/party`),
    getEventParty: (eventId) => call<{ party: PartyView | null }>('GET', `/events/${encodeURIComponent(eventId)}/party`),
    listParties: () => call<PartyView[]>('GET', '/me/parties'),
    getParty: (id) => call<PartyView>('GET', `/parties/${encodeURIComponent(id)}`),
    leaveParty: (id) => call<{ left: true }>('POST', `/parties/${encodeURIComponent(id)}/leave`),
    disbandParty: (id) => call<{ disbanded: true }>('POST', `/parties/${encodeURIComponent(id)}/disband`),
    proceedParty: (id) => call<PartyView>('POST', `/parties/${encodeURIComponent(id)}/proceed`),
    getPartyCandidates: (id, o) => {
      const q = new URLSearchParams();
      if (o.dayId) q.set('dayId', o.dayId);
      if (o.sort) q.set('sort', o.sort);
      if (o.shortTime) q.set('shortTime', 'true');
      if (o.immersionPlus) q.set('immersionPlus', 'true');
      const qs = q.toString();
      return call<CandidatesResponse>('GET', `/parties/${encodeURIComponent(id)}/candidates${qs ? `?${qs}` : ''}`);
    },
    getPartyCandidate: (id, userId) => call<CandidateDetail>('GET', `/parties/${encodeURIComponent(id)}/candidates/${encodeURIComponent(userId)}`),
    createPartyProposal: (partyId, input) => call<ProposalView>('POST', `/parties/${encodeURIComponent(partyId)}/proposals`, input),
    agreeProposal: (id) => call<ProposalView>('POST', `/proposals/${encodeURIComponent(id)}/agree`),
    declineProposal: (id) => call<{ id: string; status: string }>('POST', `/proposals/${encodeURIComponent(id)}/decline`),
    previewPartyInvite: (token) => call<PartyInvitePreview>('GET', `/party-invites/${encodeURIComponent(token)}`),
    joinParty: (token) => call<PartyView>('POST', `/party-invites/${encodeURIComponent(token)}/join`),
    listNotifications: () => call<{ items: NotificationView[]; unread: number }>('GET', '/me/notifications'),
    markNotificationsRead: () => call<{ unread: number }>('POST', '/me/notifications/read'),
    getHomeSummary: () => call<HomeSummary>('GET', '/me/home'),
    submitReview: (id, input) => call<{ done: true; mutual: boolean }>('POST', `/appointments/${encodeURIComponent(id)}/review`, input),
    blockUser: (userId) => call<{ blocked: true }>('POST', '/blocks', { userId }),
    blockCounterpart: (appointmentId, targetId) => call<{ blocked: true }>('POST', '/blocks/from-chat', targetId ? { appointmentId, targetId } : { appointmentId }),
    unblockUser: (userId) => call<{ blocked: false }>('DELETE', `/blocks/${encodeURIComponent(userId)}`),
    listBlocks: () => call<BlockView[]>('GET', '/me/blocks'),
    sendReport: (input) => call<{ id: string; received: true; blocked: boolean }>('POST', '/reports', input),
    getTrust: () => call<TrustView>('GET', '/me/trust'),
    listChats: () => call<ChatSummary[]>('GET', '/me/chats'),
    getChat: (id, after) => call<ChatView>('GET', `/appointments/${encodeURIComponent(id)}/chat${after !== undefined ? `?after=${after}` : ''}`),
    sendChat: (id, body, confirmContact) =>
      call<ChatMessageView>('POST', `/appointments/${encodeURIComponent(id)}/chat`, confirmContact ? { body, confirmContact } : { body }),
  };
}

export const api: Backend = IS_DEMO
  ? createDemoBackend()
  : createHttpBackend(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000');

export function setSessionToken(token: string | null) {
  api.setSessionToken(token);
}
