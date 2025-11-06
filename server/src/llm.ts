import { GoogleGenerativeAI } from '@google/generative-ai';
import { ENV } from './env.js';

const genAI = new GoogleGenerativeAI(ENV.GOOGLE_API_KEY);

type ChatMessage = {
  role: 'user' | 'model';
  parts: string;
};

// 대화 히스토리 축약 함수
function summarizeHistory(history: ChatMessage[], maxMessages: number = 10): ChatMessage[] {
  if (history.length <= maxMessages) {
    return history;
  }
  
  // 최근 N개 메시지만 유지
  return history.slice(-maxMessages);
}

export async function callLLM(params: {
  model: 'gemini';
  systemPrompt: string;
  userText: string;
  history?: Array<{ role: 'user' | 'npc'; content: string }>;
}): Promise<string> {
  const { systemPrompt, userText, history = [] } = params;

  try {
    const startTime = Date.now();
    
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash-exp',
      systemInstruction: systemPrompt,
      generationConfig: {
        maxOutputTokens: 150,
        temperature: 0.7,
      }
    });

    // 히스토리를 Gemini 형식으로 변환
    const chatHistory: ChatMessage[] = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: msg.content
    }));

    // 히스토리가 너무 길면 축약
    const summarizedHistory = summarizeHistory(chatHistory, 10);

    console.log(`[LLM] Request - User: "${userText.substring(0, 50)}..." (${userText.length} chars)`);
    console.log(`[LLM] System prompt length: ${systemPrompt.length} chars`);
    console.log(`[LLM] History messages: ${summarizedHistory.length} (original: ${history.length})`);
    
    // 타임아웃 추가
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Gemini API timeout after 10s')), 10000);
    });

    let result;
    
    if (summarizedHistory.length > 0) {
      // 히스토리가 있으면 chat 세션 사용
      const chat = model.startChat({
        history: summarizedHistory.map(msg => ({
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