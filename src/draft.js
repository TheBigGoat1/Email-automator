import OpenAI from 'openai';
import { config } from './config.js';
import { saveDraft } from './graph.js';

function getOpenAI() {
  const key = config.openaiApiKey;
  return key ? new OpenAI({ apiKey: key }) : null;
}

const DEFAULT_OPENER = 'Hello,';
const DEFAULT_CLOSING = 'Best regards,';
const DEFAULT_SIGNATURE = '';

/**
 * Deterministic content blocks: openers, closings, signatures.
 * Override via options for brand/tone consistency.
 */
export function getContentBlocks(options = {}) {
  return {
    opener: options.opener ?? DEFAULT_OPENER,
    closing: options.closing ?? DEFAULT_CLOSING,
    signature: options.signature ?? DEFAULT_SIGNATURE,
  };
}

/**
 * Build one draft body from blocks + generated middle.
 */
export function assembleDraftBody(generatedBody, blocks = getContentBlocks()) {
  const parts = [blocks.opener, '', generatedBody, '', blocks.closing];
  if (blocks.signature) parts.push('', blocks.signature);
  return parts.join('\n');
}

/**
 * Call LLM to generate draft body from structured context. Falls back to placeholder if no API key.
 */
export async function generateDraftBody(structuredContext, recipientAddress, options = {}) {
  const blocks = getContentBlocks(options);
  const contextSummary = JSON.stringify(structuredContext, null, 2);
  const toneHint = structuredContext.toneSignals?.suggestedTone
    ? ` Match the suggested tone: ${structuredContext.toneSignals.suggestedTone}.`
    : '';
  const system = `You are an email assistant. Write a concise, professional email body (2–4 short paragraphs) based only on the provided context. Do not invent facts. Match tone suggested by recent subjects and interaction frequency.${toneHint} Output only the body text, no subject or greetings.`;
  const user = `Context:\n${contextSummary}\n\nRecipient: ${recipientAddress}\n\nGenerate the email body:`;

  const openai = getOpenAI();
  if (!openai) {
    return assembleDraftBody(
      `[Placeholder: no OpenAI API key configured. Context had ${structuredContext.totalMessages ?? 0} messages.]`,
      blocks
    );
  }

  const completion = await openai.chat.completions.create({
    model: options.model || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: options.max_tokens ?? 500,
  });
  const generated = completion.choices?.[0]?.message?.content?.trim() || '[No content generated.]';
  return assembleDraftBody(generated, blocks);
}

/**
 * Generate draft body only (for preview). Returns { body }.
 */
export async function generateDraftBodyOnly(structuredContext, recipientAddress, options = {}) {
  const body = await generateDraftBody(structuredContext, recipientAddress, options);
  return { body };
}

/**
 * Full flow: generate draft from context, then save to Outlook Drafts via Graph.
 */
export async function createAndSaveDraft(graphClient, structuredContext, { to, subject }, options = {}) {
  const body = await generateDraftBody(structuredContext, Array.isArray(to) ? to[0] : to, options);
  const draft = await saveDraft(graphClient, {
    to: Array.isArray(to) ? to : [to],
    subject: subject || '(Draft)',
    body: body.replace(/\n/g, '<br>\n'),
  });
  return { draft, body };
}
