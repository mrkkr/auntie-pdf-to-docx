import { Mistral } from '@mistralai/mistralai'

// Define max file size (5MB)
const MAX_FILE_SIZE = 80 * 1024 * 1024

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    console.log('file', file)

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 })
    }

    // Verify it's a PDF
    if (file.type !== 'application/pdf') {
      return Response.json(
        { error: 'Only PDF files are supported' },
        { status: 400 }
      )
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return Response.json(
        { error: 'File size exceeds the 10MB limit' },
        { status: 413 }
      )
    }

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload to Mistral
    const apiKey = process.env.MISTRAL_API_KEY
    if (!apiKey) {
      return Response.json(
        { error: 'Mistral API key not configured' },
        { status: 500 }
      )
    }

    const client = new Mistral({ apiKey })

    const uploadedFile = await client.files.upload({
      file: {
        fileName: file.name,
        content: buffer,
      },
      purpose: 'ocr' as any,
    })

    return Response.json({
      fileId: uploadedFile.id,
      fileName: uploadedFile.filename,
      fileSize: uploadedFile.sizeBytes,
    })
  } catch (error) {
    console.error('Error uploading file:', error)
    return Response.json({ error: 'Failed to upload file' }, { status: 500 })
  }
}
