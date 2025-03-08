'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface DocumentChatProps {
  documentContent: string
  isEnabled: boolean
}

// Prepare document content by removing large assets
const prepareDocumentContent = (
  content: string
): { text: string; wasTruncated: boolean } => {
  // Remove base64 encoded images - they consume too many tokens
  let cleanedContent = content.replace(
    /data:image\/[^;]+;base64,[a-zA-Z0-9+/=]+/g,
    '[IMAGE]'
  )

  // Remove any remaining image references in markdown
  cleanedContent = cleanedContent.replace(
    /!\[.*?\]\(.*?\)/g,
    '[IMAGE REFERENCE]'
  )

  // Remove potential JSON content that might be too large
  cleanedContent = cleanedContent.replace(
    /{[^}]*"imageBase64"[^}]*}/g,
    '[IMAGE DATA]'
  )

  // Estimate token count (rough approximation: 4 chars ≈ 1 token)
  const estimatedTokens = cleanedContent.length / 4

  // Truncate if still likely to exceed limits (leaving room for system prompt and response)
  const maxContentTokens = 20000
  let wasTruncated = false

  if (estimatedTokens > maxContentTokens) {
    // Truncate to approximate max tokens, prioritizing beginning of document
    const charsToKeep = maxContentTokens * 4
    cleanedContent =
      cleanedContent.substring(0, charsToKeep) +
      '\n\n[Document truncated due to length limits. Above is the beginning portion of the document.]'
    wasTruncated = true
  }

  return {
    text: cleanedContent,
    wasTruncated,
  }
}

export function DocumentChat({
  documentContent,
  isEnabled,
}: DocumentChatProps) {
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wasTruncated, setWasTruncated] = useState(false)
  const [preparedContent, setPreparedContent] = useState<string>('')

  // Process document content when it changes
  useEffect(() => {
    if (documentContent) {
      const { text, wasTruncated } = prepareDocumentContent(documentContent)
      setPreparedContent(text)
      setWasTruncated(wasTruncated)
    }
  }, [documentContent])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!query.trim() || !isEnabled || !preparedContent) return

    // Add user message
    const userMessage: Message = { role: 'user', content: query }
    setMessages((prevMessages) => [...prevMessages, userMessage])

    // Clear input and reset error
    setQuery('')
    setError(null)
    setIsLoading(true)

    try {
      // Call the chat API with prepared content
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentContent: preparedContent, // Send clean content only
          query: userMessage.content,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to get response')
      }

      const data = await response.json()

      // Add assistant response to messages
      const assistantMessage: Message = {
        role: 'assistant',
        content: data.answer,
      }

      setMessages((prevMessages) => [...prevMessages, assistantMessage])
    } catch (err) {
      console.error('Error in document chat:', err)
      setError(err instanceof Error ? err.message : 'An unknown error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className='w-full space-y-4'>
      {wasTruncated && (
        <Alert className='bg-amber-50 border-amber-200'>
          <AlertCircle className='h-4 w-4 text-amber-600' />
          <AlertTitle className='text-amber-800'>
            Large Document Detected
          </AlertTitle>
          <AlertDescription className='text-amber-700'>
            This document is quite large and has been optimized for analysis.
            Some content (like images) has been removed, and only the beginning
            portion is being used. For best results, ask questions about content
            near the beginning of the document.
          </AlertDescription>
        </Alert>
      )}

      <div className='border rounded-md bg-white p-4 max-h-[400px] overflow-y-auto'>
        {messages.length === 0 ? (
          <div className='text-center text-gray-500 p-6'>
            <p>
              Ask questions about your document to get insights and information.
            </p>
          </div>
        ) : (
          <div className='space-y-4'>
            {messages.map((message, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg ${
                  message.role === 'user'
                    ? 'bg-blue-50 border border-blue-100 ml-8'
                    : 'bg-gray-50 border border-gray-100 mr-8'
                }`}
              >
                <p className='text-xs font-medium mb-1'>
                  {message.role === 'user' ? 'You' : 'Assistant'}
                </p>
                <p className='whitespace-pre-line'>{message.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className='p-3 rounded-md bg-red-50 border border-red-200 text-red-700'>
          <p className='text-sm'>{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className='flex space-x-2'>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Ask a question about your document...'
          className='flex-1'
          disabled={!isEnabled || isLoading}
        />
        <Button
          type='submit'
          disabled={!isEnabled || isLoading || !query.trim()}
        >
          {isLoading ? 'Thinking...' : 'Ask'}
        </Button>
      </form>
    </div>
  )
}
