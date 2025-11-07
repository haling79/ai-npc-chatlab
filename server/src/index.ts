import express, { Request, Response } from 'express';
import cors, { CorsOptions, CorsOptionsDelegate } from 'cors';
import { v4 as uuid } from 'uuid';
import { initDB, getPool } from './db.js';
import { ENV } from './env.js';
import { callLLM, summarizeConversation } from './llm.js';
import type { CharacterRow, PromptRow, Meta, Metrics } from './types.js';

// 평가 함수
function evaluateReply(reply: string, styleGuide?: { tone?: string }): Metrics {
  const words = (reply || '').trim().split(/\s+/).filter(Boolean).length;
  const forbidden = ['금지어1', '금지어2', '욕설'];
  const forbiddenHits = forbidden.filter(w => reply.includes(w));
  const tone = styleGuide?.tone;
  const toneMatch = tone ? reply.toLowerCase().includes(String(tone).toLowerCase()) : null;
  return { length: words, forbiddenHits, toneMatch };
}

const app = express();

// Robust CORS handling with detailed logs
const allowed = (ENV.CORS_ORIGIN || '*')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Expand localhost entry to also allow 127.0.0.1 on same port
const expandedAllowed = new Set<string>(allowed);
for (const o of allowed) {
  try {
    const url = new URL(o);
    if (url.hostname === 'localhost') {
      expandedAllowed.add(`${url.protocol}//127.0.0.1${url.port ? ':'+url.port : ''}`);
    }
    if (url.hostname === '127.0.0.1') {
      expandedAllowed.add(`${url.protocol}//localhost${url.port ? ':'+url.port : ''}`);
    }
  } catch {
    // ignore invalid URL entries
  }
}

const corsDelegate: CorsOptionsDelegate<Request> = (req, cb) => {
  const origin = req.header('Origin') || '';
  const hasWildcard = expandedAllowed.has('*');
  const isAllowed = hasWildcard || (origin && expandedAllowed.has(origin));
  const baseOptions: CorsOptions = {
    origin: isAllowed,
    credentials: true,
    methods: ['GET','HEAD','PUT','PATCH','POST','DELETE'],
    allowedHeaders: ['Content-Type','Authorization'],
  };
  console.log(`[CORS] Origin: ${origin || '(no origin)'} | Allowed: ${isAllowed} | AllowedList: ${Array.from(expandedAllowed).join(', ')}`);
  cb(null, baseOptions);
};

app.use(cors(corsDelegate));
app.options('*', cors(corsDelegate));
app.use(express.json());

// ---------- Characters ----------
app.get('/api/characters', async (_req: Request, res: Response) => {
  const [rows] = await getPool().query('SELECT * FROM characters');
  res.json(rows);
});

app.post('/api/characters', async (req: Request, res: Response) => {
  const { name, persona, styleGuide, tags } = req.body as { name: string; persona?: string; styleGuide?: any; tags?: any[] };
  const id = uuid();
  await getPool().query(
    'INSERT INTO characters (id, name, persona, style_guide, tags) VALUES (?,?,?,?,?)',
    [id, name, persona || '', JSON.stringify(styleGuide || {}), JSON.stringify(tags || [])]
  );
  res.json({ id, name, persona, styleGuide, tags });
});

app.put('/api/characters/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, persona, styleGuide, tags } = req.body as { name: string; persona?: string; styleGuide?: any; tags?: any[] };
  await getPool().query(
    'UPDATE characters SET name=?, persona=?, style_guide=?, tags=? WHERE id=?',
    [name, persona || '', JSON.stringify(styleGuide || {}), JSON.stringify(tags || []), id]
  );
  res.json({ ok: true });
});

app.delete('/api/characters/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  await getPool().query('DELETE FROM characters WHERE id=?', [id]);
  res.json({ ok: true });
});

// ---------- Prompts ----------
app.get('/api/prompts', async (_req: Request, res: Response) => {
  const [rows] = await getPool().query('SELECT * FROM prompts');
  res.json(rows);
});

app.post('/api/prompts', async (req: Request, res: Response) => {
  const { name, system, userTemplate, notes, versionTag } = req.body as { name: string; system?: string; userTemplate?: string; notes?: string; versionTag?: string };
  const id = uuid();
  await getPool().query(
    'INSERT INTO prompts (id, name, system, user_template, notes, version_tag) VALUES (?,?,?,?,?,?)',
    [id, name, system || '', userTemplate || '{{user}}', notes || '', versionTag || 'v1']
  );
  res.json({ id, name, system, userTemplate, notes, versionTag });
});

app.put('/api/prompts/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, system, userTemplate, notes, versionTag } = req.body as { name: string; system?: string; userTemplate?: string; notes?: string; versionTag?: string };
  await getPool().query(
    'UPDATE prompts SET name=?, system=?, user_template=?, notes=?, version_tag=? WHERE id=?',
    [name, system || '', userTemplate || '{{user}}', notes || '', versionTag || 'v1', id]
  );
  res.json({ ok: true });
});

app.delete('/api/prompts/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  await getPool().query('DELETE FROM prompts WHERE id=?', [id]);
  res.json({ ok: true });
});

// ---------- Sessions ----------
app.post('/api/sessions', async (req: Request, res: Response) => {
  const { characterId, promptId, title } = req.body as { characterId: string; promptId: string; title?: string };
  const id = uuid();
  await getPool().query(
    'INSERT INTO sessions (id, character_id, prompt_id, title) VALUES (?,?,?,?)',
    [id, characterId, promptId, title || 'Untitled']
  );
  res.json({ id, characterId, promptId, title });
});

app.get('/api/sessions', async (_req: Request, res: Response) => {
  const [rows] = await getPool().query('SELECT * FROM sessions ORDER BY created_at DESC');
  res.json(rows);
});

app.delete('/api/sessions/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  // 세션과 관련된 메시지, 피드백도 함께 삭제
  await getPool().query('DELETE FROM feedback WHERE message_id IN (SELECT id FROM messages WHERE session_id=?)', [id]);
  await getPool().query('DELETE FROM messages WHERE session_id=?', [id]);
  await getPool().query('DELETE FROM sessions WHERE id=?', [id]);
  res.json({ ok: true });
});

// ---------- Messages ----------
app.get('/api/messages/:sessionId', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const [rows] = await getPool().query('SELECT * FROM messages WHERE session_id=? ORDER BY created_at ASC', [sessionId]);
  const formatted = (rows as any[]).map(r => ({ ...r, meta: r.meta ? JSON.parse(r.meta) as Meta : {} }));
  res.json(formatted);
});

app.post('/api/messages', async (req: Request, res: Response) => {
  const { sessionId, content, model } = req.body as { sessionId: string; content: string; model: 'gemini' };

  const [[session]] = await getPool().query('SELECT * FROM sessions WHERE id=?', [sessionId]) as any;
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const [[character]] = await getPool().query('SELECT * FROM characters WHERE id=?', [session.character_id]) as any;
  const [[prompt]] = await getPool().query('SELECT * FROM prompts WHERE id=?', [session.prompt_id]) as any;

  // 기존 대화 히스토리 가져오기
  const [historyRows] = await getPool().query(
    'SELECT role, content FROM messages WHERE session_id=? ORDER BY created_at ASC',
    [sessionId]
  ) as any;
  
  const allHistory = historyRows.map((row: any) => ({
    role: row.role as 'user' | 'npc',
    content: row.content
  }));

  // 대화 히스토리 관리: 최근 15개는 원문, 나머지는 요약
  let summary = session.summary || '';
  
  if (allHistory.length > 15) {
    const oldMessages = allHistory.slice(0, -15); // 15개 이전의 모든 메시지
    
    if (!session.summary) {
      // 처음 요약 생성
      summary = await summarizeConversation(oldMessages);
      await getPool().query('UPDATE sessions SET summary=? WHERE id=?', [summary, sessionId]);
      console.log(`[Session ${sessionId}] Created initial summary from ${oldMessages.length} old messages`);
    } else if (oldMessages.length >= 5) {
      // 요약이 이미 있고, 요약 대상이 5개 이상 증가했으면 재요약
      // 기존 요약 + 새로운 오래된 메시지들을 함께 요약
      const previousSummaryContext = [
        { role: 'npc' as const, content: `[이전 대화 요약]: ${summary}` },
        ...oldMessages
      ];
      
      summary = await summarizeConversation(previousSummaryContext);
      await getPool().query('UPDATE sessions SET summary=? WHERE id=?', [summary, sessionId]);
      console.log(`[Session ${sessionId}] Updated summary: ${oldMessages.length} old messages + previous summary`);
    }
  }

  const userId = uuid();
  await getPool().query('INSERT INTO messages (id, session_id, role, content, meta) VALUES (?,?,?,?,?)', [
    userId, sessionId, 'user', content, JSON.stringify({ at: Date.now() } satisfies Meta)
  ]);

  const systemPrompt = `${(character?.persona ?? '')}\n${(prompt?.system ?? '')}`;
  const replyText = await callLLM({ 
    model, 
    systemPrompt, 
    userText: content, 
    history: allHistory,
    summary: summary || undefined
  });

  const styleGuide = character?.style_guide ? JSON.parse(character.style_guide) as { tone?: string } : {};
  const metrics = evaluateReply(replyText, styleGuide);

  const npcId = uuid();
  await getPool().query('INSERT INTO messages (id, session_id, role, content, meta) VALUES (?,?,?,?,?)', [
    npcId, sessionId, 'npc', replyText, JSON.stringify({ at: Date.now(), model, metrics } satisfies Meta)
  ]);

  res.json({
    user: { id: userId, sessionId, role: 'user', content },
    npc: { id: npcId, sessionId, role: 'npc', content: replyText, meta: { model, metrics } }
  });
});

app.post('/api/messages/compare', async (req: Request, res: Response) => {
  const { sessionId, content, models } = req.body as { sessionId: string; content: string; models: Array<'gemini'> };

  const [[session]] = await getPool().query('SELECT * FROM sessions WHERE id=?', [sessionId]) as any;
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const [[character]] = await getPool().query('SELECT * FROM characters WHERE id=?', [session.character_id]) as any;
  const [[prompt]] = await getPool().query('SELECT * FROM prompts WHERE id=?', [session.prompt_id]) as any;

  // 기존 대화 히스토리 가져오기
  const [historyRows] = await getPool().query(
    'SELECT role, content FROM messages WHERE session_id=? ORDER BY created_at ASC',
    [sessionId]
  ) as any;
  
  const history = historyRows.map((row: any) => ({
    role: row.role as 'user' | 'npc',
    content: row.content
  }));

  const summary = session.summary || undefined;

  const userId = uuid();
  await getPool().query('INSERT INTO messages (id, session_id, role, content, meta) VALUES (?,?,?,?,?)', [
    userId, sessionId, 'user', content, JSON.stringify({ at: Date.now(), compare: true } satisfies Meta)
  ]);

  const systemPrompt = `${(character?.persona ?? '')}\n${(prompt?.system ?? '')}`;

  const replies: Record<'gemini', { content: string; metrics: Metrics }> = {} as any;
  for (const m of models) {
    const replyText = await callLLM({ model: m, systemPrompt, userText: content, history, summary });
    const styleGuide = character?.style_guide ? JSON.parse(character.style_guide) as { tone?: string } : {};
    const metrics = evaluateReply(replyText, styleGuide);
    const npcId = uuid();
    await getPool().query('INSERT INTO messages (id, session_id, role, content, meta) VALUES (?,?,?,?,?)', [
      npcId, sessionId, 'npc', replyText, JSON.stringify({ at: Date.now(), model: m, metrics } satisfies Meta)
    ]);
    replies[m] = { content: replyText, metrics };
  }

  res.json({ user: { id: userId, content }, replies });
});

// ---------- Feedback ----------
app.post('/api/feedback', async (req: Request, res: Response) => {
  const { messageId, rating, comment } = req.body as { messageId: string; rating: number; comment?: string };
  const id = uuid();
  await getPool().query('INSERT INTO feedback (id, message_id, rating, comment) VALUES (?,?,?,?)', [
    id, messageId, rating, comment || null
  ]);
  res.json({ id, messageId, rating, comment });
});

// ---------- CSV Export ----------
app.get('/api/sessions/:id/export', async (req: Request, res: Response) => {
  const sessionId = req.params.id;
  const [msgs] = await getPool().query(
    'SELECT m.*, f.rating, f.comment FROM messages m LEFT JOIN feedback f ON m.id=f.message_id WHERE m.session_id=? ORDER BY m.created_at ASC',
    [sessionId]
  ) as any;

  const header = ['role','content','model','length','forbiddenHits','toneMatch','rating','comment'];
  const rows = msgs.map((m: any) => {
    const meta: Meta = m.meta ? JSON.parse(m.meta) : {};
    const metrics: Partial<Metrics> = meta.metrics || {};
    const csvSafe = (s: unknown) => `"${String(s ?? '').replace(/"/g,'""')}"`;
    return [
      m.role,
      csvSafe(m.content),
      meta.model ?? '',
      metrics.length ?? '',
      (metrics.forbiddenHits ?? []).join('|'),
      (typeof metrics.toneMatch === 'boolean') ? (metrics.toneMatch ? 'true' : 'false') : '',
      m.rating ?? '',
      csvSafe(m.comment ?? '')
    ].join(',');
  });
  const csv = [header.join(','), ...rows].join('\n');

  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition',`attachment; filename="session_${sessionId}.csv"`);
  res.send(csv);
});

// ---------- Boot ----------
(async () => {
  await initDB();
  app.listen(ENV.PORT, () => {
    console.log(`NPC ChatLab backend running on ${ENV.PORT}`);
  });
})();