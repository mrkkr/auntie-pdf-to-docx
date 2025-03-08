import { NextRequest, NextResponse } from 'next/server'
import { Mistral } from '@mistralai/mistralai'

export async function POST(request: NextRequest) {
  try {
    const { fileId } = await request.json()

    if (!fileId) {
      return NextResponse.json(
        { error: 'No file ID provided' },
        { status: 400 }
      )
    }

    // Initialize Mistral client
    const apiKey = process.env.MISTRAL_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Mistral API key not configured' },
        { status: 500 }
      )
    }

    const client = new Mistral({ apiKey })

    // Get a signed URL for the uploaded file
    const signedUrl = await client.files.getSignedUrl({
      fileId: fileId,
    })

    console.log('Processing document from URL:', signedUrl.url)

    // Process the file with OCR
    const ocrResponse = (await client.ocr.process({
      model: 'mistral-ocr-latest',
      document: {
        type: 'document_url',
        documentUrl: signedUrl.url,
      },
      includeImageBase64: true, // Include base64-encoded images in response
    })) as any // Use 'any' type since Mistral's API might return different structures

    // Log response structure for debugging (remove sensitive data)
    console.log(
      'OCR Response structure:',
      JSON.stringify(
        {
          keys: Object.keys(ocrResponse),
          hasContent: !!ocrResponse.content,
          hasPages: Array.isArray(ocrResponse.pages),
          pagesCount: Array.isArray(ocrResponse.pages)
            ? ocrResponse.pages.length
            : 0,
        },
        null,
        2
      )
    )

    // The Mistral OCR response format may vary, we need to handle different structures
    if (ocrResponse.content) {
      // If the response has a content field, we return it directly
      return NextResponse.json({
        text: ocrResponse.content,
        hasContent: true,
      })
    } else if (ocrResponse.pages && Array.isArray(ocrResponse.pages)) {
      return NextResponse.json({
        text: JSON.stringify(ocrResponse),
        hasStructuredData: true,
      })
    } else {
      // Fallback: return the whole response as JSON string
      return NextResponse.json({
        text: JSON.stringify(ocrResponse),
        fallback: true,
      })
    }
  } catch (error) {
    console.error('Error processing document:', error)
    
    // Check if the error is related to file size or processing limitations
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage.includes('Request Entity Too Large') || 
        errorMessage.includes('Payload Too Large') ||
        errorMessage.includes('size limit')) {
      return NextResponse.json(
        { error: 'Document is too large to process. Please try a smaller file (under 10MB).' },
        { status: 413 }
      )
    }
    
    return NextResponse.json(
      { error: 'Failed to process document: ' + errorMessage },
      { status: 500 }
    )
  }
}
