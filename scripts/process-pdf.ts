import { config } from 'dotenv'
import { Mistral } from '@mistralai/mistralai'
import path from 'path'
import fs from 'fs'
import { 
  Document, 
  Paragraph, 
  HeadingLevel, 
  Packer, 
  ImageRun,
  TextRun,
  AlignmentType
} from 'docx'

// Load environment variables from .env.local
config({ path: '.env.local' })

function convertMarkdownToParagraphs(markdown: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = markdown.split('\n');
  
  let inList = false;
  let listItems: string[] = [];

  for (const line of lines) {
    // Handle headings
    if (line.startsWith('# ')) {
      paragraphs.push(new Paragraph({
        text: line.replace('# ', ''),
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 200 },
        alignment: AlignmentType.CENTER
      }));
    }
    else if (line.startsWith('## ')) {
      paragraphs.push(new Paragraph({
        text: line.replace('## ', ''),
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 150 },
        alignment: AlignmentType.LEFT
      }));
    }
    else if (line.startsWith('### ')) {
      paragraphs.push(new Paragraph({
        text: line.replace('### ', ''),
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 150, after: 100 }
      }));
    }
    // Handle lists
    else if (line.match(/^[*-] /)) {
      if (!inList) {
        inList = true;
        listItems = [];
      }
      listItems.push(line.replace(/^[*-] /, ''));
    }
    // Handle bold and italic text
    else if (line.trim()) {
      const runs: TextRun[] = [];
      let text = line;
      
      // Bold text
      text = text.replace(/\*\*(.*?)\*\*/g, (_, content) => {
        runs.push(new TextRun({ text: content, bold: true }));
        return '';
      });
      
      // Italic text
      text = text.replace(/\*(.*?)\*/g, (_, content) => {
        runs.push(new TextRun({ text: content, italics: true }));
        return '';
      });
      
      // Regular text
      if (text.trim()) {
        runs.push(new TextRun(text));
      }

      paragraphs.push(new Paragraph({ children: runs }));
    }
    // Handle end of list
    else if (inList && listItems.length > 0) {
      listItems.forEach((item, index) => {
        paragraphs.push(new Paragraph({
          text: item,
          bullet: {
            level: 0
          },
          spacing: { before: 100, after: index === listItems.length - 1 ? 100 : 0 }
        }));
      });
      inList = false;
      listItems = [];
    }
    // Handle blank lines
    else {
      paragraphs.push(new Paragraph({ text: '' }));
    }
  }

  return paragraphs;
}

async function processPdfToDocx(inputPath: string, outputPath?: string) {
  try {
    // Validate input file
    if (!fs.existsSync(inputPath)) {
      throw new Error('Input PDF file does not exist')
    }

    // Setup output path
    const defaultOutput = path.join(
      path.dirname(inputPath),
      `${path.basename(inputPath, '.pdf')}_processed.docx`
    )
    const finalOutputPath = outputPath || defaultOutput

    // Initialize Mistral client
    const apiKey = process.env.MISTRAL_API_KEY
    if (!apiKey) {
      throw new Error('MISTRAL_API_KEY is not defined in environment variables')
    }
    const client = new Mistral({ apiKey })

    console.log('Reading PDF file...')
    const fileBuffer = fs.readFileSync(inputPath)

    // Upload to Mistral
    console.log('Uploading to Mistral...')
    const uploadedFile = await client.files.upload({
      file: {
        fileName: path.basename(inputPath),
        content: fileBuffer,
      },
      purpose: 'ocr' as any,
    })

    // Get signed URL
    const signedUrl = await client.files.getSignedUrl({
      fileId: uploadedFile.id,
    })

    // Process with OCR
    console.log('Processing with OCR...')
    const ocrResponse = (await client.ocr.process({
      model: 'mistral-ocr-latest',
      document: {
        type: 'document_url',
        documentUrl: signedUrl.url,
      },
      includeImageBase64: true,
    })) as any

    // Create DOCX document with initial section
    console.log('Creating DOCX document...')
    const sections = [{
      properties: {},
      children: [
        new Paragraph({
          text: "Document Analysis",
          heading: HeadingLevel.HEADING_1
        })
      ]
    }]

    // Process OCR response
    if (ocrResponse.pages && Array.isArray(ocrResponse.pages)) {
      // Handle structured response with pages
      ocrResponse.pages.forEach((page: any) => {
        const pageChildren: Paragraph[] = [
          new Paragraph({
            text: `Page ${page.index + 1}`,
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 }
          })
        ]

        // Process images if available
        if (page.images && Array.isArray(page.images)) {
          page.images.forEach((img: { image_base64?: string; imageBase64?: string }) => {
            const base64Data = img.image_base64 || img.imageBase64
            if (base64Data) {
              try {
                const imageBuffer = Buffer.from(base64Data.split(',')[1], 'base64')
                pageChildren.push(
                  new Paragraph({
                    children: [
                      new ImageRun({
                        data: imageBuffer,
                        transformation: {
                          width: 500,
                          height: 300
                        }
                      })
                    ]
                  })
                )
              } catch (imgError) {
                console.warn('Failed to process image:', imgError)
              }
            }
          })
        }

        // Convert markdown content to formatted paragraphs
        const textContent = page.markdown || page.text || ''
        const formattedParagraphs = convertMarkdownToParagraphs(textContent)
        pageChildren.push(...formattedParagraphs)

        sections.push({
          properties: {},
          children: pageChildren
        })
      })
    } else {
      // Handle simple text response
      const content = ocrResponse.content || JSON.stringify(ocrResponse, null, 2)
      const formattedParagraphs = convertMarkdownToParagraphs(content)
      
      sections.push({
        properties: {},
        children: formattedParagraphs
      })
    }

    // Create document with all sections
    const doc = new Document({
      sections: sections
    })

    // Save the document
    console.log(`Saving DOCX to ${finalOutputPath}...`)
    const buffer = await Packer.toBuffer(doc)
    fs.writeFileSync(finalOutputPath, buffer)

    console.log('Processing complete!')
    return true
  } catch (error) {
    console.error('Error:', error)
    return false
  }
}

// Handle command line arguments
const args = process.argv.slice(2)
if (args.length === 0) {
  console.log('Usage: ts-node process-pdf.ts <input-pdf-path> [output-docx-path]')
  process.exit(1)
}

processPdfToDocx(args[0], args[1])
