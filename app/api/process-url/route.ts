import { NextRequest, NextResponse } from 'next/server'
import { Mistral } from '@mistralai/mistralai'

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()

    if (!url) {
      return NextResponse.json(
        { error: 'No document URL provided' },
        { status: 400 }
      )
    }

    // Validate URL format
    try {
      new URL(url)
    } catch (e) {
      console.error('Invalid URL format:', e)
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      )
    }

    // Check if URL potentially points to a PDF
    // This is a simple check, not foolproof but helps prevent obvious non-PDF URLs
    if (!url.toLowerCase().endsWith('.pdf') && !url.toLowerCase().includes('/pdf/')) {
      console.warn('URL may not be a PDF:', url)
      // We'll still try to process it, but log a warning
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

    console.log('Processing document from public URL:', url)

    // Process the file with OCR directly from the URL
    const ocrResponse = (await client.ocr.process({
      model: 'mistral-ocr-latest',
      document: {
        type: 'document_url',
        documentUrl: url,
      },
      includeImageBase64: true, // Include base64-encoded images in response
    })) as any // Use 'any' type since Mistral's API might return different structures

    // Log response structure for debugging (remove sensitive data)
    console.log(
      'OCR Response structure from URL:',
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
        pages: ocrResponse.pages,
        hasStructuredData: true,
      })
    } else {
      // Fallback case - return the whole response
      return NextResponse.json({
        text: JSON.stringify(ocrResponse),
        hasStructuredData: false,
      })
    }
  } catch (error) {
    console.error('Error processing document from URL:', error)
    
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
      { error: 'Failed to process document from URL: ' + errorMessage },
      { status: 500 }
    )
  }
} 