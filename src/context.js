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

/**
 * @param {Array} messages - from getMessagesInRange
 * @returns structured context for LLM
 */
export function buildStructuredContext(messages) {
  if (!messages?.length) return { participants: [], byContact: [], threads: [], summary: 'No messages in range.' };
  const participants = extractParticipants(messages);
  const byContact = aggregateByContact(messages);
  const threads = threadGroups(messages);
  const dateRange = {
    from: messages[messages.length - 1]?.receivedDateTime,
    to: messages[0]?.receivedDateTime,
  };
  return {
    participants,
    byContact,
    threads,
    dateRange,
    totalMessages: messages.length,
    summary: `${messages.length} messages; ${byContact.length} contacts; ${threads.length} threads.`,
  };
}
