import { Client } from '@microsoft/microsoft-graph-client';

export function getGraphClient(accessToken) {
  if (!accessToken) throw new Error('No access token');
  return Client.init({ authProvider: (done) => done(null, accessToken) });
}

/** List mail folders (id, displayName). */
export async function listMailFolders(client) {
  const res = await client.api('/me/mailFolders').select('id,displayName').get();
  return res.value || [];
}

/**
 * Fetch message metadata in a folder and date range.
 * @param {object} client - Graph client
 * @param {string} folderId - folder id or 'inbox', 'drafts', etc.
 * @param {string} fromDate - ISO date (e.g. 2024-01-01)
 * @param {string} toDate - ISO date
 * @param {number} top - max messages
 */
export async function getMessagesInRange(client, folderId, fromDate, toDate, top = 100) {
  const fromIso = fromDate ? new Date(fromDate).toISOString() : null;
  const toIso = toDate ? new Date(toDate).toISOString() : null;
  let req = client
    .api(`/me/mailFolders/${folderId}/messages`)
    .select('id,subject,from,toRecipients,ccRecipients,receivedDateTime,conversationId,bodyPreview,isRead')
    .orderby('receivedDateTime desc')
    .top(top);
  if (fromIso) req = req.filter(`receivedDateTime ge '${fromIso}'`);
  if (toIso) req = req.filter(`receivedDateTime le '${toIso}'`);
  const res = await req.get();
  const messages = res.value || [];
  let nextLink = res['@odata.nextLink'];
  while (nextLink && messages.length < top) {
    const next = await client.api(nextLink).get();
    messages.push(...(next.value || []));
    nextLink = next['@odata.nextLink'];
  }
  return messages.slice(0, top);
}

/** Save a draft to Outlook Drafts folder. */
export async function saveDraft(client, { to, subject, body }) {
  const draft = {
    subject: subject || '(No subject)',
    body: {
      contentType: 'HTML',
      content: body || '',
    },
    toRecipients: (Array.isArray(to) ? to : [to]).map((addr) =>
      typeof addr === 'string' ? { emailAddress: { address: addr } } : { emailAddress: addr }
    ),
  };
  const created = await client.api('/me/mailFolders/drafts/messages').post(draft);
  return created;
}
