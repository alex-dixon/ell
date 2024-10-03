import { z, ZodType } from 'zod'
import { ResponseFormatSchema, ResponseFormatValue } from '../lmp/types'

// Assuming _lstr is a string type for now
type _lstr = string
type _lstr_generic = _lstr | string

// We'll need to implement or import a proper image handling library

type Image = any

// determine how base models are being used in python
class BaseModel {}

type InvocableTool = (...args: any[]) => ToolResult | _lstr_generic | ContentBlock[]

class ToolResult {
  constructor(
    public tool_call_id: _lstr_generic,
    public result: ContentBlock[]
  ) {
    this.tool_call_id = tool_call_id
    this.result = result
  }
}

class ToolCall {
  constructor(
    public tool: InvocableTool,
    public params: any, //AnyZodSchema,
    public tool_call_id?: _lstr_generic
  ) {}

  call(): any {
    // Implementation
    return this.tool(...Object.values(this.params))
  }

  callAndCollectAsMessageBlock(): ContentBlock {
    const res = this.tool(...Object.values(this.params), {
      _tool_call_id: this.tool_call_id,
    })
    return new ContentBlock({ tool_result: res })
  }

  callAndCollectAsMessage(): Message {
    return new Message('user', [this.callAndCollectAsMessageBlock()])
  }
}

class ContentBlock {
  text?: _lstr_generic

  image?: Image | string

  image_detail?: string

  audio?: number[] | Float32Array

  tool_call?: ToolCall

  parsed?: BaseModel

  tool_result?: ToolResult

  constructor(data: Partial<ContentBlock>) {
    Object.assign(this, data)
    this.validateSingleNonNull()
  }

  private validateSingleNonNull(): void {
    // todo. see if we can define the keys of this sparsely here...it's iterating over keys with values of undefined
    const nonNullFields = Object.entries(this)
      .filter(([_, value]) => value !== null && value !== undefined)
      .map(([key, _]) => key)

    if (
      nonNullFields.length > 1 &&
      !(nonNullFields.length === 2 && nonNullFields.includes('image') && nonNullFields.includes('image_detail'))
    ) {
      throw new Error(
        `Only one field can be non-null (except for image with image_detail). Found: ${nonNullFields.join(', ')}`
      )
    }
  }

  get type(): string | null {
    if (this.text !== undefined) return 'text'
    if (this.image !== undefined) return 'image'
    if (this.audio !== undefined) return 'audio'
    if (this.tool_call !== undefined) return 'tool_call'
    if (this.parsed !== undefined) return 'parsed'
    if (this.tool_result !== undefined) return 'tool_result'
    return null
  }

  static coerce(content: string | ToolCall | ToolResult | BaseModel | ContentBlock | Image): ContentBlock {
    if (content instanceof ContentBlock) return content
    if (typeof content === 'string') return new ContentBlock({ text: content })
    if (content instanceof ToolCall) return new ContentBlock({ tool_call: content })
    if (content instanceof ToolResult) return new ContentBlock({ tool_result: content })
    if (content instanceof BaseModel) return new ContentBlock({ parsed: content })
    if (content instanceof Image) return new ContentBlock({ image: content })
    throw new Error(`Invalid content type: ${typeof content}`)
  }

  // Implement image validation and serialization methods as needed
}

function coerceContentList(
  content?: string | ContentBlock[] | (string | ContentBlock | ToolCall | ToolResult | BaseModel)[],
  contentBlockKwargs: Partial<ContentBlock> = {}
): ContentBlock[] {
  if (!content) {
    return [new ContentBlock(contentBlockKwargs)]
  }

  if (!Array.isArray(content)) {
    content = [content]
  }

  return content.map((c) => ContentBlock.coerce(c))
}

class Message<ResponseFormat extends ResponseFormatSchema | string | Image = string | Image> extends BaseModel {
  content: ContentBlock[]

  constructor(
    public role: string,
    content: string | ContentBlock[] | Array<string | ContentBlock | ToolCall | ToolResult | BaseModel>,
    contentBlockKwargs: Partial<ContentBlock> = {}
  ) {
    super()
    this.role = role
    this.content = coerceContentList(content, contentBlockKwargs)
  }

  get text(): string | undefined {
    return this.content.map((c) => c.text || `<${c.type}>`).join('\n')
  }

  get images(): Image[] | undefined {
    const images = this.content.filter((c) => c.image).map((c) => c.image as Image)
    return images.length ? images : undefined
  }

  get audios(): (number[] | Float32Array)[] | undefined {
    const audios = this.content.filter((c) => c.audio).map((c) => c.audio as number[] | Float32Array)
    return audios.length ? audios : undefined
  }

  get textOnly(): string | undefined {
    const textOnly = this.content.filter((c) => c.text).map((c) => c.text)
    return textOnly.length ? textOnly.join('\n') : undefined
  }

  get toolCalls(): ToolCall[] | undefined {
    const toolCalls = this.content.filter((c) => c.tool_call).map((c) => c.tool_call as ToolCall)
    return toolCalls.length ? toolCalls : undefined
  }

  get toolResults(): ToolResult[] | undefined {
    const toolResults = this.content.filter((c) => c.tool_result).map((c) => c.tool_result as ToolResult)
    return toolResults.length ? toolResults : undefined
  }

  get parsed(): ResponseFormat extends ResponseFormatSchema ? ResponseFormatValue<ResponseFormat> : BaseModel[] {
    const parsedContent = this.content.filter((c) => c.parsed).map((c) => c.parsed as BaseModel)
    // @ts-ignore
    return parsedContent.length === 1
      ? (parsedContent[0] as unknown as ResponseFormatValue<ResponseFormat>)
      : parsedContent
  }

  async callToolsAndCollectAsMessage(parallel: boolean = false, maxWorkers?: number): Promise<Message> {
    let content: ContentBlock[]
    if (parallel) {
      content = await Promise.all(
        this.content.filter((c) => c.tool_call).map((c) => c.tool_call!.callAndCollectAsMessageBlock())
      )
    } else {
      content = this.content.filter((c) => c.tool_call).map((c) => c.tool_call!.callAndCollectAsMessageBlock())
    }
    return new Message('user', content)
  }
}

// Helper functions
export function system(content: string | ContentBlock[]): Message {
  return new Message('system', content)
}

export function user(content: string | ContentBlock[]): Message {
  return new Message('user', content)
}

export function assistant(content: string | ContentBlock[]): Message {
  return new Message('assistant', content)
}

// Type definitions
export type LMPParams = Record<string, any>
export type MessageOrDict = Message | Record<string, string>
export type Chat = Message[]
export type MultiTurnLMP = (...args: any[]) => Chat
export type OneTurn = (...args: any[]) => _lstr_generic
export type ChatLMP = (chat: Chat, ...args: any[]) => Chat
export type LMP = OneTurn | MultiTurnLMP | ChatLMP
export type InvocableLM = (...args: any[]) => _lstr_generic

export { Message, ContentBlock, ToolCall, ToolResult }
