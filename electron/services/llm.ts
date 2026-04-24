import axios from 'axios'
import log from 'electron-log'

export class LlmService {
  private static instance: LlmService
  private endpoint: string = 'http://localhost:1234'

  private constructor() {}

  static getInstance(): LlmService {
    if (!LlmService.instance) {
      LlmService.instance = new LlmService()
    }
    return LlmService.instance
  }

  setEndpoint(url: string) {
    this.endpoint = url.replace(/\/$/, '')
  }

  async checkAvailability(): Promise<boolean> {
    try {
      // LM Studio / OpenAI compatible check
      const resp = await axios.get(`${this.endpoint}/v1/models`, { timeout: 2000 })
      return resp.status === 200
    } catch (err) {
      return false
    }
  }

  async translate(text: string): Promise<string> {
    try {
      if (!/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(text)) {
        return text
      }

      log.info(`[LLM] Translating Korean prompt via LM Studio: ${text}`)
      
      const systemPrompt = "Translate the following Korean text to English for a Stable Diffusion prompt. Return only the translated English text without any quotes or explanations."
      
      const resp = await axios.post(`${this.endpoint}/v1/chat/completions`, {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text }
        ],
        temperature: 0.3,
        max_tokens: 150,
        stream: false
      })

      const translated = resp.data.choices?.[0]?.message?.content?.trim()
      if (translated) {
        log.info(`[LLM] Translation success: ${translated}`)
        return translated
      }
      return text
    } catch (err) {
      log.warn(`[LLM] Translation failed, using original: ${err}`)
      return text
    }
  }
}
