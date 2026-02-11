/**
 * Build structured context from raw Graph messages: participants, frequency, subjects, thread continuity.
 * Normalize by contact and thread for relational awareness.
 */

function emailAddr(m) {
  if (!m) return null;
  const e = m.emailAddress || m;
  return e.address || e;
}

function extractParticipants(messages) {
  const byAddr = new Map();
  for (const m of messages) {
    const from = emailAddr(m.from);
    if (from) byAddr.set(from, (byAddr.get(from) || 0) + 1);
    for (const r of m.toRecipients || []) {
      const a = emailAddr(r);
      if (a) byAddr.set(a, (byAddr.get(a) || 0) + 1);
    }
    for (const r of m.ccRecipients || []) {
      const a = emailAddr(r);
      if (a) byAddr.set(a, (byAddr.get(a) || 0) + 1);
    }
  }
  return Array.from(byAddr.entries()).map(([address, count]) => ({ address, messageCount: count }));
}

function aggregateByContact(messages) {
  const byContact = new Map();
  for (const m of messages) {
    const from = emailAddr(m.from);
    if (!from) continue;
    if (!byContact.has(from)) byContact.set(from, { address: from, messages: [], subjectLines: [] });
    const c = byContact.get(from);
    c.messages.push({
      id: m.id,
      subject: m.subject,
      receivedDateTime: m.receivedDateTime,
      conversationId: m.conversationId,
      bodyPreview: (m.bodyPreview || '').slice(0, 200),
      isRead: m.isRead,
    });
    if (m.subject) c.subjectLines.push(m.subject);
  }
  return Array.from(byContact.values()).map((c) => ({
    ...c,
    interactionCount: c.messages.length,
    recentSubjectThemes: [...new Set(c.subjectLines.slice(-10))].slice(-5),
  }));
}

function threadGroups(messages) {
  const byThread = new Map();
  for (const m of messages) {
    const tid = m.conversationId || m.id;
    if (!byThread.has(tid)) byThread.set(tid, []);
    byThread.get(tid).push(m);
  }
  return Array.from(byThread.entries()).map(([conversationId, msgs]) => ({
    conversationId,
    messageCount: msgs.length,
    subjects: [...new Set(msgs.map((m) => m.subject).filter(Boolean))],
    lastReceived: msgs.map((m) => m.receivedDateTime).sort().pop(),
  }));
}

const FORMAL_KEYWORDS = /re:\s*meeting|agenda|proposal|contract|formal|dear\s+(sir|madam)|regards|sincerely/i;
const CASUAL_KEYWORDS = /thanks!|hey\s|hi\s|quick\s|catch\s+up|chat\s|later/i;

function inferToneSignals(messages) {
  const subjects = messages.map((m) => (m.subject || '')).join(' ');
  const previews = messages.map((m) => (m.bodyPreview || '')).join(' ');
  const combined = (subjects + ' ' + previews).toLowerCase();
  const formal = FORMAL_KEYWORDS.test(combined);
  const casual = CASUAL_KEYWORDS.test(combined);
  return {
    suggestedTone: formal && !casual ? 'formal' : casual && !formal ? 'casual' : 'neutral',
    signals: { formal, casual },
  };
}

/**
 * @param {Array} messages - from getMessagesInRange
 * @param {Object} options - { includeBody: boolean, bodyMaxChars: number }
 * @returns structured context for LLM
 */
export function buildStructuredContext(messages, options = {}) {
  if (!messages?.length) return { participants: [], byContact: [], threads: [], toneSignals: {}, summary: 'No messages in range.' };
  const participants = extractParticipants(messages);
  const byContact = aggregateByContact(messages);
  const threads = threadGroups(messages);
  const toneSignals = inferToneSignals(messages);
  const dateRange = {
    from: messages[messages.length - 1]?.receivedDateTime,
    to: messages[0]?.receivedDateTime,
  };
  const maxBody = options.bodyMaxChars ?? 300;
  let recentBodies = [];
  if (options.includeBody && messages.length) {
    recentBodies = messages.slice(0, 10).map((m) => (m.bodyPreview || m.body?.content || '').slice(0, maxBody));
  }
  return {
    participants,
    byContact,
    threads,
    toneSignals,
    dateRange,
    totalMessages: messages.length,
    ...(recentBodies.length ? { recentBodies } : {}),
    summary: `${messages.length} messages; ${byContact.length} contacts; ${threads.length} threads; tone: ${toneSignals.suggestedTone}.`,
  };
}
