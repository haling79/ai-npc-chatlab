import { GoogleGenerativeAI } from '@google/generative-ai';
import { ENV } from './env.js';

const genAI = new GoogleGenerativeAI(ENV.GOOGLE_API_KEY);

type ChatMessage = {
  role: 'user' | 'model';
  parts: string;
};

// 대화 히스토리 요약 함수 - Gemini를 사용하여 요약
export async function summarizeConversation(messages: Array<{ role: 'user' | 'npc'; content: string }>): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        maxOutputTokens: 300,
        temperature: 0.3,
      }
    });

    const conversationText = messages.map(m => 
      `${m.role === 'user' ? '사용자' : 'NPC'}: ${m.content}`
    ).join('\n');

    const prompt = `다음은 NPC와의 대화 내용입니다. 이 대화의 핵심 내용과 맥락을 5-6문장으로 요약해주세요. 
중요한 사건, 결정, 인물 간의 관계 변화, 주요 정보 등을 포함하세요:

${conversationText}

요약:`;

    const result = await model.generateContent(prompt);
    const summary = result.response.text();
    
    console.log(`[LLM] Conversation summarized: ${messages.length} messages -> ${summary.length} chars`);
    return summary;
  } catch (error) {
    console.error('[LLM] Summary error:', error);
    return '이전 대화 내용이 있습니다.';
  }
}

export async function callLLM(params: {
  model: 'gemini';
  systemPrompt: string;
  userText: string;
  history?: Array<{ role: 'user' | 'npc'; content: string }>;
  summary?: string;
}): Promise<string> {
  const { systemPrompt, userText, history = [], summary } = params;

  try {
    const startTime = Date.now();
    
    // 요약이 있으면 시스템 프롬프트에 추가
    let enhancedSystemPrompt = systemPrompt;
    if (summary) {
      enhancedSystemPrompt = `${systemPrompt}\n\n[이전 대화 요약]\n${summary}`;
    }
    
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash-exp',
      systemInstruction: enhancedSystemPrompt,
      generationConfig: {
        maxOutputTokens: 150,
        temperature: 0.7,
      }
    });

    // 최근 15개 메시지만 원문으로 사용
    const recentHistory = history.slice(-15);

    // 히스토리를 Gemini 형식으로 변환
    let chatHistory: ChatMessage[] = recentHistory.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: msg.content
    }));

    // Gemini API는 첫 번째 메시지가 반드시 'user'여야 함
    // 첫 메시지가 'model'이면 제거
    if (chatHistory.length > 0 && chatHistory[0].role === 'model') {
      console.log(`[LLM] Removing first message (role: model) to comply with Gemini API requirements`);
      chatHistory = chatHistory.slice(1);
    }

    console.log(`[LLM] Request - User: "${userText.substring(0, 50)}..." (${userText.length} chars)`);
    console.log(`[LLM] System prompt length: ${enhancedSystemPrompt.length} chars`);
    console.log(`[LLM] Recent history: ${recentHistory.length} messages (total: ${history.length})`);
    console.log(`[LLM] Has summary: ${!!summary}`);
    
    // 타임아웃 추가
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Gemini API timeout after 10s')), 10000);
    });

    let result;
    
    if (chatHistory.length > 0) {
      // 히스토리가 있으면 chat 세션 사용
      const chat = model.startChat({
        history: chatHistory.map(msg => ({
          role: msg.role,
          parts: [{ text: msg.parts }]
        }))
      });
      
      result = await Promise.race([
        chat.sendMessage(userText),
        timeoutPromise
      ]);
    } else {
      // 히스토리가 없으면 일반 generateContent 사용
      result = await Promise.race([
        model.generateContent(userText),
        timeoutPromise
      ]);
    }
    
    const response = result.response;
    const text = response.text();
    
    const elapsed = Date.now() - startTime;
    console.log(`[LLM] SUCCESS in ${elapsed}ms - Response: "${text.substring(0, 50)}..." (${text.length} chars)`);
    
    return text || '';
  } catch (error: any) {
    console.error('=== Gemini API ERROR ===');
    console.error('Error type:', error?.constructor?.name);
    console.error('Error message:', error?.message);
    console.error('Error details:', error);
    console.error('========================');
    return 'Error: Unable to generate response';
  }
}