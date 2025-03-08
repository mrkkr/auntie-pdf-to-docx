import { NextResponse } from 'next/server'
import { Mistral } from '@mistralai/mistralai'

// Initialize Mistral client
const initMistralClient = () => {
  const apiKey = process.env.MISTRAL_API_KEY

  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY is not defined in environment variables')
  }

  return new Mistral({ apiKey })
}

export async function POST(request: Request) {
  try {
    const { documentContent, query } = await request.json()

    if (!documentContent) {
      return NextResponse.json(
        { error: 'Document content is required' },
        { status: 400 }
      )
    }

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    // Initialize Mistral client
    const client = initMistralClient()

    // Call Mistral API
    const chatResponse: any = await client.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful assistant that answers questions about documents. Answer based only on the document content provided. If the answer cannot be found in the document, say so clearly.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Here is the document content:\n\n${documentContent}\n\nUser question: ${query}`,
            },
          ],
        },
      ],
    })

    // Extract the response
    const answer = chatResponse.choices[0].message.content

    return NextResponse.json({ answer })
  } catch (error) {
    console.error('Error in document chat:', error)

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'An unknown error occurred',
      },
      { status: 500 }
    )
  }
}
