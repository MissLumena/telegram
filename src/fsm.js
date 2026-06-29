// In-memory FSM store: per-user state + context, with idle-timeout reset.
// No Redis — state is lost on restart (acceptable for the current scope).

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min of inactivity → reset to START

const sessions = new Map(); // userId -> { state, ctx, updatedAt }

export const States = {
  START: "START",
  CHOOSING_SERVICE: "CHOOSING_SERVICE",
  CHOOSING_MASTER: "CHOOSING_MASTER",
  CHOOSING_DATE: "CHOOSING_DATE",
  CHOOSING_TIME: "CHOOSING_TIME",
  ENTERING_NAME: "ENTERING_NAME",
  ENTERING_PHONE: "ENTERING_PHONE",
  CONFIRMING: "CONFIRMING",
  SAVING: "SAVING",
  SUCCESS: "SUCCESS",
  CANCEL_SEARCH: "CANCEL_SEARCH",
  CANCEL_LIST: "CANCEL_LIST",
  CANCEL_CONFIRM: "CANCEL_CONFIRM",
  CANCEL_DONE: "CANCEL_DONE",
};

export function getState(userId) {
  const s = sessions.get(userId);
  if (!s) return States.START;
  if (Date.now() - s.updatedAt > SESSION_TTL_MS) {
    sessions.delete(userId);
    return States.START;
  }
  return s.state;
}

export function getContext(userId) {
  return sessions.get(userId)?.ctx ?? {};
}

export function setState(userId, state, ctxPatch = {}) {
  const existing = sessions.get(userId);
  const ctx = { ...(existing?.ctx ?? {}), ...ctxPatch };
  sessions.set(userId, { state, ctx, updatedAt: Date.now() });
}

export function reset(userId) {
  sessions.delete(userId);
}

// Periodic sweep of expired sessions.
setInterval(() => {
  const now = Date.now();
  for (const [uid, s] of sessions) {
    if (now - s.updatedAt > SESSION_TTL_MS) sessions.delete(uid);
  }
}, 5 * 60 * 1000).unref();
