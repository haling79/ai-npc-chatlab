import { useEffect, useState, useMemo } from 'react';
import { api } from './api';

type Model = 'gemini';

type MessageMeta = {
  at?: number;
  model?: Model;
  metrics?: {
    length: number;
    forbiddenHits: string[];
    toneMatch: boolean | null;
  };
  compare?: boolean;
};

type Message = {
  id: string;
  session_id?: string;
  role: 'user' | 'npc';
  content: string;
  meta?: MessageMeta;
};

type ModalState = {
  title: string;
  label: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid #ddd', padding: 12, marginBottom: 12 }}>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function InputModal({ title, label, onSubmit, onCancel, placeholder = '' }: {
  title: string;
  label: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  placeholder?: string;
}) {
  const [value, setValue] = useState('');

  const handleSubmit = () => {
    onSubmit(value);
    setValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          backgroundColor: 'white',
          padding: 24,
          borderRadius: 8,
          minWidth: 400,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>{title}</h3>
        <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
          {label}
        </label>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus
          style={{
            width: '100%',
            padding: 8,
            fontSize: 14,
            border: '1px solid #ccc',
            borderRadius: 4,
            boxSizing: 'border-box',
          }}
        />
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              border: '1px solid #ccc',
              borderRadius: 4,
              backgroundColor: 'white',
              cursor: 'pointer',
            }}
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: 4,
              backgroundColor: '#007bff',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [characters, setCharacters] = useState<any[]>([]);
  const [prompts, setPrompts] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);

  const [selectedChar, setSelectedChar] = useState<string>('');
  const [selectedPrompt, setSelectedPrompt] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>('');

  const [userInput, setUserInput] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<Model>('gemini');
  const [compareMode, setCompareMode] = useState<boolean>(false);
  const [compareReplies, setCompareReplies] = useState<Record<Model, { content: string; metrics: any }> | null>(null);

  // Modal state
  const [modal, setModal] = useState<ModalState | null>(null);

  const loadAll = async () => {
    const [c, p, s] = await Promise.all([
      api.get('/characters'),
      api.get('/prompts'),
      api.get('/sessions'),
    ]);
    setCharacters(c.data);
    setPrompts(p.data);
    setSessions(s.data);
  };
  useEffect(() => { loadAll(); }, []);

  const loadMessages = async (sid: string) => {
    const res = await api.get(`/messages/${sid}`);
    setMessages(res.data);
    setCompareReplies(null);
  };

  const createCharacter = () => {
    setModal({
      title: '캐릭터 생성',
      label: '캐릭터 이름을 입력하세요',
      placeholder: '예: 용감한 기사',
      onSubmit: (name) => {
        setModal({
          title: '페르소나 입력',
          label: '페르소나(설명)를 입력하세요 (선택사항)',
          placeholder: '예: 정의감 넘치는 기사',
          onSubmit: (persona) => {
            setModal({
              title: '톤 입력',
              label: '톤을 선택하세요',
              placeholder: 'gritty/formal/cheerful/neutral',
              onSubmit: async (tone) => {
                const res = await api.post('/characters', { 
                  name, 
                  persona: persona || '', 
                  styleGuide: { tone: tone || 'neutral' } 
                });
                setCharacters(prev => [...prev, res.data]);
                setModal(null);
              },
              onCancel: () => setModal(null)
            });
          },
          onCancel: () => setModal(null)
        });
      },
      onCancel: () => setModal(null)
    });
  };

  const createPrompt = () => {
    setModal({
      title: '프롬프트 생성',
      label: '프롬프트 이름을 입력하세요',
      placeholder: '예: 친절한 NPC',
      onSubmit: (name) => {
        setModal({
          title: '시스템 지침',
          label: '시스템 지침을 입력하세요 (선택사항)',
          placeholder: '예: 항상 친절하게 대답하세요',
          onSubmit: (system) => {
            setModal({
              title: '유저 템플릿',
              label: '유저 템플릿을 입력하세요',
              placeholder: '기본값: {{user}}',
              onSubmit: (userTemplate) => {
                setModal({
                  title: '버전 태그',
                  label: '버전 태그를 입력하세요',
                  placeholder: '예: v1, v2',
                  onSubmit: (versionTag) => {
                    setModal({
                      title: '메모',
                      label: '메모를 입력하세요 (선택사항)',
                      placeholder: '프롬프트에 대한 메모',
                      onSubmit: async (notes) => {
                        const res = await api.post('/prompts', { 
                          name, 
                          system: system || '', 
                          userTemplate: userTemplate || '{{user}}',
                          versionTag: versionTag || 'v1',
                          notes: notes || ''
                        });
                        setPrompts(prev => [...prev, res.data]);
                        setModal(null);
                      },
                      onCancel: () => setModal(null)
                    });
                  },
                  onCancel: () => setModal(null)
                });
              },
              onCancel: () => setModal(null)
            });
          },
          onCancel: () => setModal(null)
        });
      },
      onCancel: () => setModal(null)
    });
  };

  const createSession = () => {
    if (!selectedChar || !selectedPrompt) return alert('캐릭터와 프롬프트를 선택하세요.');
    setModal({
      title: '세션 생성',
      label: '세션 제목을 입력하세요',
      placeholder: '예: 첫 번째 대화',
      onSubmit: async (title) => {
        const res = await api.post('/sessions', { 
          characterId: selectedChar, 
          promptId: selectedPrompt, 
          title: title || 'Untitled' 
        });
        setSessions(prev => [res.data, ...prev]);
        setSessionId(res.data.id);
        setTimeout(() => loadMessages(res.data.id), 200);
        setModal(null);
      },
      onCancel: () => setModal(null)
    });
  };

  const currentDashboard = useMemo(() => {
    const byModel: Record<Model, Message[]> = { gemini: [] };
    for (const m of messages) {
      if (m.role === 'npc' && m.meta?.model) {
        byModel[m.meta.model].push(m);
      }
    }
    const calc = (arr: Message[]) => {
      if (!arr.length) return { avgLen: '-', forbCount: 0, toneRate: '-' };
      const avgLen = (arr.reduce((a, b) => a + (b.meta?.metrics?.length || 0), 0) / arr.length).toFixed(1);
      const forbCount = arr.reduce((a, b) => a + (b.meta?.metrics?.forbiddenHits?.length || 0), 0);
      const toneRate = (arr.filter(x => x.meta?.metrics?.toneMatch).length / arr.length * 100).toFixed(0) + '%';
      return { avgLen, forbCount, toneRate };
    };
    return {
      gemini: calc(byModel.gemini)
    };
  }, [messages]);

  const sendMessage = async () => {
    if (!sessionId) return alert('세션을 먼저 생성하세요.');
    if (!userInput.trim()) return;

    const content = userInput;
    setUserInput('');

    if (compareMode) {
      const res = await api.post('/messages/compare', { sessionId, content, models: ['gemini'] });
      setMessages(prev => [...prev, { id: 'local-'+Date.now(), role: 'user', content }]);
      setCompareReplies(res.data.replies);
      // 최신 메시지 다시 로드 (DB에 저장된 npc 응답 반영)
      setTimeout(()=>loadMessages(sessionId), 150);
    } else {
      const res = await api.post('/messages', { sessionId, content, model: selectedModel });
      setMessages(prev => [...prev, res.data.user, res.data.npc]);
    }
  };

  const giveFeedback = (messageId: string, star: number) => {
    setModal({
      title: '피드백 입력',
      label: '코멘트를 입력하세요 (선택사항)',
      placeholder: '이 응답에 대한 피드백을 남겨주세요',
      onSubmit: async (comment: string) => {
        await api.post('/feedback', { messageId, rating: star, comment: comment || '' });
        alert('피드백 저장 완료');
        setModal(null);
      },
      onCancel: () => setModal(null)
    });
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
      <h2>NPC ChatLab</h2>

      <Section title="캐릭터 관리">
        <button onClick={createCharacter}>캐릭터 추가</button>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <select value={selectedChar} onChange={e => setSelectedChar(e.target.value)}>
            <option value="">캐릭터 선택</option>
            {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <ul>
            {characters.map(c => {
              const guide = c.style_guide ? JSON.parse(c.style_guide) : c.styleGuide;
              return (
                <li key={c.id}>
                  <b>{c.name}</b> — tone: {guide?.tone} / persona: {c.persona}
                  <button
                    style={{ marginLeft: 8, color:'red' }}
                    onClick={async () => {
                      if (confirm(`${c.name} 캐릭터를 삭제할까요?`)) {
                        await api.delete(`/characters/${c.id}`);
                        setCharacters(prev => prev.filter(x => x.id !== c.id));
                        if (selectedChar === c.id) setSelectedChar('');
                      }
                    }}
                  >삭제</button>
                </li>
              );
            })}
          </ul>
        </div>
      </Section>

      <Section title="프롬프트 관리(A/B)">
        <button onClick={createPrompt}>프롬프트 추가</button>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <select value={selectedPrompt} onChange={e => setSelectedPrompt(e.target.value)}>
            <option value="">프롬프트 선택</option>
            {prompts.map(p => <option key={p.id} value={p.id}>{p.name} ({p.version_tag || p.versionTag})</option>)}
          </select>
          <ul>
            {prompts.map(p => (
              <li key={p.id}>
                <b>{p.name}</b> [{p.version_tag || p.versionTag}] — system: {(p.system || '').slice(0,80)}...
                <button
                  style={{ marginLeft: 8, color:'red' }}
                  onClick={async () => {
                    if (confirm(`${p.name} 프롬프트를 삭제할까요?`)) {
                      await api.delete(`/prompts/${p.id}`);
                      setPrompts(prev => prev.filter(x => x.id !== p.id));
                      if (selectedPrompt === p.id) setSelectedPrompt('');
                    }
                  }}
                >삭제</button>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section title="대화 샌드박스">
        <button onClick={createSession}>세션 생성</button>
        <div style={{ marginTop: 8 }}>
          <b>현재 세션:</b> {sessionId || '없음'}
        </div>

        <div style={{ marginTop: 8 }}>
          <label style={{ marginRight: 12 }}>
            <input type="checkbox" checked={compareMode} onChange={e => setCompareMode(e.target.checked)} />
            A/B 비교 모드
          </label>
          <button onClick={() => sessionId && window.open(`http://localhost:4000/api/sessions/${sessionId}/export`)}>
            CSV 다운로드
          </button>
        </div>

        <div style={{ border: '1px solid #ccc', minHeight: 200, padding: 8, marginTop: 8 }}>
          {messages.map(m => (
            <div key={m.id} style={{ marginBottom: 8 }}>
              <span style={{ color: m.role === 'npc' ? '#0a7' : '#07a' }}>[{m.role}]</span> {m.content}
              {m.role === 'npc' && (
                <div style={{ fontSize: '0.9em', color:'#555', marginLeft:20 }}>
                  {m.meta?.metrics && (
                    <>
                      길이: {m.meta.metrics.length} 단어 | 금지어: {m.meta.metrics.forbiddenHits?.length ? m.meta.metrics.forbiddenHits.join(', ') : '없음'} | 톤 일치: {m.meta.metrics.toneMatch ? 'O' : 'X'}
                    </>
                  )}
                  <div style={{ marginTop: 4 }}>
                    <label>피드백: </label>
                    {[1,2,3,4,5].map(star => (
                      <button key={star} onClick={() => giveFeedback(m.id, star)}>{star}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={userInput}
            onChange={e => setUserInput(e.target.value)}
            placeholder="메시지 입력"
            style={{ flex: 1 }}
          />
          <button onClick={sendMessage}>전송</button>
        </div>

        {compareReplies && (
          <div style={{ border:'1px solid #aaa', padding:8, marginTop:12 }}>
            <h4>Gemini 응답</h4>
            <p>{compareReplies.gemini?.content || '-'}</p>
          </div>
        )}
      </Section>

      <Section title="품질 대시보드">
        <table border={1} cellPadding={6}>
          <thead>
            <tr>
              <th>모델</th><th>평균 길이</th><th>금지어 발생</th><th>톤 일치율</th>
            </tr>
          </thead>
          <tbody>
            {(['gemini'] as Model[]).map(model => {
              const d = currentDashboard[model];
              return (
                <tr key={model}>
                  <td>{model}</td>
                  <td>{d.avgLen}</td>
                  <td>{d.forbCount}</td>
                  <td>{d.toneRate}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <Section title="세션 목록 / 로그 뷰어">
        <ul>
          {sessions.map(s => (
            <li key={s.id}>
              <button onClick={() => { setSessionId(s.id); loadMessages(s.id); }}>
                {s.title} — char:{s.character_id?.slice(0,6)} prompt:{s.prompt_id?.slice(0,6)}
              </button>
            </li>
          ))}
        </ul>
      </Section>

      {modal && (
        <InputModal
          title={modal.title}
          label={modal.label}
          placeholder={modal.placeholder}
          onSubmit={modal.onSubmit}
          onCancel={modal.onCancel}
        />
      )}
    </div>
  );
}